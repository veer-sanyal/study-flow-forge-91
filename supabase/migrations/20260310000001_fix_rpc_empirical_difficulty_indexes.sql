-- Migration: Fix broken RPC (retention_0_1 removed), add empirical difficulty, add indexes
-- Date: 2026-03-10
-- Context: retention_0_1 was dropped in 20260309000001. The get_recommended_questions RPC
-- references it and fails on every call. Also adds empirical difficulty tracking and
-- composite indexes for dashboard performance.

-- ============================================================================
-- 1. SCHEMA: Add empirical_difficulty column to questions
-- ============================================================================

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS empirical_difficulty real;

COMMENT ON COLUMN public.questions.empirical_difficulty IS
  'Blended difficulty: 0.5 * gemini_difficulty + 0.5 * ((1 - correct_rate) * 2 + 1). '
  'Updated daily by refresh_empirical_difficulty(). NULL until >= 5 attempts exist.';

-- ============================================================================
-- 2. FUNCTION: refresh_empirical_difficulty()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_empirical_difficulty()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  -- Batch-update empirical_difficulty for questions with >= 5 attempts.
  -- Formula: 0.5 * gemini_difficulty + 0.5 * ((1 - correct_rate) * 2 + 1)
  -- Maps correct_rate [0,1] → empirical component [1,3] matching Gemini's 1-3 scale.
  --
  -- NOTE: Currently counts raw attempts, not distinct users.
  -- Future improvement: COUNT(DISTINCT a.user_id) for better signal.
  UPDATE questions q
  SET empirical_difficulty =
    0.5 * COALESCE(q.difficulty, 2)::real
    + 0.5 * ((1.0 - s.correct / s.total) * 2.0 + 1.0)
  FROM (
    SELECT a.question_id,
           COUNT(*)::real AS total,
           SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::real AS correct
    FROM attempts a
    GROUP BY a.question_id
    HAVING COUNT(*) >= 5
  ) s
  WHERE q.id = s.question_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.refresh_empirical_difficulty() IS
  'Batch-updates empirical_difficulty for questions with >= 5 attempts. Called by run_daily_fsrs_maintenance().';

-- ============================================================================
-- 3. FIX: get_recommended_questions — remove retention_0_1 references
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_recommended_questions(
  uuid, integer, integer, integer, integer, uuid, text, uuid[], uuid, boolean, uuid[]
);

