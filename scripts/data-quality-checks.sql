/**
 * Data quality checks for the questions and calendar_events tables.
 *
 * Run via Supabase SQL editor or as a script with service-role access.
 * Each query returns rows that violate the invariant — 0 rows = pass.
 *
 * Usage (from Lovable Cloud → Run SQL):
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
  AND COALESCE(q.question_format, 'mcq') = 'mcq'
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
