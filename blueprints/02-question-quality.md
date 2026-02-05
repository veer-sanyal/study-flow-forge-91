# Blueprint: Question Quality Pipeline

Goal: Ensure generated questions meet minimum quality thresholds before reaching the DB. Filter out bad questions, repair fixable ones, store quality metadata for downstream use.

---

## V5 Evidence-Based Pipeline (Current - 2-Call Workflow)

The best approach: **"Evidence → One Claim → One MCQ"**

Instead of "generate 30 questions," we do a tight loop:
1. **Extract testable facts** with exact evidence (quotes) from a small chunk (1–2 pages)
2. **Pick one fact/claim**
3. **Generate ONE MCQ** grounded in that evidence, with an option audit
4. If it fails the audit, the model rewrites immediately (same call) or discards

This isn't "generate then filter"; it's **"generate only when grounded + verified."**

### Why big-batch generation makes MCQs worse

When you ask for many questions at once, the model:
- Uses weaker evidence ("I think the notes imply…")
- Repeats patterns and reuses distractors
- Writes broad "definition" stems that don't test anything
- Accidentally creates 2 correct answers because it isn't auditing each option carefully

### V5 Minimal 2-Call Workflow

**Call 1 — "Fact Bank" (from a chunk)**
- Input: text from 1-2 pages
- Output: 8-15 "testable claims" with exact quotes
- Each claim includes: claim_id, claim_type, evidence quotes, common confusions

**Call 2 — "Generate ONE MCQ from ONE Claim" (with self-audit)**
- Input: one claim + evidence + confusion list
- Output: one MCQ with option audit
- Model audits each option: cite which evidence supports/refutes it
- If audit shows ambiguity → model rewrites immediately
- Confidence threshold: 0.7 (below = discard)

### V5 Quality Checks (Built Into Generation)

| Check | When | Action if fails |
|---|---|---|
| Option audit shows 2+ correct | During Call 2 | Model rewrites or discards |
| Confidence < 0.7 | After Call 2 | Discard |
| No evidence quotes | After Call 2 | Discard |
| Invalid MCQ structure | After Call 2 | Discard |

### V5 Config

```
TEMP_FACT_BANK: 0.3
TEMP_MCQ_GEN: 0.4
MAX_CLAIMS_PER_CHUNK: 12
MAX_QUESTIONS_PER_TOPIC: 8
MIN_CONFIDENCE: 0.7
```

---

## V4 Quality Dimensions (8 dimensions) — LEGACY

### Binary (0 = fail, 1 = pass)
| Dimension | Question it answers |
|---|---|
| `grounded` | Does the question cite evidence_span_ids in source_evidence? |
| `answerable_from_context` | Can a student answer this using ONLY the provided material? |
| `has_single_clear_correct` | Is there exactly one unambiguous correct answer? |
| `format_justified` | Is the chosen format (mcq_single/mcq_multi/short_answer) the best for this question? |

### Likert (1-5 scale)
| Dimension | 1 (worst) | 5 (best) |
|---|---|---|
| `non_trivial` | Definition-only, single-step | Multi-step synthesis, reasoning |
| `distractors_plausible` | Obviously wrong choices | Maps to documented misconception_ids |
| `clarity` | Confusing, undefined symbols | Crystal clear, all terms defined |
| `context_authentic` | Generic filler (coins, dice) | Uses material's specific examples |

---

## V4 Scoring Formula (Legacy)

```
binary_score = (grounded + answerable_from_context + has_single_clear_correct + format_justified) * 1.5  // max 6
avg_likert   = (non_trivial + distractors_plausible + clarity + context_authentic) / 4
likert_score = (avg_likert / 5) * 4                                                                      // max 4
total_score  = binary_score + likert_score                                                               // max 10
```

---

## V4 Thresholds (Legacy)

| Score range | Verdict | Action |
|---|---|---|
| ALL binary=1 AND non_trivial>=3 AND avg_likert>=3.5 | **keep** | Insert as-is |
| 3+ binary=1 AND avg_likert>=2.0 | **repair** | Send to Stage 3 repair pass |
| Everything else | **reject** | Drop entirely |

---

## V4 Hard Rejection Triggers

Questions are automatically rejected if ANY of these conditions are true:

1. `source_evidence.evidence_span_ids.length === 0` (no citations)
2. `grounding_check.reasoning_steps < 2` AND not a "define/identify" question
3. `grounding_check.uses_material_context === false` (uses generic filler)
4. MCQ without `distractor_rationales[]` array