CREATE FUNCTION public.get_recommended_questions(
  p_user_id uuid,
  p_limit integer DEFAULT 10,
  p_current_week integer DEFAULT 1,
  p_pace_offset integer DEFAULT 1,
  p_target_difficulty integer DEFAULT 3,
  p_course_id uuid DEFAULT NULL,
  p_exam_name text DEFAULT NULL,
  p_topic_ids uuid[] DEFAULT NULL,
  p_question_type_id uuid DEFAULT NULL,
  p_ignore_constraints boolean DEFAULT FALSE,
  p_enrolled_course_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  question_id uuid,
  prompt text,
  choices jsonb,
  correct_answer text,
  hint text,
  solution_steps jsonb,
  difficulty integer,
  source_exam text,
  topic_ids uuid[],
  question_type_id uuid,
  course_pack_id uuid,
  course_name text,
  score double precision,
  due_urgency double precision,
  knowledge_gap double precision,
  difficulty_match double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_week integer;
  v_today_start timestamptz;
BEGIN
  -- Calculate effective week based on pace
  v_effective_week := p_current_week + p_pace_offset;

  -- Get start of today (for excluding already-attempted questions)
  v_today_start := date_trunc('day', now());

  RETURN QUERY
  WITH user_srs AS (
    SELECT
      s.question_id,
      s.due_at,
      s.scheduled_days,
      s.stability,
      s.state
    FROM srs_state s
    WHERE s.user_id = p_user_id
  ),
  user_mastery AS (
    SELECT
      tm.topic_id,
      tm.mastery_0_1
    FROM topic_mastery tm
    WHERE tm.user_id = p_user_id
  ),
  -- Questions already attempted today (to exclude from recommendations)
  today_attempts AS (
    SELECT DISTINCT a.question_id
    FROM attempts a
    WHERE a.user_id = p_user_id
      AND a.created_at >= v_today_start
  )
  SELECT DISTINCT ON (q.id)
    q.id as question_id,
    q.prompt,
    q.choices,
    q.correct_answer,
    q.hint,
    q.solution_steps,
    q.difficulty,
    q.source_exam,
    q.topic_ids,
    q.question_type_id,
    q.course_pack_id,
    cp.title as course_name,
    -- Calculate composite score
    (
      COALESCE(
        CASE
          WHEN s.due_at IS NULL THEN 0.5
          WHEN s.state IN (1, 3) AND s.due_at <= now() THEN 1.0
          WHEN s.due_at <= now() THEN 1.0 - (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - s.due_at)) / 86400.0))
          ELSE 0.3
        END, 0.5
      ) * 0.3 +
      (
        SELECT COALESCE(1.0 - AVG(COALESCE(um.mastery_0_1, 0.0)), 0.7)::double precision
        FROM unnest(q.topic_ids) as tid
        LEFT JOIN user_mastery um ON um.topic_id = tid
      ) * 0.4 +
      (1.0 - ABS(COALESCE(q.empirical_difficulty, q.difficulty, 3) - p_target_difficulty)::double precision / 4.0)::double precision * 0.3
    )::double precision as score,
    -- Due urgency component (with FSRS state boost)
    COALESCE(
      CASE
        WHEN s.due_at IS NULL THEN 0.5
        WHEN s.state IN (1, 3) AND s.due_at <= now() THEN 1.0
        WHEN s.due_at <= now() THEN 1.0 - (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - s.due_at)) / 86400.0))
        ELSE 0.3
      END, 0.5
    )::double precision as due_urgency,
    -- Knowledge gap component (simplified: just mastery_0_1)
    (
      SELECT COALESCE(1.0 - AVG(COALESCE(um.mastery_0_1, 0.0)), 0.7)::double precision
      FROM unnest(q.topic_ids) as tid
      LEFT JOIN user_mastery um ON um.topic_id = tid
    ) as knowledge_gap,
    -- Difficulty match component (uses empirical_difficulty when available)
    (1.0 - ABS(COALESCE(q.empirical_difficulty, q.difficulty, 3) - p_target_difficulty)::double precision / 4.0)::double precision as difficulty_match
  FROM questions q
  LEFT JOIN user_srs s ON s.question_id = q.id
  LEFT JOIN course_packs cp ON cp.id = q.course_pack_id
  WHERE q.needs_review = FALSE
    AND COALESCE(q.is_published, true) = true
    AND COALESCE(q.status, 'approved') = 'approved'
    AND (q.course_pack_id IS NULL OR cp.is_published = true)
    AND NOT EXISTS (SELECT 1 FROM today_attempts ta WHERE ta.question_id = q.id)
    -- Course filter: specific course > enrolled courses > all courses (admin fallback)
    AND (
      (p_course_id IS NOT NULL AND q.course_pack_id = p_course_id)
      OR (p_course_id IS NULL AND p_enrolled_course_ids IS NOT NULL AND q.course_pack_id = ANY(p_enrolled_course_ids))
      OR (p_course_id IS NULL AND p_enrolled_course_ids IS NULL)
    )
    AND (p_exam_name IS NULL OR q.source_exam = p_exam_name)
    AND (p_topic_ids IS NULL OR q.topic_ids && p_topic_ids)
    AND (p_question_type_id IS NULL OR q.question_type_id = p_question_type_id)
  ORDER BY q.id,
    CASE WHEN p_ignore_constraints THEN q.question_order END ASC NULLS LAST,
    CASE WHEN NOT p_ignore_constraints THEN (
      COALESCE(
        CASE
          WHEN s.due_at IS NULL THEN 0.5
          WHEN s.state IN (1, 3) AND s.due_at <= now() THEN 1.0
          WHEN s.due_at <= now() THEN 1.0 - (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - s.due_at)) / 86400.0))
          ELSE 0.3
        END, 0.5
      ) * 0.3 +
      (
        SELECT COALESCE(1.0 - AVG(COALESCE(um2.mastery_0_1, 0.0)), 0.7)::double precision
        FROM unnest(q.topic_ids) as tid2
        LEFT JOIN user_mastery um2 ON um2.topic_id = tid2
      ) * 0.4 +
      (1.0 - ABS(COALESCE(q.empirical_difficulty, q.difficulty, 3) - p_target_difficulty)::double precision / 4.0)::double precision * 0.3
    ) END DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Restore grants (was granted to authenticated in original migration)
GRANT EXECUTE ON FUNCTION public.get_recommended_questions(
  uuid, integer, integer, integer, integer, uuid, text, uuid[], uuid, boolean, uuid[]
) TO authenticated;

-- ============================================================================
-- 4. UPDATE: run_daily_fsrs_maintenance — wire in refresh_empirical_difficulty
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_daily_fsrs_maintenance()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fsrs_result RECORD;
  v_topic_result RECORD;
  v_fsrs_updated integer;
  v_fsrs_processed integer;
  v_topic_updated integer;
  v_empirical_updated integer;
BEGIN
  -- Run FSRS recalculation
  SELECT * INTO v_fsrs_result FROM recalculate_fsrs_daily();
  v_fsrs_updated := v_fsrs_result.updated_count;
  v_fsrs_processed := v_fsrs_result.processed_count;

  -- Update topic scheduled dates
  SELECT * INTO v_topic_result FROM update_topic_scheduled_dates();
  v_topic_updated := v_topic_result.updated_count;

  -- Refresh empirical difficulty scores
  SELECT refresh_empirical_difficulty() INTO v_empirical_updated;

  RETURN json_build_object(
    'success', true,
    'fsrs_updated', v_fsrs_updated,
    'fsrs_processed', v_fsrs_processed,
    'topics_updated', v_topic_updated,
    'empirical_difficulty_updated', v_empirical_updated,
    'timestamp', now()
  );
END;
$$;

-- ============================================================================
-- 5. INDEXES: Composite indexes for dashboard and RPC performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_srs_state_user_due
  ON srs_state(user_id, due_at);

CREATE INDEX IF NOT EXISTS idx_attempts_user_created
  ON attempts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_topic_mastery_user_mastery
  ON topic_mastery(user_id, mastery_0_1);

-- Partial index: RPC always filters is_published = true AND status = 'approved'
CREATE INDEX IF NOT EXISTS idx_questions_published_approved
  ON questions(course_pack_id)
  WHERE is_published = true AND status = 'approved';
