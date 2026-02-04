# Blueprint: Question Quality Pipeline (v3)

Goal: Ensure generated questions meet minimum quality thresholds before reaching the DB. Filter out bad questions, repair fixable ones, store quality metadata for downstream use.

## Quality Dimensions

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

## Scoring Formula

```
binary_score = (answerable_from_context + has_single_clear_correct + format_justified) * 2   // max 6
avg_likert   = (distractors_plausible + clarity + difficulty_appropriate) / 3
likert_score = (avg_likert / 5) * 4                                                          // max 4
total_score  = binary_score + likert_score                                                    // max 10
```

## Thresholds

| Score range | Verdict | Action |
|---|---|---|
| >= 7 | **keep** | Insert as-is |
| 4 - 6.9 | **repair** | Send to Stage C repair pass |
| < 4 | **reject** | Drop entirely |

LLM verdict labels are overridden by numeric scores. `resolveVerdict()` trusts numbers over labels.

## Pipeline Constants

```
TEMP_GENERATE: 0.5
TEMP_JUDGE: 0.2
TEMP_REPAIR: 0.4
KEEP_THRESHOLD: 7/10
REPAIR_THRESHOLD: 4/10
MAX_QUESTIONS_PER_TOPIC: 8
OVERGENERATE_FACTOR: 1.5
```

## DB Storage

Questions table columns used:
- `quality_score` (numeric): composite score out of 10
- `quality_flags` (jsonb): all 6 dimension scores + `issues[]` + `pipeline_version` + `was_repaired`

No migration needed - columns already exist on `questions` table.

## Test Harness

```bash
bun run scripts/test-question-generation.ts --material-id <uuid>
bun run scripts/test-question-generation.ts --material-id <uuid> --topic-limit 3
```

Runs the 3-stage pipeline WITHOUT inserting into DB. Prints:
- Candidates generated / kept / repaired / rejected per topic
- Type distribution (mcq_single / mcq_multi / short_answer)
- Difficulty distribution (easy / medium / hard)
- Quality score stats (mean / min / max)
- First 3 sample questions with full judge scores

## Expected Outcomes

- 90%+ of final questions should be mcq_single
- No questions with score < 7 should reach the DB
- `quality_flags` populated on every inserted question
- Repair pass should recover 50-80% of repairable questions

## Edge Cases

- Judge API failure: all candidates kept with default scores, `issues: ["judge_pass_skipped"]`
- Repair API failure: all repair candidates rejected
- Structural validation failure after repair: question rejected (not re-tried)
- No candidates generated: topic skipped with warning
