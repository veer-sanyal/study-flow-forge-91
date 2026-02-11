-- New RPC to fetch both REVIEW and TO-STUDY (new) counts for the calendar
-- Replaces get_calendar_review_data

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
  status text,       -- 'review' or 'new'
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
      WHEN s.due_at::date < v_today THEN v_today  -- bucket overdue into today
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
    AND s.state IN (1, 2, 3)  -- learning, review, relearning
    AND q.needs_review = FALSE
    AND COALESCE(q.is_published, true) = true
    AND COALESCE(q.status, 'approved') = 'approved'
    AND (
      p_course_ids IS NULL
      OR q.course_pack_id = ANY(p_course_ids)
    )
    AND (
      -- Include overdue bucketed to today, or future cards within range
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

  -- 2. NEW (TO STUDY) - from calendar events linked to topics
  -- Only include if date is within range (no bucketing for past "new" items, they stay on their date? 
  -- actually user likely wants to see them as "Missed" or just on the past date. 
  -- For now, let's keep them on their original date to show "what was covered".
  SELECT
    ce.event_date AS due_date,
    t.id AS topic_id,
    t.title AS topic_title,
    ce.course_pack_id,
    'new' AS status,
    COUNT(DISTINCT q.id) AS count,
    FALSE AS is_overdue -- New items don't trigger "overdue" red alert, just exist on past dates
  FROM calendar_events ce
  CROSS JOIN LATERAL unnest(ce.topics_covered) AS event_topic_title
  JOIN topics t ON t.title ILIKE event_topic_title -- Join by Title match
  JOIN questions q ON q.topic_ids @> ARRAY[t.id] -- Questions in that topic
  WHERE
    ce.event_type = 'topic'
    AND ce.event_date BETWEEN p_start_date AND p_end_date
    AND (
      p_course_ids IS NULL 
      OR ce.course_pack_id = ANY(p_course_ids)
    )
    -- Exclude questions that are already in SRS (Learning/Review)
    AND NOT EXISTS (
      SELECT 1 FROM srs_state s 
      WHERE s.question_id = q.id 
      AND s.user_id = p_user_id
    )
    -- Ensure question validity
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
