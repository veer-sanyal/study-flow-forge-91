-- Phase 2: Reserve Pool RPC for Adaptive Sequencing
-- Provides get_reserve_questions() for fetching additional questions mid-session.

CREATE OR REPLACE FUNCTION get_reserve_questions(
  p_user_id UUID,
  p_topic_ids UUID[],
  p_exclude_ids UUID[],
  p_per_topic_limit INT DEFAULT 5,
  p_enrolled_course_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  question_id UUID,
  prompt TEXT,
  choices JSONB,
  correct_answer TEXT,
  hint TEXT,
  solution_steps JSONB,
  difficulty INT,
  topic_ids UUID[],
  course_pack_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id AS question_id,
    q.prompt,
    q.choices,
    q.correct_answer,
    q.hint,
    q.solution_steps,
    q.difficulty,
    q.topic_ids,
    q.course_pack_id
  FROM questions q
  WHERE q.needs_review = false
    AND q.topic_ids && p_topic_ids
    AND (p_exclude_ids IS NULL OR NOT (q.id = ANY(p_exclude_ids)))
    AND (p_enrolled_course_ids IS NULL OR q.course_pack_id = ANY(p_enrolled_course_ids))
    AND NOT EXISTS (
      SELECT 1 FROM attempts a
      WHERE a.user_id = p_user_id
        AND a.question_id = q.id
        AND a.created_at >= CURRENT_DATE
    )
  ORDER BY random()
  LIMIT (array_length(p_topic_ids, 1) * p_per_topic_limit);
END;
$$;
