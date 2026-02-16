-- Fix get_calendar_study_data RPC: topics_covered column was dropped.
-- The "new" section now joins calendar_events to topics via title match directly
-- (topic events have the topic title in calendar_events.title).

CREATE OR REPLACE FUNCTION public.get_calendar_study_data(
  p_user_id uuid,
  p_course_ids uuid[] DEFAULT NULL,
  p_start_date date DEFAULT current_date,
  p_end_date date DEFAULT current_date + 30,
  p_include_overdue boolean DEFAULT true
)
RETURNS TABLE(
  due_date date,
  topic_id uuid,
  topic_title text,
  course_pack_id uuid,
  status text,
  count bigint,
  is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
BEGIN
  v_today := current_date;

  RETURN QUERY

  -- 1. REVIEWS (from srs_state)
  SELECT
    CASE
      WHEN s.due_at::date < v_today THEN v_today
      ELSE s.due_at::date
    END AS due_date,
    t.id AS topic_id,
    t.title AS topic_title,
    q.course_pack_id,
    'review' AS status,
    COUNT(DISTINCT q.id) AS count,
    s.due_at::date < v_today AS is_overdue
  FROM srs_state s
  JOIN questions q ON q.id = s.question_id
  CROSS JOIN LATERAL unnest(q.topic_ids) AS ut(topic_uuid)
  JOIN topics t ON t.id = ut.topic_uuid
  WHERE s.user_id = p_user_id
    AND s.state IN (1, 2, 3)
    AND q.needs_review = FALSE
    AND COALESCE(q.is_published, true) = true
    AND COALESCE(q.status, 'approved') = 'approved'
    AND (
      p_course_ids IS NULL
      OR q.course_pack_id = ANY(p_course_ids)
    )
    AND (
      CASE
        WHEN s.due_at::date < v_today THEN
          p_include_overdue AND v_today BETWEEN p_start_date AND p_end_date
        ELSE
          s.due_at::date BETWEEN p_start_date AND p_end_date
      END
    )
  GROUP BY
    CASE
      WHEN s.due_at::date < v_today THEN v_today
      ELSE s.due_at::date
    END,
    t.id,
    t.title,
    q.course_pack_id,
    s.due_at::date < v_today

  UNION ALL

  -- 2. NEW (TO STUDY) - from calendar topic events joined to topics by title
  -- Since topics_covered was dropped, we match calendar_events.title to topics.title
  SELECT
    ce.event_date AS due_date,
    t.id AS topic_id,
    t.title AS topic_title,
    ce.course_pack_id,
    'new' AS status,
    COUNT(DISTINCT q.id) AS count,
    FALSE AS is_overdue
  FROM calendar_events ce
  JOIN topics t ON t.course_pack_id = ce.course_pack_id
    AND (
      -- Match by exact title or by stripping "Part N" suffixes
      t.title ILIKE ce.title
      OR ce.title ILIKE t.title || ' - Part%'
    )
  JOIN questions q ON q.topic_ids @> ARRAY[t.id]
  WHERE
    ce.event_type = 'topic'
    AND ce.event_date BETWEEN p_start_date AND p_end_date
    AND (
      p_course_ids IS NULL
      OR ce.course_pack_id = ANY(p_course_ids)
    )
    AND NOT EXISTS (
      SELECT 1 FROM srs_state s
      WHERE s.question_id = q.id
      AND s.user_id = p_user_id
    )
    AND q.needs_review = FALSE
    AND COALESCE(q.is_published, true) = true
    AND COALESCE(q.status, 'approved') = 'approved'
  GROUP BY
    ce.event_date,
    t.id,
    t.title,
    ce.course_pack_id;
END;
$$;
