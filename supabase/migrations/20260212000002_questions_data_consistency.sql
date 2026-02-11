-- Migration: Questions data consistency
-- See docs/data-model.md for canonical rules.

-- ============================================================
-- A) Add column: questions.needs_review_reason
-- ============================================================
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS needs_review_reason TEXT;

-- ============================================================
-- B) Flag MCQ inconsistencies: questions where choices has != 1 isCorrect=true
-- ============================================================

-- Flag MCQs with zero correct choices
UPDATE questions
SET
  needs_review = true,
  needs_review_reason = COALESCE(needs_review_reason || '; ', '') || 'mcq_no_correct_answer'
WHERE choices IS NOT NULL
  AND jsonb_array_length(choices) > 0
  AND COALESCE(question_format, 'multiple_choice') = 'multiple_choice'
  AND (
    SELECT count(*)
    FROM jsonb_array_elements(choices) elem
    WHERE (elem->>'isCorrect')::boolean = true
  ) = 0;

-- Flag MCQs with multiple correct choices
UPDATE questions
SET
  needs_review = true,
  needs_review_reason = COALESCE(needs_review_reason || '; ', '') ||
    'mcq_multiple_correct(' || (
      SELECT count(*)
      FROM jsonb_array_elements(choices) elem
      WHERE (elem->>'isCorrect')::boolean = true
    )::text || ')'
WHERE choices IS NOT NULL
  AND jsonb_array_length(choices) > 0
  AND COALESCE(question_format, 'multiple_choice') = 'multiple_choice'
  AND (
    SELECT count(*)
    FROM jsonb_array_elements(choices) elem
    WHERE (elem->>'isCorrect')::boolean = true
  ) > 1;

-- ============================================================
-- C) Flag empty topics
-- ============================================================
UPDATE questions
SET
  needs_review = true,
  needs_review_reason = COALESCE(needs_review_reason || '; ', '') || 'missing_topics'
WHERE (topic_ids = '{}' OR topic_ids IS NULL)
  AND needs_review_reason IS NULL OR needs_review_reason NOT LIKE '%missing_topics%';

-- ============================================================
-- D) Deprecate answer_format_enum
-- ============================================================
COMMENT ON COLUMN public.questions.answer_format_enum IS
  'DEPRECATED (2026-02-12): Use question_format instead. See docs/data-model.md.';

-- Drop index on answer_format_enum if it exists
DROP INDEX IF EXISTS idx_questions_answer_format_enum;
