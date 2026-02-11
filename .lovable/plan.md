Tech Debt Cleanup + Feature Enablement Plan (Improved)
Guiding rules (to prevent new debt)

Pick one source of truth per concept (answers, dates, types). Remove or freeze the duplicates.

Data fixes before schema drops. Column drops happen last and only after code no longer reads/writes them.

Every migration is reversible (snapshot + idempotent scripts + needs_review flags instead of destructive overwrites when uncertain).

Add constraints only after backfills (NOT NULL, FK, CHECK).

Phase 0 — Baseline + Safety Net (Immediate)

Goal: Make everything measurable and safe to change.

Tasks

✅ Fix build/test failures (CalendarStudyRow shape changes, newCount expectations).

Add lightweight profiling:

progress page load time (client + server)

recommendations/daily plan call duration

calendar query duration

Add data quality checks you can run as scripts:

MCQ has exactly one correct choice

every question has ≥ 1 topic

topic/date mapping exists for topics expected by diagnostic

Exit criteria

CI green

You can quantify “progress page takes Xs” and identify top slow query(s).

Phase 1 — “Source of Truth” Decisions (Do before touching data)

This prevents you from fixing data into a schema you’ll later change.

1A) Answers: choose canonical representation

Recommendation (min debt):

MCQ correctness lives in one place:

Either choices[].isCorrect OR answer_spec.correct_choice_ids

If you keep correct_answer, it must be derived, not authored.

Decision

If you want editable answers + consistent grading across formats: make answer_spec canonical and treat choices.isCorrect as derived for rendering.

If you want simplest: keep choices.isCorrect canonical and drop/deprecate correct_answer.

1B) Dates: calendar truth

calendar_events.event_date is the only truth.

week_number / day_of_week become derived display fields (or dropped later).

1C) “Question type” semantics

question_format = input/response format (mcq/numeric/short_answer)

question_type_id = variant/skill category (what you want)

Exit criteria

You’ve documented these decisions in code comments + a short docs/data-model.md.

Phase 2 — Calendar Events Cleanup + Topic Dating (Foundational)

Your “topic exact date” and diagnostic correctness depend on this.

Tasks

Repair calendar consistency

Identify course packs where day_of_week disagrees with event_date → fix upstream ingestion logic.

Add a check to block future bad inserts (or mark them invalid_event=true).

Implement topic last-covered date

Add topics.last_covered_date (or covered_end_date).

Compute as MAX(event_date) for all lecture events that include that topic.

If a topic appears across multiple lectures → use the last date (your requirement).

Update extract-topics pipeline

When generating topics from lecture material/calendar: automatically assign/update last_covered_date.

Exit criteria

For each topic, you can display a real date (not “Week X”).

“Covered topics as of today” is correct for all course packs.

Phase 3 — Questions Data Consistency Fixes (SQL, guarded)

Goal: eliminate contradictions and fix known bad rows without guesswork.

3A) Fix MCQ answer inconsistencies (guarded)

For MCQ rows:

If exactly one choices[].isCorrect=true → update canonical answer representation

If 0 or >1 correct → do not auto-fix; set needs_review=true + reason

3B) Fix answer_format_enum mismatch safely

Don’t blindly set answer_format_enum = question_format.

Do an explicit mapping OR deprecate answer_format_enum if redundant.

3C) Fix questions with empty topics

Find all topic_ids = []

Set needs_review=true + reason (missing_topics)

(Optional) attempt auto-attach topics only if you have reliable signals; otherwise keep human review.

3D) Add/standardize review flags (supports future admin workflows)

Add:

needs_review boolean default false

needs_review_reason text

(optional) review_status enum ('new','needs_review','approved')

Exit criteria

Zero contradictory MCQ correctness (or flagged for review).

No “silent” questions with no topics; they’re all flagged.