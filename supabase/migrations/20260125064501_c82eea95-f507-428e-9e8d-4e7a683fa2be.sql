-- Drop and recreate without non-existent ingestion_job_id column reference
DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer, uuid, text, uuid[], uuid);

CREATE FUNCTION public.get_recommended_questions(
  p_user_id uuid,
  p_current_week integer DEFAULT 1,
  p_pace_offset integer DEFAULT 1,
  p_limit integer DEFAULT 10,
  p_target_difficulty integer DEFAULT 3,
  p_course_id uuid DEFAULT NULL,
  p_exam_name text DEFAULT NULL,
  p_topic_ids uuid[] DEFAULT NULL,
  p_question_type_id uuid DEFAULT NULL
)
RETURNS TABLE (
  question_id uuid,
  prompt text,
  choices jsonb,
  correct_answer text,
  hint text,
  solution_steps jsonb,
  difficulty integer,
  topic_ids text[],
  question_type_id uuid,
  source_exam text,
  due_urgency double precision,
  knowledge_gap double precision,
  difficulty_match double precision,
  score double precision
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_week integer;
BEGIN
  v_effective_week := p_current_week + p_pace_offset;

  RETURN QUERY
  WITH user_srs AS (
    SELECT 
      s.question_id,
      s.due_at,
      s.interval_days,
      s.last_reviewed_at
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
  eligible_questions AS (
    SELECT 
      q.id,
      q.prompt,
      q.choices,
      q.correct_answer,
      q.hint,
      q.solution_steps,
      q.difficulty,
      q.topic_ids,
      q.question_type_id,
      q.source_exam,
      s.due_at,
      s.interval_days,
      s.last_reviewed_at,
      CASE 
        WHEN s.due_at IS NULL THEN 0.5
        WHEN s.due_at <= NOW() THEN 1.0 + LEAST(EXTRACT(EPOCH FROM (NOW() - s.due_at)) / 86400.0 / 7.0, 1.0)
        ELSE 0.0
      END as due_urgency,
      (
        SELECT COALESCE(1.0 - AVG(0.6 * COALESCE(um.mastery_0_1, 0.0) + 0.4 * COALESCE(um.retention_0_1, 0.5)), 0.7)
        FROM unnest(q.topic_ids) as tid
        LEFT JOIN user_mastery um ON um.topic_id = tid
      ) as knowledge_gap,
      1.0 - ABS(COALESCE(q.difficulty, 3) - p_target_difficulty) / 4.0 as difficulty_match
    FROM questions q
    LEFT JOIN user_srs s ON s.question_id = q.id
    LEFT JOIN topics t ON t.id = ANY(q.topic_ids)
    LEFT JOIN course_packs cp ON cp.id = q.course_pack_id
    WHERE q.needs_review = FALSE
      AND (q.course_pack_id IS NULL OR cp.is_published = true)
      AND (t.scheduled_date IS NULL OR t.scheduled_date <= v_effective_week)
      -- Filter conditions with proper UUID comparison
      AND (p_course_id IS NULL OR q.course_pack_id = p_course_id)
      AND (p_exam_name IS NULL OR q.source_exam = p_exam_name)
      AND (p_topic_ids IS NULL OR q.topic_ids && p_topic_ids)
      AND (p_question_type_id IS NULL OR q.question_type_id = p_question_type_id)
  )
  SELECT 
    eq.id as question_id,
    eq.prompt,
    eq.choices::jsonb,
    eq.correct_answer,
    eq.hint,
    eq.solution_steps::jsonb,
    eq.difficulty,
    -- Convert UUID array to text array for backwards compatibility with frontend
    ARRAY(SELECT unnest(eq.topic_ids)::text) as topic_ids,
    eq.question_type_id,
    eq.source_exam,
    eq.due_urgency,
    eq.knowledge_gap,
    eq.difficulty_match,
    (eq.due_urgency * 0.4 + eq.knowledge_gap * 0.4 + eq.difficulty_match * 0.2) as score
  FROM eligible_questions eq
  GROUP BY eq.id, eq.prompt, eq.choices, eq.correct_answer, eq.hint, eq.solution_steps, 
           eq.difficulty, eq.topic_ids, eq.question_type_id, eq.source_exam,
           eq.due_urgency, eq.knowledge_gap, eq.difficulty_match
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$;