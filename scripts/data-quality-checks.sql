/**
 * Data quality checks for the questions and calendar_events tables.
 *
 * Run via Supabase SQL editor or as a script with service-role access.
 * Each query returns rows that violate the invariant — 0 rows = pass.
 *
 * CANONICAL RULES (see docs/data-model.md):
 * - Answers: choices[].isCorrect is canonical for MCQ; correct_answer for non-MCQ.
 *   answer_format_enum is DEPRECATED.
 * - Dates: calendar_events.event_date is the single source of truth.
 *   day_of_week is auto-derived via trigger.
 * - Question types: question_format = input format (how student answers);
 *   question_type_id = skill/variant category (what's tested).
 *
 * Usage (Supabase SQL editor):
 *   Copy-paste any section below and run it.
 */

-- ============================================================
-- CHECK 1: MCQ questions must have exactly one isCorrect choice
-- ============================================================
-- Returns questions where the count of isCorrect=true choices ≠ 1.

SELECT
  q.id,
  q.prompt,
  q.source_exam,
  q.question_format,
  (
    SELECT count(*)
    FROM jsonb_array_elements(q.choices) elem
    WHERE (elem->>'isCorrect')::boolean = true
  ) AS correct_count
FROM questions q
WHERE q.choices IS NOT NULL
  AND jsonb_array_length(q.choices) > 0
  AND COALESCE(q.question_format, 'multiple_choice') = 'multiple_choice'
  AND (
    SELECT count(*)
    FROM jsonb_array_elements(q.choices) elem
    WHERE (elem->>'isCorrect')::boolean = true
  ) <> 1;

-- ============================================================
-- CHECK 2: Every question must have at least one topic
-- ============================================================

SELECT id, prompt, source_exam
FROM questions
WHERE topic_ids = '{}' OR topic_ids IS NULL;

-- ============================================================
-- CHECK 3: Topics expected by diagnostic have a date mapping
-- ============================================================
-- A topic is "expected by diagnostic" if it has a scheduled_week.
-- It should appear in at least one calendar_event with an event_date
-- so we can derive a real date for it.

SELECT
  t.id AS topic_id,
  t.title,
  t.course_pack_id,
  t.scheduled_week
FROM topics t
WHERE t.scheduled_week IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM calendar_events ce
    WHERE ce.course_pack_id = t.course_pack_id
      AND ce.event_date IS NOT NULL
      AND t.title = ANY(ce.topics_covered)
  );

-- ============================================================
-- CHECK 4: Orphaned needs_review flags (review=true but no reason)
-- ============================================================
-- Questions flagged for review should always have a reason.

SELECT id, prompt, source_exam, needs_review_reason
FROM questions
WHERE needs_review = true
  AND (needs_review_reason IS NULL OR needs_review_reason = '');

-- ============================================================
-- CHECK 5: Deprecated answer_format_enum still in use
-- ============================================================
-- answer_format_enum is DEPRECATED. Rows still using it should be migrated.

SELECT id, prompt, answer_format_enum, question_format
FROM questions
WHERE answer_format_enum IS NOT NULL;
