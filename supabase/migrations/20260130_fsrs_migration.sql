-- FSRS Migration: Replace SM-2 with ts-fsrs (client-side scheduling)
-- This migration:
--   1. Adds FSRS columns to srs_state
--   2. Drops old SM-2 columns (ease, interval_days)
--   3. Adds fsrs_rating to attempts
--   4. Truncates srs_state for fresh start
--   5. Drops SM-2 trigger/functions
--   6. Creates standalone topic mastery trigger
--   7. Updates get_recommended_questions to use FSRS columns

-- ============================================================
-- 2a. Add FSRS columns to srs_state
-- ============================================================
ALTER TABLE srs_state
  ADD COLUMN IF NOT EXISTS stability      REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS difficulty      REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elapsed_days    REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scheduled_days  REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lapses         INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS learning_steps INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state          SMALLINT NOT NULL DEFAULT 0;

-- ============================================================
-- 2b. Drop old SM-2 columns and constraints
-- ============================================================
-- Drop the ease >= 1.3 CHECK constraint if it exists
DO $$
BEGIN
  -- Find and drop any check constraint on the ease column
  PERFORM 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name = 'srs_state'
      AND tc.constraint_type = 'CHECK'
      AND cc.check_clause LIKE '%ease%';

  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE srs_state DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'srs_state'
        AND tc.constraint_type = 'CHECK'
        AND cc.check_clause LIKE '%ease%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE srs_state
  DROP COLUMN IF EXISTS ease,
  DROP COLUMN IF EXISTS interval_days;

-- ============================================================
-- 2c. Add fsrs_rating to attempts table
-- ============================================================
ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS fsrs_rating SMALLINT;
  -- 1=Again, 2=Hard, 3=Good, 4=Easy

-- ============================================================
-- 2d. Fresh start - truncate SRS state
-- (Existing attempts and topic_mastery data are preserved)
-- ============================================================
TRUNCATE srs_state;

-- ============================================================
-- 2e. Drop SM-2 trigger and functions
-- ============================================================
DROP TRIGGER IF EXISTS trg_update_srs_after_attempt ON attempts;
DROP FUNCTION IF EXISTS update_srs_after_attempt();
DROP FUNCTION IF EXISTS compute_quality_score(boolean, text, boolean, boolean);

