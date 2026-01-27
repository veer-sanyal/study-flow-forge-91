-- Update get_recommended_questions to add p_ignore_constraints parameter
-- This allows custom focus to retrieve ALL questions matching the filter criteria
-- without applying topic coverage or difficulty restrictions

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
  p_ignore_constraints boolean DEFAULT FALSE
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
BEGIN
  -- Calculate effective week based on pace
  v_effective_week := p_current_week + p_pace_offset;

  RETURN QUERY
  WITH user_srs AS (
    SELECT 
      s.question_id,
      s.due_at,
      s.interval_days,
      s.ease
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
    -- Calculate composite score (only matters when p_ignore_constraints = false)
    (
      COALESCE(
        CASE 
          WHEN s.due_at IS NULL THEN 0.5
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
    -- Due urgency component
    COALESCE(
      CASE 
        WHEN s.due_at IS NULL THEN 0.5
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
    -- Topic coverage constraint: skip when p_ignore_constraints = true
    AND (p_ignore_constraints = TRUE OR t.scheduled_week IS NULL OR t.scheduled_week <= v_effective_week)
    -- Filter conditions with proper UUID comparison
    AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
    AND (p_exam_name IS NULL OR q.source_exam = p_exam_name)
    AND (p_topic_ids IS NULL OR q.topic_ids && p_topic_ids)
    AND (p_question_type_id IS NULL OR q.question_type_id = p_question_type_id)
  ORDER BY q.id, 
    CASE WHEN p_ignore_constraints THEN q.question_order END ASC NULLS LAST,
    CASE WHEN NOT p_ignore_constraints THEN (
      COALESCE(
        CASE 
          WHEN s.due_at IS NULL THEN 0.5
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
    ) END DESC NULLS LAST
  LIMIT p_limit;
END;
$$;