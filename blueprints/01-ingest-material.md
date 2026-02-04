# Blueprint: Ingest Material (Deduped)
Goal: Add PDFs/slides without wasting Gemini credits.

## Steps
1) Hash file
2) Check Supabase for existing source_hash
3) If exists -> link + stop
4) Else -> create source_material + extraction_job (pending)
5) Analyze (three-phase Gemini pipeline) -> store analysis_json
6) Generate questions -> per-topic Gemini calls with enriched context
7) Mark job complete/fail

## Analysis Pipeline (v2, schema_version: 2)

Three sequential phases replace the original single Gemini call:

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

### Question Generation Pipeline (v3, 3-stage)

Three-stage pipeline replacing the v2 generate-and-rewrite-in-place approach:

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
- `normalizeAnalysis()` in generate-questions wraps v1 data with empty v2 fields for backward compatibility

## Edge Cases
- Huge PDFs -> chunked base64 encoding (32KB chunks)
- Re-uploads with new name -> hash catches it
- Invalid model JSON -> one repair retry then accept best-effort with warnings
- Phase C section failure -> fallback stub topic from outline data
- V1 analysis data -> normalizeAnalysis wraps with defaults, no crash
