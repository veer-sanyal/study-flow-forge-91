# Project Learnings
Date | Component | Issue | Resolution | Insight
---
2026-02-12 | questions | `answer_format_enum` vs `question_format` overlap caused confusion | Deprecated `answer_format_enum`; `question_format` is the input-format field, `question_type_id` is the skill-category field | Keep orthogonal concerns in separate columns; document canonical sources in `docs/data-model.md`
2026-02-12 | calendar_events | `day_of_week` often inconsistent with `event_date` | Added trigger to auto-derive `day_of_week` from `event_date`; `event_date` is the single source of truth | Derived fields should be computed, not manually maintained
2026-02-12 | questions | MCQ questions with 0 or >1 correct choices passed through undetected | Added `needs_review_reason` column and migration to flag inconsistencies | Validate structural invariants at write time and with periodic checks
2026-02-12 | data-quality-checks.sql | CHECK 1 used `'mcq'` but actual enum value is `'multiple_choice'` | Changed filter to `COALESCE(q.question_format, 'multiple_choice') = 'multiple_choice'` | Always verify literal values match the actual DB enum/values
