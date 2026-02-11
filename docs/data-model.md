# Data Model: Source of Truth

Three canonical decisions govern how data is stored and interpreted.

---

## 1. Answers

| Format | Canonical source | Notes |
|--------|-----------------|-------|
| MCQ (`multiple_choice`) | `choices[].isCorrect` (exactly one must be `true`) | `correct_answer` may also be set for convenience but `choices` is authoritative |
| Non-MCQ (`short_answer`, `numeric`) | `correct_answer` | `choices` is NULL or empty |
| `answer_format_enum` | **DEPRECATED** | Do not read or write; kept for historical data only |

### Rules
- Every MCQ question **must** have exactly one choice with `isCorrect = true`.
- Questions violating this are flagged `needs_review = true` with a `needs_review_reason`.

---

## 2. Dates

| Field | Role |
|-------|------|
| `calendar_events.event_date` | **Single source of truth** for when an event occurs |
| `calendar_events.week_number` | Display grouping; derived from `event_date` where possible |
| `calendar_events.day_of_week` | Display label; **auto-derived** from `event_date` via trigger |
| `topics.scheduled_date` | Computed by `update_topic_scheduled_dates()` RPC from calendar events |
| `topics.last_covered_date` | Latest `event_date` from any calendar event covering this topic |

### Rules
- `event_date` is canonical. If `day_of_week` disagrees with `event_date`, the trigger overwrites `day_of_week`.
- Manual edits to `day_of_week` are allowed only when `event_date` is NULL.

---

## 3. Question Types

| Field | Purpose |
|-------|---------|
| `question_format` | **Input format** — how the student answers (e.g., `multiple_choice`, `short_answer`, `numeric`) |
| `question_type_id` | **Skill/variant category** — what concept or skill is tested (FK to `question_types`) |

### Rules
- `question_format` and `question_type_id` are orthogonal; a "Derivative Application" question type can be MCQ or short-answer.
- New `question_types` created by generation pipelines should be inserted with `status = 'proposed'` (not `'active'`) to prevent taxonomy sprawl.
