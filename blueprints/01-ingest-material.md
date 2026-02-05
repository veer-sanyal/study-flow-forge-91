# Blueprint: Ingest Material (Deduped)
Goal: Add PDFs/slides without wasting Gemini credits.

## Steps
1) Hash file
2) Check Supabase for existing source_hash
3) If exists -> link + stop
4) Else -> create source_material + extraction_job (pending)
5) Analyze (v4 pipeline by default) -> store analysis_json + analysis_json_v4
6) Generate questions -> per-topic Gemini calls with grounded context
7) Mark job complete/fail

---

## Analysis Pipeline (v4, schema_version: 4) — DEFAULT

The v4 pipeline fixes the root cause of low-quality questions: shallow chunk summarization that loses question-ready details. V4 extracts **atomic facts with evidence grounding** in Phase A while we still have access to the PDF.

### Phase A: Question-Ready Extraction (sends base64)
- **Only call that sends the base64 document** to Gemini
- Output: `QuestionReadyChunk[]` with:
  - `evidence_spans[]`: Exact text excerpts (<= 50 words) with span_ids
  - `atomic_facts[]`: Single testable statements with fact_ids, linked to evidence
  - `definitions[]`: Term + definition pairs with evidence links
  - `formulas[]`: Complete formulas with variable bindings and conditions
  - `constraints[]`: Rules, limits, conditions
  - `worked_examples[]`: Full problems with given values, steps, final answer
  - `common_misconceptions[]`: What students get wrong, with misconception_ids
  - `content_density`: sparse | normal | dense
  - `question_potential`: low | medium | high
- Config: temperature 0.1, maxOutputTokens 65536
- Stored in `analysis_json_v4.question_ready_chunks`
- Also populates backward-compat `ChunkSummary[]` in `analysis_json`

### Phase B: Coarse Outline
- Text-only call using Phase A summaries (no base64)
- Output: `OutlineSection[]` (section_title, page_range, subtopics) + course_guess
- Config: temperature 0.1, maxOutputTokens 4096
- Stored in `analysis_json_v4.outline`

### Phase C: Topic Mapping (parallel)
- Uses **pre-extracted facts** from Phase A (not thin summaries)
- Maps facts to topic structure with learning objectives
- Light extraction: organizes already-extracted content
- Config: temperature 0.2, maxOutputTokens 8192 per section
- Stored in `analysis_json_v4.topics`

### Evidence Linking Validation
After Phase A:
- Every atomic_fact must have valid evidence_span_id
- Every formula must have variable bindings
- Every worked_example must have steps and final_answer
- Warnings logged if links broken; repair call attempted

---

## Analysis Pipeline (v2, schema_version: 2) — LEGACY

Available via `pipelineVersion: 2` parameter. Uses shallow chunk summarization.

### Phase A: Chunk Summarization
- **Only call that sends the base64 document** to Gemini
- Output: `ChunkSummary[]` (index, type, 2-3 sentence summary, key_terms)
- Config: temperature 0.1, maxOutputTokens 16384
- Stored in `analysis_json.chunk_summaries`

### Phase B: Coarse Outline
- Text-only call using Phase A summaries (no base64)
- Output: `OutlineSection[]` (section_title, page_range, subtopics) + course_guess
- Config: temperature 0.1, maxOutputTokens 4096
- Stored in `analysis_json.outline`

### Phase C: Per-Section Extraction (parallel)
- One call per outline section, using only that section's chunk summaries
- Extracts full AnalyzedTopicV2: difficulty evidence, key_terms, formulas, misconceptions, example_questions, question_type_distribution, measurable-verb objectives
- Config: temperature 0.2, maxOutputTokens 8192 per section
- Calls staggered by 500ms, run via Promise.all
- Stored in `analysis_json.topics`

### Validation + Repair
After each phase's JSON parse:
1. Validate required fields, min lengths, verb compliance, proportion sums
2. If issues: one repair call with targeted fix instructions
3. If repair still has issues: accept best-effort with warnings logged

### Measurable Verb Enforcement (Phase C)
- Allowed: calculate, compute, derive, solve, evaluate, simplify, prove, explain, describe, summarize, compare, contrast, differentiate, classify, apply, demonstrate, predict, estimate, analyze, diagnose, interpret, critique, design, construct, synthesize, formulate, identify, list, define, label, recall, state, recognize
- Banned: understand, know, learn, appreciate, be aware of, grasp, comprehend

## Question Generation

### Question Generation Pipeline (v4, 4-stage) — DEFAULT

Four-stage pipeline with mandatory grounding when v4 analysis available.

#### Stage 1: Grounded Generation (temp 0.5)
- Uses `QuestionReadyChunk[]` context with evidence_span_ids and fact_ids
- **Mandatory citation**: Every question must include `source_evidence` with:
  - `evidence_span_ids[]`: References to evidence spans
  - `fact_ids[]`: References to atomic facts
  - `page_refs[]`: Page numbers
- **Grounding check**: `grounding_check` with:
  - `all_facts_cited`: boolean
  - `uses_material_context`: boolean (not generic filler)
  - `reasoning_steps`: number (>= 2 for non-definition questions)
- **Distractor rationales**: Array with `misconception_id` references
- Uses `CANDIDATE_SCHEMA_V4`
- Generates ~150% of desired count

