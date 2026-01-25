-- Phase 2: Build Daily Plan RPC with Intentional Mix Categories
-- Creates a smart daily plan with Review, Current, Bridge, and Stretch questions

-- First, create a type for the daily plan result
DROP TYPE IF EXISTS daily_plan_question CASCADE;
CREATE TYPE daily_plan_question AS (
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
  category text,           -- 'review', 'current', 'bridge', 'stretch'
  why_selected text,       -- Human-readable reason
  priority_score numeric
);

-- Create the build_daily_plan function
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
  -- Determine current week
  v_current_week := COALESCE(p_current_week, EXTRACT(WEEK FROM now())::integer);
  
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
  SELECT COUNT(*)
  INTO v_low_mastery_count
  FROM topic_mastery tm
  JOIN topics t ON tm.topic_id = t.id
  WHERE tm.user_id = p_user_id
    AND tm.mastery_0_1 < 0.5
    AND t.scheduled_week <= v_current_week + p_pace_offset
    AND (p_course_id IS NULL OR t.course_pack_id = p_course_id);
  
  -- 3. Total eligible topics
  SELECT COUNT(*)
  INTO v_total_eligible_topics
  FROM topics t
  WHERE t.scheduled_week <= v_current_week + p_pace_offset
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
  WHERE t.scheduled_week <= v_current_week + p_pace_offset
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
  
  -- 1. REVIEW questions (SRS overdue, retention refresh)
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
        WHEN srs.due_at < now() - interval '7 days' THEN 
          'Overdue by ' || EXTRACT(DAY FROM (now() - srs.due_at))::integer || ' days'
        WHEN srs.due_at < now() THEN 'Due for review'
        ELSE 'Retention refresh'
      END as why_selected,
      -- Priority: higher for more overdue
      EXTRACT(EPOCH FROM (now() - srs.due_at)) / 86400.0 as priority_score
    FROM questions q
    JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
    JOIN topics t ON t.id = ANY(q.topic_ids)
    WHERE q.needs_review = false
      AND srs.due_at <= now() + interval '1 day'
      AND t.scheduled_week <= v_current_week + p_pace_offset
      AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
      AND ABS(COALESCE(q.difficulty, 3) - v_user_difficulty) <= 1
    ORDER BY priority_score DESC
    LIMIT v_review_quota
  )
  SELECT * FROM review_candidates;
  
  -- Track how many review we got
  GET DIAGNOSTICS v_review_count = ROW_COUNT;
  v_total_count := v_review_count;
  
  -- 2. CURRENT questions (recent topics from schedule)
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
        'Topic from week ' || t.scheduled_week || ' - ' || t.title as why_selected,
        -- Priority: prefer unpracticed topics, then lower mastery
        (CASE WHEN tm.id IS NULL THEN 100.0 ELSE 0.0 END) +
        (1.0 - COALESCE(tm.mastery_0_1, 0.5)) * 50.0 +
        (v_current_week - COALESCE(t.scheduled_week, 1))::numeric as priority_score
      FROM questions q
      JOIN topics t ON t.id = ANY(q.topic_ids)
      LEFT JOIN topic_mastery tm ON tm.topic_id = t.id AND tm.user_id = p_user_id
      LEFT JOIN srs_state srs ON srs.question_id = q.id AND srs.user_id = p_user_id
      WHERE q.needs_review = false
        AND t.scheduled_week BETWEEN (v_current_week - 2) AND (v_current_week + p_pace_offset)
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
        -- Priority: prefer lower difficulty, earlier weeks, lower mastery
        (5 - COALESCE(q.difficulty, 3))::numeric * 20.0 +
        (v_current_week - COALESCE(t.scheduled_week, 1))::numeric * 5.0 +
        (1.0 - COALESCE(tm.mastery_0_1, 0.5)) * 30.0 as priority_score
      FROM questions q
      JOIN topics t ON t.id = ANY(q.topic_ids)
      LEFT JOIN topic_mastery tm ON tm.topic_id = t.id AND tm.user_id = p_user_id
      WHERE q.needs_review = false
        AND COALESCE(q.difficulty, 3) <= 2 -- Easy questions only
        AND t.scheduled_week <= v_current_week
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
        AND COALESCE(q.difficulty, 3) >= v_user_difficulty
        AND t.scheduled_week <= v_current_week + p_pace_offset
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
        AND t.scheduled_week <= v_current_week + p_pace_offset
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

-- Add helpful comments
COMMENT ON FUNCTION public.build_daily_plan IS 'Builds an intentional daily study plan with Review, Current, Bridge, and Stretch questions based on learner state';