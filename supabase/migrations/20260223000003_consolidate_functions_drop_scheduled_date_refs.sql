-- Consolidate all function versions to single canonical definitions.
--
-- Problems fixed:
-- 1. get_recommended_questions: belt-and-suspenders DROP of any stale overloads
--    (v1-v4 dropped in 20260223000001; v5 recreated in 20260223000002)
-- 2. build_daily_plan: referenced t.scheduled_date throughout, which was dropped
--    in migration 20260216000001_cleanup_topics_calendar. Recreated without it.
--
-- Strategy for build_daily_plan:
--   - Removed JOIN topics t from all CTEs that only used it for scheduled_date filtering
--   - Replaced with correlated subqueries for topic title (why_selected)
--   - LATERAL join for mastery aggregation (avoids duplicate rows)
--   - All topic scheduling WHERE conditions removed (no column to filter on)
--   - Behind-detection queries simplified (count all course topics, no date filter)

-- ============================================================
-- 1. get_recommended_questions: drop any lingering stale overloads
--    Canonical 11-param version was recreated in 20260223000002.
-- ============================================================
DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer, uuid, text, text[], uuid);
DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer, uuid, text, uuid[], uuid);
DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer, uuid, text, uuid[], uuid, boolean);

-- ============================================================
-- 2. build_daily_plan: recreate without t.scheduled_date references
-- ============================================================
CREATE OR REPLACE FUNCTION public.build_daily_plan(
  p_user_id uuid,
  p_course_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_current_week integer DEFAULT NULL,  -- kept for API compatibility; no longer used
  p_pace_offset integer DEFAULT 1
)
RETURNS SETOF daily_plan_question
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_behind boolean := false;
  v_days_since_practice integer;
  v_low_mastery_count integer;
  v_total_eligible_topics integer;
  v_recent_accuracy numeric;
  v_unpracticed_count integer;

  v_review_quota integer := 2;
  v_current_quota integer := 2;
  v_bridge_quota integer := 0;
  v_stretch_quota integer := 1;

  v_review_count integer := 0;
  v_current_count integer := 0;
  v_bridge_count integer := 0;
  v_stretch_count integer := 0;
  v_total_count integer := 0;

  v_user_difficulty integer;
  v_next_exam_days integer;
  v_next_exam_name text;