These triggers fire BEFORE score calculation.

---

## V3 Quality Dimensions (6 dimensions) — LEGACY

### Binary (0 = fail, 1 = pass)
| Dimension | Question it answers |
|---|---|
| `answerable_from_context` | Can a student answer this using ONLY the provided material? |
| `has_single_clear_correct` | Is there exactly one unambiguous correct answer? |
| `format_justified` | Is the chosen format (mcq_single/mcq_multi/short_answer) the best for this question? |

### Likert (1-5 scale)
| Dimension | 1 (worst) | 5 (best) |
|---|---|---|
| `distractors_plausible` | Obviously wrong choices | Maps to real student misconceptions |
| `clarity` | Confusing, undefined symbols | Crystal clear, all terms defined |
| `difficulty_appropriate` | Stated difficulty way off | Perfect match to actual complexity |

### V3 Scoring Formula

```
binary_score = (answerable_from_context + has_single_clear_correct + format_justified) * 2   // max 6
avg_likert   = (distractors_plausible + clarity + difficulty_appropriate) / 3
likert_score = (avg_likert / 5) * 4                                                          // max 4
total_score  = binary_score + likert_score                                                    // max 10
```

### V3 Thresholds

| Score range | Verdict | Action |
|---|---|---|
| >= 7 | **keep** | Insert as-is |
| 4 - 6.9 | **repair** | Send to Stage C repair pass |
| < 4 | **reject** | Drop entirely |

---

## Pipeline Constants

```
TEMP_GENERATE: 0.5
TEMP_JUDGE: 0.2
TEMP_REPAIR: 0.4
KEEP_THRESHOLD: 7/10 (v3) or dynamic (v4)
REPAIR_THRESHOLD: 4/10 (v3) or dynamic (v4)
MAX_QUESTIONS_PER_TOPIC: 8
OVERGENERATE_FACTOR: 1.5
```

---

## DB Storage

Questions table columns used:
- `quality_score` (numeric): composite score out of 10
- `quality_flags` (jsonb): all dimension scores + `issues[]` + `pipeline_version` + `was_repaired`
- `source_evidence` (jsonb, v4): evidence_span_ids, fact_ids, page_refs
- `grounding_score` (numeric, v4): 0-1 score based on evidence citations

---

## Test Metrics (V4 Targets)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Grounded questions | >= 95% | `source_evidence.evidence_span_ids.length > 0` |
| Non-trivial questions | >= 80% | `grounding_check.reasoning_steps >= 2` |
| Misconception-based distractors | >= 70% | At least 1 distractor with `rationale_type: 'misconception'` |
| Material context (not filler) | >= 90% | `grounding_check.uses_material_context === true` |
| Quality score >= 7 | >= 85% | `quality_score >= 7` |

---

## Test Harness

```bash
bun run scripts/test-question-generation.ts --material-id <uuid>
bun run scripts/test-question-generation.ts --material-id <uuid> --topic-limit 3
bun run scripts/test-extraction.ts --material-id <uuid>
bun run scripts/test-pipeline-v4.ts --material-id <uuid> --dry-run
bun run scripts/compare-pipeline-quality.ts --material-id <uuid>
```

Runs the pipeline WITHOUT inserting into DB. Prints:
- Candidates generated / kept / repaired / rejected per topic
- Type distribution (mcq_single / mcq_multi / short_answer)
- Difficulty distribution (easy / medium / hard)
- Quality score stats (mean / min / max)
- Grounding stats (evidence citations, reasoning steps)
- First 3 sample questions with full judge scores

---

## Expected Outcomes (V4)

- 90%+ of final questions should be mcq_single
- No questions with grounding_score < 0.5 should reach the DB
- No questions without evidence citations should reach the DB
- `quality_flags` populated on every inserted question
- Repair pass should recover 40-60% of repairable questions (stricter than v3)
- MCQ questions without distractor_rationales should be rejected

---

## Edge Cases

- Judge API failure: all candidates kept with default scores, `issues: ["judge_pass_skipped"]`
- Repair API failure: all repair candidates rejected
- Structural validation failure after repair: question rejected (not re-tried)
- No candidates generated: topic skipped with warning
- V4 analysis with sparse chunks: still generates, but lower grounding scores
- V2 analysis fallback: uses v3 pipeline with 6 dimensions