-- ============================================================
-- 2f. Create standalone topic mastery trigger
-- (Extracted from the old update_srs_after_attempt trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_topic_mastery_after_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_topic_id uuid;
  v_current_mastery numeric;
  v_new_mastery numeric;
  v_ema_alpha numeric := 0.3;
  v_performance numeric;
  v_current_difficulty integer;
  v_new_difficulty integer;
  v_current_correct integer;
  v_current_incorrect integer;
BEGIN
  -- Update topic mastery for each topic associated with this question
  FOR v_topic_id IN
    SELECT unnest(topic_ids) FROM public.questions WHERE id = NEW.question_id
  LOOP
    -- Calculate performance score (0-1)
    v_performance := CASE WHEN NEW.is_correct THEN 1.0 ELSE 0.0 END;

    -- Get current mastery and streak data
    SELECT mastery_0_1, effective_difficulty_level, consecutive_correct, consecutive_incorrect
    INTO v_current_mastery, v_current_difficulty, v_current_correct, v_current_incorrect
    FROM public.topic_mastery
    WHERE user_id = NEW.user_id AND topic_id = v_topic_id;

    -- Default values if not found
    v_current_mastery := COALESCE(v_current_mastery, 0.5);
    v_current_difficulty := COALESCE(v_current_difficulty, 3);
    v_current_correct := COALESCE(v_current_correct, 0);
    v_current_incorrect := COALESCE(v_current_incorrect, 0);

    -- Calculate new mastery using EMA
    v_new_mastery := v_current_mastery * (1 - v_ema_alpha) + v_performance * v_ema_alpha;

    -- Update streak counters
    IF NEW.is_correct THEN
      v_current_correct := v_current_correct + 1;
      v_current_incorrect := 0;
    ELSE
      v_current_incorrect := v_current_incorrect + 1;
      v_current_correct := 0;
    END IF;

    -- Calculate difficulty ramping
    -- 3 correct in a row = increase difficulty (max 5)
    -- 2 wrong in a row = decrease difficulty (min 1)
    v_new_difficulty := v_current_difficulty;
    IF v_current_correct >= 3 THEN
      v_new_difficulty := LEAST(5, v_current_difficulty + 1);
      v_current_correct := 0; -- Reset after ramping
    ELSIF v_current_incorrect >= 2 THEN
      v_new_difficulty := GREATEST(1, v_current_difficulty - 1);
      v_current_incorrect := 0; -- Reset after ramping
    END IF;

    -- Upsert topic mastery
    INSERT INTO public.topic_mastery (
      user_id, topic_id, mastery_0_1, retention_0_1,
      questions_attempted, questions_correct, last_practiced_at,
      effective_difficulty_level, consecutive_correct, consecutive_incorrect
    )
    VALUES (
      NEW.user_id, v_topic_id, v_new_mastery, v_new_mastery,
      1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, now(),
      v_new_difficulty, v_current_correct, v_current_incorrect
    )
    ON CONFLICT (user_id, topic_id) DO UPDATE SET
      mastery_0_1 = v_new_mastery,
      retention_0_1 = v_new_mastery,
      questions_attempted = topic_mastery.questions_attempted + 1,
      questions_correct = topic_mastery.questions_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      last_practiced_at = now(),
      effective_difficulty_level = v_new_difficulty,
      consecutive_correct = v_current_correct,
      consecutive_incorrect = v_current_incorrect,
      retention_updated_at = now(),
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_update_topic_mastery
  AFTER INSERT ON attempts
  FOR EACH ROW
  EXECUTE FUNCTION update_topic_mastery_after_attempt();

-- ============================================================
-- 2g. Update get_recommended_questions to use FSRS columns
-- Replace references to ease/interval_days with stability/state
-- Prioritize Learning/Relearning cards (state 1 or 3)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_recommended_questions(
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
      tm.mastery_0_1,
      tm.retention_0_1
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
    -- Calculate composite score
    -- Boost Learning/Relearning cards (state 1 or 3) with extra urgency
    (
      COALESCE(
        CASE
          WHEN s.due_at IS NULL THEN 0.5
          -- Learning/Relearning cards get highest urgency when due
          WHEN s.state IN (1, 3) AND s.due_at <= now() THEN 1.0
          WHEN s.due_at <= now() THEN 1.0 - (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - s.due_at)) / 86400.0))
          ELSE 0.3
        END, 0.5
      ) * 0.3 +
      (
        SELECT COALESCE(1.0 - AVG(0.6 * COALESCE(um.mastery_0_1, 0.0) + 0.4 * COALESCE(um.retention_0_1, 0.5)), 0.7)::double precision
        FROM unnest(q.topic_ids) as tid
        LEFT JOIN user_mastery um ON um.topic_id = tid
      ) * 0.4 +
      (1.0 - ABS(COALESCE(q.difficulty, 3) - p_target_difficulty)::double precision / 4.0)::double precision * 0.3
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
    -- Knowledge gap component
    (
      SELECT COALESCE(1.0 - AVG(0.6 * COALESCE(um.mastery_0_1, 0.0) + 0.4 * COALESCE(um.retention_0_1, 0.5)), 0.7)::double precision
      FROM unnest(q.topic_ids) as tid
      LEFT JOIN user_mastery um ON um.topic_id = tid
    ) as knowledge_gap,
    -- Difficulty match component
    (1.0 - ABS(COALESCE(q.difficulty, 3) - p_target_difficulty)::double precision / 4.0)::double precision as difficulty_match
  FROM questions q
  LEFT JOIN user_srs s ON s.question_id = q.id
  LEFT JOIN topics t ON t.id = ANY(q.topic_ids)
  LEFT JOIN course_packs cp ON cp.id = q.course_pack_id
  WHERE q.needs_review = FALSE
    AND COALESCE(q.is_published, true) = true
    AND COALESCE(q.status, 'approved') = 'approved'
    AND (q.course_pack_id IS NULL OR cp.is_published = true)
    -- Exclude questions already attempted today (for fresh recommendations)
    AND NOT EXISTS (SELECT 1 FROM today_attempts ta WHERE ta.question_id = q.id)
    -- Topic coverage constraint: skip when p_ignore_constraints = true
    AND (p_ignore_constraints = TRUE OR t.scheduled_week IS NULL OR t.scheduled_week <= v_effective_week)
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
        SELECT COALESCE(1.0 - AVG(0.6 * COALESCE(um2.mastery_0_1, 0.0) + 0.4 * COALESCE(um2.retention_0_1, 0.5)), 0.7)::double precision
        FROM unnest(q.topic_ids) as tid2
        LEFT JOIN user_mastery um2 ON um2.topic_id = tid2
      ) * 0.4 +
      (1.0 - ABS(COALESCE(q.difficulty, 3) - p_target_difficulty)::double precision / 4.0)::double precision * 0.3
    ) END DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