BEGIN
  -- User's average difficulty level
  SELECT COALESCE(AVG(effective_difficulty_level), 3)::integer
  INTO v_user_difficulty
  FROM topic_mastery
  WHERE user_id = p_user_id;

  -- Next upcoming exam
  SELECT
    EXTRACT(DAY FROM (ce.event_date - CURRENT_DATE))::integer,
    ce.title
  INTO v_next_exam_days, v_next_exam_name
  FROM calendar_events ce
  WHERE ce.event_type IN ('midterm', 'exam', 'final')
    AND ce.event_date >= CURRENT_DATE
    AND (p_course_id IS NULL OR ce.course_pack_id = p_course_id)
  ORDER BY ce.event_date ASC
  LIMIT 1;

  v_next_exam_days := COALESCE(v_next_exam_days, 30);
  v_next_exam_name := COALESCE(v_next_exam_name, 'upcoming exam');

  -- === BEHIND DETECTION ===

  SELECT EXTRACT(DAY FROM (now() - MAX(last_practiced_at)))::integer
  INTO v_days_since_practice
  FROM topic_mastery
  WHERE user_id = p_user_id;
  v_days_since_practice := COALESCE(v_days_since_practice, 999);

  -- Low mastery topics (no schedule filter — scheduled_date was dropped)
  SELECT COUNT(*)
  INTO v_low_mastery_count
  FROM topic_mastery tm
  JOIN topics t ON tm.topic_id = t.id
  WHERE tm.user_id = p_user_id
    AND tm.mastery_0_1 < 0.5
    AND (p_course_id IS NULL OR t.course_pack_id = p_course_id);

  -- Total eligible topics
  SELECT COUNT(*)
  INTO v_total_eligible_topics
  FROM topics t
  WHERE (p_course_id IS NULL OR t.course_pack_id = p_course_id);
  v_total_eligible_topics := GREATEST(v_total_eligible_topics, 1);

  -- Recent accuracy (last 10 attempts)
  SELECT COALESCE(AVG(CASE WHEN is_correct THEN 1.0 ELSE 0.0 END), 0.5)
  INTO v_recent_accuracy
  FROM (
    SELECT is_correct
    FROM attempts
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) recent;

  -- Unpracticed topics
  SELECT COUNT(*)
  INTO v_unpracticed_count
  FROM topics t
  WHERE (p_course_id IS NULL OR t.course_pack_id = p_course_id)
    AND NOT EXISTS (
      SELECT 1 FROM topic_mastery tm
      WHERE tm.topic_id = t.id AND tm.user_id = p_user_id
    );

  v_is_behind := (
    v_days_since_practice > 3 OR
    (v_low_mastery_count::numeric / v_total_eligible_topics) > 0.5 OR
    v_recent_accuracy < 0.6 OR
    (v_unpracticed_count::numeric / v_total_eligible_topics) > 0.4
  );

  -- Set quotas
  IF v_is_behind THEN
    v_review_quota  := 2;
    v_current_quota := 0;
    v_bridge_quota  := GREATEST(3, p_limit - 2);
    v_stretch_quota := 0;
  ELSE
    v_review_quota  := GREATEST(2, (p_limit * 0.3)::integer);
    v_current_quota := GREATEST(2, (p_limit * 0.4)::integer);
    v_bridge_quota  := 0;
    v_stretch_quota := GREATEST(1, (p_limit * 0.1)::integer);
  END IF;

  -- ============================================================
  -- 1. REVIEW — SRS overdue (no topics join needed)
  -- ============================================================
  RETURN QUERY
  WITH review_candidates AS (
    SELECT
      q.id                                        AS question_id,
      q.prompt,
      q.choices,
      q.correct_answer,
      q.hint,
      q.solution_steps,
      COALESCE(q.difficulty, 3)                   AS difficulty,
      q.source_exam,
      q.topic_ids,
      q.question_type_id,
      'review'::text                              AS category,
      CASE
        WHEN srs.state IN (1, 3) AND srs.due_at <= now() THEN
          'Learning/Relearning card - high priority'
        WHEN srs.due_at < now() - interval '7 days' THEN
          'Overdue by ' || EXTRACT(DAY FROM (now() - srs.due_at))::integer || ' days'
        WHEN srs.due_at < now() THEN 'Due for review'
        ELSE 'Retention refresh'
      END                                         AS why_selected,
      CASE
        WHEN srs.state IN (1, 3) AND srs.due_at <= now() THEN 1000.0
        WHEN srs.due_at <= now() THEN
          LEAST(500.0, EXTRACT(EPOCH FROM (now() - srs.due_at)) / 86400.0)
        ELSE
          GREATEST(0.0, 10.0 - EXTRACT(EPOCH FROM (srs.due_at - now())) / 86400.0)
      END                                         AS priority_score
    FROM questions q
    JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
    WHERE q.needs_review = false
      AND COALESCE(q.is_published, true) = true
      AND COALESCE(q.status, 'approved') = 'approved'
      AND srs.due_at <= now() + interval '1 day'
      AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
      AND ABS(COALESCE(q.difficulty, 3) - v_user_difficulty) <= 1
    ORDER BY priority_score DESC
    LIMIT v_review_quota
  )
  SELECT * FROM review_candidates;

  GET DIAGNOSTICS v_review_count = ROW_COUNT;
  v_total_count := v_review_count;

  -- ============================================================
  -- 2. CURRENT — unpracticed questions, mastery-ranked
  --    Uses LATERAL for mastery aggregation (no duplicate rows)
  -- ============================================================
  IF NOT v_is_behind AND v_total_count < p_limit THEN
    RETURN QUERY
    WITH current_candidates AS (
      SELECT
        q.id                                        AS question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3)                   AS difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'current'::text                             AS category,
        'Current topic: ' || COALESCE(
          (SELECT t.title FROM topics t WHERE t.id = ANY(q.topic_ids) LIMIT 1),
          'Unknown'
        )                                           AS why_selected,
        (CASE WHEN m.mastery_id IS NULL THEN 100.0 ELSE 0.0 END)
          + (1.0 - m.avg_mastery) * 50.0           AS priority_score
      FROM questions q
      LEFT JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
      -- Aggregate mastery across all topic_ids for this question
      LEFT JOIN LATERAL (
        SELECT
          MIN(tm.id)                  AS mastery_id,
          COALESCE(AVG(tm.mastery_0_1), 0.5) AS avg_mastery
        FROM topic_mastery tm
        WHERE tm.topic_id = ANY(q.topic_ids)
          AND tm.user_id = p_user_id
      ) m ON true
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
        AND ABS(COALESCE(q.difficulty, 3) - v_user_difficulty) <= 1
        AND srs.id IS NULL
      ORDER BY priority_score DESC
      LIMIT v_current_quota
    )
    SELECT * FROM current_candidates;

    GET DIAGNOSTICS v_current_count = ROW_COUNT;
    v_total_count := v_total_count + v_current_count;
  END IF;

  -- ============================================================
  -- 3. BRIDGE — easy catch-up for behind students
  -- ============================================================
  IF v_is_behind AND v_total_count < p_limit THEN
    RETURN QUERY
    WITH bridge_candidates AS (
      SELECT
        q.id                                        AS question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3)                   AS difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'bridge'::text                              AS category,
        'Catch-up: ' || COALESCE(
          (SELECT t.title FROM topics t WHERE t.id = ANY(q.topic_ids) LIMIT 1),
          'Foundation topic'
        ) || ' (foundation topic)'                  AS why_selected,
        (5 - COALESCE(q.difficulty, 3))::numeric * 20.0
          + (1.0 - COALESCE(m.avg_mastery, 0.5)) * 30.0 AS priority_score
      FROM questions q
      LEFT JOIN LATERAL (
        SELECT COALESCE(AVG(tm.mastery_0_1), 0.5) AS avg_mastery,
               MIN(tm.id)                          AS mastery_id
        FROM topic_mastery tm
        WHERE tm.topic_id = ANY(q.topic_ids)
          AND tm.user_id = p_user_id
      ) m ON true
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND COALESCE(q.difficulty, 3) <= 2
        AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
        AND (m.mastery_id IS NULL OR m.avg_mastery < 0.7)
      ORDER BY priority_score DESC
      LIMIT v_bridge_quota
    )
    SELECT * FROM bridge_candidates;

    GET DIAGNOSTICS v_bridge_count = ROW_COUNT;
    v_total_count := v_total_count + v_bridge_count;
  END IF;

  -- ============================================================
  -- 4. STRETCH — harder exam-style (only if not behind)
  -- ============================================================
  IF NOT v_is_behind AND v_total_count < p_limit THEN
    RETURN QUERY
    WITH stretch_candidates AS (
      SELECT
        q.id                                        AS question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3)                   AS difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'stretch'::text                             AS category,
        CASE
          WHEN v_next_exam_days <= 14
            THEN v_next_exam_name || ' in ' || v_next_exam_days || ' days - exam prep'
          ELSE 'Challenge question to level up'
        END                                         AS why_selected,
        COALESCE(q.difficulty, 3)::numeric * 10.0
          + (CASE WHEN q.source_exam IS NOT NULL THEN 50.0 ELSE 0.0 END)
          + (CASE WHEN v_next_exam_days <= 14     THEN 30.0 ELSE 0.0 END) AS priority_score
      FROM questions q
      LEFT JOIN LATERAL (
        SELECT COALESCE(AVG(tm.mastery_0_1), 0.5) AS avg_mastery
        FROM topic_mastery tm
        WHERE tm.topic_id = ANY(q.topic_ids)
          AND tm.user_id = p_user_id
      ) m ON true
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND COALESCE(q.difficulty, 3) >= v_user_difficulty
        AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
        AND m.avg_mastery >= 0.5
      ORDER BY priority_score DESC
      LIMIT v_stretch_quota
    )
    SELECT * FROM stretch_candidates;

    GET DIAGNOSTICS v_stretch_count = ROW_COUNT;
    v_total_count := v_total_count + v_stretch_count;
  END IF;

  -- ============================================================
  -- 5. FILL — any remaining eligible questions
  -- ============================================================
  IF v_total_count < p_limit THEN
    RETURN QUERY
    WITH fill_candidates AS (
      SELECT
        q.id                                        AS question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3)                   AS difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'current'::text                             AS category,
        'Practice: ' || COALESCE(
          (SELECT t.title FROM topics t WHERE t.id = ANY(q.topic_ids) LIMIT 1),
          'General'
        )                                           AS why_selected,
        random()                                    AS priority_score
      FROM questions q
      LEFT JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
        AND srs.id IS NULL
      ORDER BY priority_score DESC
      LIMIT (p_limit - v_total_count)
    )
    SELECT * FROM fill_candidates;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_daily_plan TO authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
