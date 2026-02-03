-- Calendar Review Data RPC
-- Returns per-day, per-topic FSRS review counts for the calendar grid view.
-- Bucketing: overdue cards are collapsed into today (same as get_review_forecast).

CREATE OR REPLACE FUNCTION public.get_calendar_review_data(
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
  due_count bigint,
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
  SELECT
    CASE
      WHEN s.due_at::date < v_today THEN v_today  -- bucket overdue into today
      ELSE s.due_at::date
    END AS due_date,
    t.id AS topic_id,
    t.title AS topic_title,
    q.course_pack_id,
    COUNT(DISTINCT q.id) AS due_count,
    s.due_at::date < v_today AS is_overdue
  FROM srs_state s
  JOIN questions q ON q.id = s.question_id
  CROSS JOIN LATERAL unnest(q.topic_ids) AS ut(topic_uuid)
  JOIN topics t ON t.id = ut.topic_uuid
  WHERE s.user_id = p_user_id
    AND s.state IN (1, 2, 3)  -- learning, review, relearning
    AND q.needs_review = FALSE
    AND COALESCE(q.is_published, true) = true
    AND COALESCE(q.status, 'approved') = 'approved'
    AND (
      p_course_ids IS NULL
      OR q.course_pack_id = ANY(p_course_ids)
    )
    AND (
      -- Include overdue cards bucketed to today, or future cards within range
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
  ORDER BY due_date, due_count DESC;
END;
$$;