#### Stage 2: 8-Dimension Quality Judge (temp 0.2)
- Binary (0/1):
  - `grounded`: Has evidence_span_ids citations
  - `answerable_from_context`: Can answer from material only
  - `has_single_clear_correct`: Unambiguous correct answer
  - `format_justified`: Optimal question format
- Likert (1-5):
  - `non_trivial`: Requires multiple reasoning steps
  - `distractors_plausible`: Based on documented misconceptions
  - `clarity`: Clear stem, defined symbols
  - `context_authentic`: Uses material examples, not filler
- **V4 Scoring**: binary_score (max 6 @ 1.5 weight) + likert_score (max 4) = total /10
- **Hard rejection triggers**:
  - `evidence_span_ids.length === 0`
  - `reasoning_steps < 2` (unless definition question)
  - `uses_material_context === false`
  - MCQ without `distractor_rationales[]`
- Verdict: keep (ALL binary=1, non_trivial>=3, avg_likert>=3.5), repair (3+ binary=1, avg>=2.0), reject

#### Stage 3: Repair Pass (temp 0.4)
- Same as v3, plus v4-specific repairs:
  - Add missing evidence citations
  - Improve reasoning steps
  - Add distractor rationales

#### Stage 4: Insert
- Stores `source_evidence` jsonb and `grounding_score` numeric
- Stores v4 `quality_flags` with 8 dimensions + `pipeline_version: 4`

---

### Question Generation Pipeline (v3, 3-stage) — LEGACY

Used when only v2 analysis available.

#### Stage A: Generation (temp 0.5)
- Generates ~150% of desired count to account for rejection
- MCQ-first bias: 80-90% mcq_single, mcq_multi only for "select all", short_answer only for derivations
- Difficulty distribution target: 40% easy, 40% medium, 20% hard
- Uses `CANDIDATE_SCHEMA` with `type` field (replaces `answer_format`)
- Each question includes `why_this_question` linking to specific material content

#### Stage B: Quality Judge with Rejection (temp 0.2)
- 6-dimension scoring per question:
  - Binary (0/1): `answerable_from_context`, `has_single_clear_correct`, `format_justified`
  - Likert (1-5): `distractors_plausible`, `clarity`, `difficulty_appropriate`
- Composite score: binary dims x2 (max 6) + normalized Likert (max 4) = total /10
- Verdict rules: keep (score >= 7), repair (score >= 4), reject (score < 4)
- LLM verdict overridden by numeric score via `resolveVerdict()`
- Partitions into 3 buckets: kept, toRepair, rejected

#### Stage C: Repair Pass (temp 0.4, only if repairs needed)
- Per-question repair instructions based on specific issues
- Format conversion: unjustified short_answer -> mcq_single with 4 misconception-based choices
- Clarity fixes: tighten stem, define symbols
- Distractor fixes: replace weak distractors with misconception-based options
- Structural re-validation (stem >10 chars, non-empty solution_steps, MCQ has 4 choices)
- Pass -> add to repaired list. Fail -> increment rejected count.

#### Insert
- Combines kept + repaired, sorts by score descending, caps at MAX_QUESTIONS_PER_TOPIC (8)
- Maps `type` to DB `question_format`: mcq_single/mcq_multi -> "multiple_choice", short_answer -> "short_answer"
- Stores `quality_score` and `quality_flags` (all 6 dimensions + issues + pipeline_version + was_repaired)

### Per-Topic Generation (fixes all-topics[0] bug)
- Questions generated one topic at a time via separate Gemini calls
- Each question inserted with correct `topic_ids: [dbTopic.id]`

### Fuzzy Topic Matching
DB topics matched to analysis topics via (in priority order):
1. Case-insensitive exact title match
2. Topic code match
3. Substring containment (either direction)
4. Keyword overlap scoring (threshold > 0.3)

### Enriched Context (v2)
Per-topic Gemini prompts include: key_terms, formulas, common_misconceptions (as MCQ distractors), example_questions (as seeds), chunk_summaries (for grounding), difficulty_signals, question_type_distribution (for type proportions)

## Schema Versioning
- `schema_version: 1` = legacy single-call analysis (flat topics)
- `schema_version: 2` = three-phase pipeline (enriched topics, chunk_summaries, outline)
- `schema_version: 4` = question-ready facts pipeline (atomic_facts, evidence_spans, formulas with bindings)
- `normalizeAnalysis()` in generate-questions:
  - Prefers `analysis_json_v4` if available
  - Falls back to `analysis_json` (v2) or wraps v1 data

## Database Columns (v4)
- `course_materials.analysis_json_v4`: V4 analysis with question_ready_chunks
- `chunk_extraction_cache`: Cached extracted chunks by doc_hash
- `questions.source_evidence`: Evidence span/fact IDs cited by question
- `questions.grounding_score`: 0-1 score based on evidence citations

## Edge Cases
- Huge PDFs -> chunked base64 encoding (32KB chunks)
- Re-uploads with new name -> hash catches it
- Invalid model JSON -> one repair retry then accept best-effort with warnings
- Phase C section failure -> fallback stub topic from outline data
- V1/V2 analysis data -> normalizeAnalysis wraps with defaults, uses v3 question pipeline
- V4 analysis without evidence -> question rejected by hard triggers
