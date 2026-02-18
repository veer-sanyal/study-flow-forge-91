-- Add recency boost to build_daily_plan for topics covered in last 7 days
-- This ensures topics covered in class recently get high priority for immediate review

CREATE OR REPLACE FUNCTION public.build_daily_plan(
  p_user_id uuid,
  p_course_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 10,
  p_current_week integer DEFAULT NULL,
  p_pace_offset integer DEFAULT 1
)
RETURNS SETOF daily_plan_question
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_week integer;
  v_current_date date;
  v_is_behind boolean := false;
  v_days_since_practice integer;
  v_low_mastery_count integer;
  v_total_eligible_topics integer;
  v_recent_accuracy numeric;
  v_unpracticed_count integer;

  -- Mix quotas
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
  -- Determine current week and date
  v_current_week := COALESCE(p_current_week, EXTRACT(WEEK FROM now())::integer);
  v_current_date := CURRENT_DATE;

  -- Get user's average difficulty level
  SELECT COALESCE(AVG(effective_difficulty_level), 3)::integer
  INTO v_user_difficulty
  FROM topic_mastery
  WHERE user_id = p_user_id;

  -- Get next upcoming exam info
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
  -- 1. Days since last practice
  SELECT EXTRACT(DAY FROM (now() - MAX(last_practiced_at)))::integer
  INTO v_days_since_practice
  FROM topic_mastery
  WHERE user_id = p_user_id;
  v_days_since_practice := COALESCE(v_days_since_practice, 999);

  -- 2. Count low mastery topics (mastery < 0.5)
  -- Use scheduled_date if available, otherwise fall back to scheduled_date
  SELECT COUNT(*)
  INTO v_low_mastery_count
  FROM topic_mastery tm
  JOIN topics t ON tm.topic_id = t.id
  WHERE tm.user_id = p_user_id
    AND tm.mastery_0_1 < 0.5
    AND (
      (t.scheduled_date IS NOT NULL AND t.scheduled_date <= v_current_date + (p_pace_offset * INTERVAL '7 days'))
      OR (t.scheduled_date IS NULL AND t.scheduled_date <= v_current_week + p_pace_offset)
    )
    AND (p_course_id IS NULL OR t.course_pack_id = p_course_id);

  -- 3. Total eligible topics
  SELECT COUNT(*)
  INTO v_total_eligible_topics
  FROM topics t
  WHERE (
    (t.scheduled_date IS NOT NULL AND t.scheduled_date <= v_current_date + (p_pace_offset * INTERVAL '7 days'))
    OR (t.scheduled_date IS NULL AND t.scheduled_date <= v_current_week + p_pace_offset)
  )
    AND (p_course_id IS NULL OR t.course_pack_id = p_course_id);
  v_total_eligible_topics := GREATEST(v_total_eligible_topics, 1);

  -- 4. Recent accuracy (last 10 attempts)
  SELECT COALESCE(AVG(CASE WHEN is_correct THEN 1.0 ELSE 0.0 END), 0.5)
  INTO v_recent_accuracy
  FROM (
    SELECT is_correct
    FROM attempts
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) recent;

  -- 5. Unpracticed eligible topics
  SELECT COUNT(*)
  INTO v_unpracticed_count
  FROM topics t
  WHERE (
    (t.scheduled_date IS NOT NULL AND t.scheduled_date <= v_current_date + (p_pace_offset * INTERVAL '7 days'))
    OR (t.scheduled_date IS NULL AND t.scheduled_date <= v_current_week + p_pace_offset)
  )
    AND (p_course_id IS NULL OR t.course_pack_id = p_course_id)
    AND NOT EXISTS (
      SELECT 1 FROM topic_mastery tm
      WHERE tm.topic_id = t.id AND tm.user_id = p_user_id
    );

  -- Determine if behind
  v_is_behind := (
    v_days_since_practice > 3 OR
    (v_low_mastery_count::numeric / v_total_eligible_topics) > 0.5 OR
    v_recent_accuracy < 0.6 OR
    (v_unpracticed_count::numeric / v_total_eligible_topics) > 0.4
  );

  -- Adjust mix based on behind status
  IF v_is_behind THEN
    v_review_quota := 2;
    v_current_quota := 0;
    v_bridge_quota := GREATEST(3, p_limit - 2);
    v_stretch_quota := 0;
  ELSE
    -- Default: 2 Review + 2 Current + 1 Stretch, scale with limit
    v_review_quota := GREATEST(2, (p_limit * 0.3)::integer);
    v_current_quota := GREATEST(2, (p_limit * 0.4)::integer);
    v_bridge_quota := 0;
    v_stretch_quota := GREATEST(1, (p_limit * 0.1)::integer);
  END IF;

  -- === BUILD THE DAILY PLAN ===

  -- 1. REVIEW questions (SRS overdue, retention refresh) - USING FSRS STATE
  RETURN QUERY
  WITH review_candidates AS (
    SELECT
      q.id as question_id,
      q.prompt,
      q.choices,
      q.correct_answer,
      q.hint,
      q.solution_steps,
      COALESCE(q.difficulty, 3) as difficulty,
      q.source_exam,
      q.topic_ids,
      q.question_type_id,
      'review'::text as category,
      CASE
        -- FSRS State 1 = Learning, State 3 = Relearning - prioritize these
        WHEN srs.state IN (1, 3) AND srs.due_at <= now() THEN
          'Learning/Relearning card - high priority'
        WHEN srs.due_at < now() - interval '7 days' THEN
          'Overdue by ' || EXTRACT(DAY FROM (now() - srs.due_at))::integer || ' days'
        WHEN srs.due_at < now() THEN 'Due for review'
        ELSE 'Retention refresh'
      END as why_selected,
      -- Priority: FSRS Learning/Relearning cards get highest priority, then by overdue time
      CASE
        WHEN srs.state IN (1, 3) AND srs.due_at <= now() THEN 1000.0  -- Highest priority
        WHEN srs.due_at <= now() THEN
          -- More overdue = higher priority, but cap at reasonable level
          LEAST(500.0, EXTRACT(EPOCH FROM (now() - srs.due_at)) / 86400.0)
        ELSE
          -- Not yet due, but include for retention refresh (lower priority)
          GREATEST(0.0, 10.0 - EXTRACT(EPOCH FROM (srs.due_at - now()) / 86400.0))
      END as priority_score
    FROM questions q
    JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
    JOIN topics t ON t.id = ANY(q.topic_ids)
    WHERE q.needs_review = false
      AND COALESCE(q.is_published, true) = true
      AND COALESCE(q.status, 'approved') = 'approved'
      AND srs.due_at <= now() + interval '1 day'
      AND (
        (t.scheduled_date IS NOT NULL AND t.scheduled_date <= v_current_date + (p_pace_offset * INTERVAL '7 days'))
        OR (t.scheduled_date IS NULL AND t.scheduled_date <= v_current_week + p_pace_offset)
      )
      AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
      AND ABS(COALESCE(q.difficulty, 3) - v_user_difficulty) <= 1
    ORDER BY priority_score DESC
    LIMIT v_review_quota
  )
  SELECT * FROM review_candidates;

  -- Track how many review we got
  GET DIAGNOSTICS v_review_count = ROW_COUNT;
  v_total_count := v_review_count;

  -- 2. CURRENT questions (recent topics from schedule) - USING SCHEDULED_DATE
  -- NOW WITH RECENCY BOOST: Topics covered in last 7 days get high priority
  IF NOT v_is_behind AND v_total_count < p_limit THEN
    RETURN QUERY
    WITH current_candidates AS (
      SELECT
        q.id as question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3) as difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'current'::text as category,
        CASE
          WHEN t.scheduled_date IS NOT NULL THEN
            'Topic from ' || to_char(t.scheduled_date, 'Mon DD') || ' - ' || t.title
          ELSE
            'Topic from week ' || t.scheduled_date || ' - ' || t.title
        END as why_selected,
        -- Priority: prefer unpracticed topics, then lower mastery, use date proximity
        -- RECENCY BOOST: +75 for today, decaying over 7 days
        (CASE WHEN tm.id IS NULL THEN 100.0 ELSE 0.0 END) +
        (1.0 - COALESCE(tm.mastery_0_1, 0.5)) * 50.0 +
        -- NEW: Recency boost for topics covered in last 7 days
        CASE
          WHEN t.scheduled_date IS NOT NULL
            AND t.scheduled_date >= v_current_date - INTERVAL '7 days'
            AND t.scheduled_date <= v_current_date
          THEN
            -- Stronger boost for more recent coverage
            -- Today = +75, yesterday = ~+64, 7 days ago = +11
            75.0 - (EXTRACT(DAY FROM (v_current_date - t.scheduled_date)) * 9.0)
          ELSE 0.0
        END +
        -- Existing date proximity (for future topics within pace window)
        CASE
          WHEN t.scheduled_date IS NOT NULL THEN
            -- Use date proximity: closer to scheduled_date = higher priority
            GREATEST(0.0, 10.0 - ABS(EXTRACT(DAY FROM (v_current_date - t.scheduled_date))))
          ELSE
            -- Fall back to week-based
            (v_current_week - COALESCE(t.scheduled_date, 1))::numeric
        END as priority_score
      FROM questions q
      JOIN topics t ON t.id = ANY(q.topic_ids)
      LEFT JOIN topic_mastery tm ON tm.topic_id = t.id AND tm.user_id = p_user_id
      LEFT JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND (
          -- Use scheduled_date if available, otherwise scheduled_date
          (t.scheduled_date IS NOT NULL
            AND t.scheduled_date >= v_current_date - INTERVAL '14 days'
            AND t.scheduled_date <= v_current_date + (p_pace_offset * INTERVAL '7 days'))
          OR (t.scheduled_date IS NULL
            AND t.scheduled_date BETWEEN (v_current_week - 2) AND (v_current_week + p_pace_offset))
        )
        AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
        AND ABS(COALESCE(q.difficulty, 3) - v_user_difficulty) <= 1
        AND srs.id IS NULL -- Not already in SRS (not reviewed before)
      ORDER BY priority_score DESC
      LIMIT v_current_quota
    )
    SELECT * FROM current_candidates;

    GET DIAGNOSTICS v_current_count = ROW_COUNT;
    v_total_count := v_total_count + v_current_count;
  END IF;

  -- 3. BRIDGE questions (easy prereqs for behind students)
  IF v_is_behind AND v_total_count < p_limit THEN
    RETURN QUERY
    WITH bridge_candidates AS (
      SELECT
        q.id as question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3) as difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'bridge'::text as category,
        'Catch-up: ' || t.title || ' (foundation topic)' as why_selected,
        -- Priority: prefer lower difficulty, earlier dates/weeks, lower mastery
        (5 - COALESCE(q.difficulty, 3))::numeric * 20.0 +
        CASE
          WHEN t.scheduled_date IS NOT NULL THEN
            -- Earlier dates = higher priority
            (EXTRACT(DAY FROM (v_current_date - t.scheduled_date))::numeric * 5.0)
          ELSE
            (v_current_week - COALESCE(t.scheduled_date, 1))::numeric * 5.0
        END +
        (1.0 - COALESCE(tm.mastery_0_1, 0.5)) * 30.0 as priority_score
      FROM questions q
      JOIN topics t ON t.id = ANY(q.topic_ids)
      LEFT JOIN topic_mastery tm ON tm.topic_id = t.id AND tm.user_id = p_user_id
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND COALESCE(q.difficulty, 3) <= 2 -- Easy questions only
        AND (
          (t.scheduled_date IS NOT NULL AND t.scheduled_date <= v_current_date)
          OR (t.scheduled_date IS NULL AND t.scheduled_date <= v_current_week)
        )
        AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
        AND (tm.id IS NULL OR tm.mastery_0_1 < 0.7) -- Unpracticed or weak
      ORDER BY priority_score DESC
      LIMIT v_bridge_quota
    )
    SELECT * FROM bridge_candidates;

    GET DIAGNOSTICS v_bridge_count = ROW_COUNT;
    v_total_count := v_total_count + v_bridge_count;
  END IF;

  -- 4. STRETCH questions (harder exam-style, only if not behind)
  IF NOT v_is_behind AND v_total_count < p_limit THEN
    RETURN QUERY
    WITH stretch_candidates AS (
      SELECT
        q.id as question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3) as difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'stretch'::text as category,
        CASE
          WHEN v_next_exam_days <= 14 THEN v_next_exam_name || ' in ' || v_next_exam_days || ' days - exam prep'
          ELSE 'Challenge question to level up'
        END as why_selected,
        -- Priority: prefer exam-relevant topics, higher difficulty
        COALESCE(q.difficulty, 3)::numeric * 10.0 +
        (CASE WHEN q.source_exam IS NOT NULL THEN 50.0 ELSE 0.0 END) +
        (CASE WHEN v_next_exam_days <= 14 THEN 30.0 ELSE 0.0 END) as priority_score
      FROM questions q
      JOIN topics t ON t.id = ANY(q.topic_ids)
      LEFT JOIN topic_mastery tm ON tm.topic_id = t.id AND tm.user_id = p_user_id
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND COALESCE(q.difficulty, 3) >= v_user_difficulty
        AND (
          (t.scheduled_date IS NOT NULL AND t.scheduled_date <= v_current_date + (p_pace_offset * INTERVAL '7 days'))
          OR (t.scheduled_date IS NULL AND t.scheduled_date <= v_current_week + p_pace_offset)
        )
        AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
        AND COALESCE(tm.mastery_0_1, 0.5) >= 0.5 -- Only if they have some mastery
      ORDER BY priority_score DESC
      LIMIT v_stretch_quota
    )
    SELECT * FROM stretch_candidates;

    GET DIAGNOSTICS v_stretch_count = ROW_COUNT;
    v_total_count := v_total_count + v_stretch_count;
  END IF;

  -- 5. FILL remaining slots with any eligible questions
  IF v_total_count < p_limit THEN
    RETURN QUERY
    WITH fill_candidates AS (
      SELECT
        q.id as question_id,
        q.prompt,
        q.choices,
        q.correct_answer,
        q.hint,
        q.solution_steps,
        COALESCE(q.difficulty, 3) as difficulty,
        q.source_exam,
        q.topic_ids,
        q.question_type_id,
        'current'::text as category,
        'Practice: ' || t.title as why_selected,
        random() as priority_score
      FROM questions q
      JOIN topics t ON t.id = ANY(q.topic_ids)
      LEFT JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
      WHERE q.needs_review = false
        AND COALESCE(q.is_published, true) = true
        AND COALESCE(q.status, 'approved') = 'approved'
        AND (
          (t.scheduled_date IS NOT NULL AND t.scheduled_date <= v_current_date + (p_pace_offset * INTERVAL '7 days'))
          OR (t.scheduled_date IS NULL AND t.scheduled_date <= v_current_week + p_pace_offset)
        )
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.build_daily_plan TO authenticated;

COMMENT ON FUNCTION public.build_daily_plan IS 'Builds an intentional daily study plan with Review, Current, Bridge, and Stretch questions. Uses FSRS state for prioritization and scheduled_date (exact dates) when available, falling back to scheduled_date. Includes recency boost for topics covered in last 7 days.';
