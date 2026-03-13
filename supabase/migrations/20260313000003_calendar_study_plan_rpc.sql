-- Phase 3: Calendar Study Plan RPC
-- Proactive per-day workload projection combining new topics, reviews, and reinforcement.

CREATE OR REPLACE FUNCTION get_calendar_study_plan(
  p_user_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT CURRENT_DATE + 14,
  p_enrolled_course_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
  plan_date DATE,
  new_topic_id UUID,
  new_topic_title TEXT,
  new_question_count BIGINT,
  review_question_count BIGINT,
  intro_reinforcement_count BIGINT,
  estimated_questions BIGINT,
  estimated_minutes BIGINT,
  has_missing_questions BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT d::date AS plan_date
    FROM generate_series(p_start_date, p_end_date, '1 day'::interval) d
  ),
  -- New topics: calendar_events (event_type='topic') matched to topics and their questions
  new_topics AS (
    SELECT
      ce.event_date::date AS plan_date,
      t.id AS topic_id,
      t.title AS topic_title,
      COUNT(DISTINCT q.id) AS question_count
    FROM calendar_events ce
    JOIN topics t ON t.course_pack_id = ce.course_pack_id
      AND LOWER(TRIM(t.title)) ILIKE '%' || LOWER(TRIM(ce.title)) || '%'
    JOIN questions q ON q.topic_ids && ARRAY[t.id] AND q.needs_review = false
    WHERE ce.event_type = 'topic'
      AND ce.event_date::date BETWEEN p_start_date AND p_end_date
      AND (p_enrolled_course_ids IS NULL OR ce.course_pack_id = ANY(p_enrolled_course_ids))
      -- Not yet in SRS for this user
      AND NOT EXISTS (
        SELECT 1 FROM srs_state ss
        WHERE ss.user_id = p_user_id AND ss.question_id = q.id
      )
    GROUP BY ce.event_date::date, t.id, t.title
  ),
  -- Topics with no questions (for missing questions warning)
  missing_topics AS (
    SELECT
      ce.event_date::date AS plan_date,
      t.id AS topic_id
    FROM calendar_events ce
    JOIN topics t ON t.course_pack_id = ce.course_pack_id
      AND LOWER(TRIM(t.title)) ILIKE '%' || LOWER(TRIM(ce.title)) || '%'
    WHERE ce.event_type = 'topic'
      AND ce.event_date::date BETWEEN p_start_date AND p_end_date
      AND (p_enrolled_course_ids IS NULL OR ce.course_pack_id = ANY(p_enrolled_course_ids))
      AND NOT EXISTS (
        SELECT 1 FROM questions q WHERE q.topic_ids && ARRAY[t.id] AND q.needs_review = false
      )
  ),
  -- Reviews: SRS due items bucketed by due_at date (overdue bucketed to today)
  reviews AS (
    SELECT
      CASE
        WHEN ss.due_at::date < p_start_date THEN p_start_date
        ELSE ss.due_at::date
      END AS plan_date,
      COUNT(*) AS review_count
    FROM srs_state ss
    JOIN questions q ON q.id = ss.question_id
    WHERE ss.user_id = p_user_id
      AND ss.state IN (1, 2, 3)
      AND ss.due_at::date <= p_end_date
      AND (p_enrolled_course_ids IS NULL OR q.course_pack_id = ANY(p_enrolled_course_ids))
    GROUP BY 1
  ),
  -- Reinforcement: recently introduced topics (last 3 days) with unstarted questions
  reinforcement AS (
    SELECT
      ds.plan_date,
      COUNT(DISTINCT q.id) AS reinforce_count
    FROM date_series ds
    JOIN topic_intro_status tis ON tis.user_id = p_user_id
      AND tis.introduced_at::date BETWEEN (ds.plan_date - INTERVAL '3 days')::date AND ds.plan_date
    JOIN questions q ON q.topic_ids && ARRAY[tis.topic_id] AND q.needs_review = false
      AND (p_enrolled_course_ids IS NULL OR q.course_pack_id = ANY(p_enrolled_course_ids))
    WHERE NOT EXISTS (
      SELECT 1 FROM srs_state ss
      WHERE ss.user_id = p_user_id AND ss.question_id = q.id
    )
    -- Exclude questions already counted as "new" for that date
    AND NOT EXISTS (
      SELECT 1 FROM new_topics nt
      WHERE nt.plan_date = ds.plan_date AND q.topic_ids && ARRAY[nt.topic_id]
    )
    GROUP BY ds.plan_date
  ),
  -- Aggregate per date
  combined AS (
    SELECT
      ds.plan_date,
      nt.topic_id AS new_topic_id,
      nt.topic_title AS new_topic_title,
      COALESCE(nt.question_count, 0) AS new_question_count,
      COALESCE(rv.review_count, 0) AS review_question_count,
      COALESCE(rf.reinforce_count, 0) AS intro_reinforcement_count,
      COALESCE(nt.question_count, 0) + COALESCE(rv.review_count, 0) + COALESCE(rf.reinforce_count, 0) AS estimated_questions,
      CEIL((COALESCE(nt.question_count, 0) + COALESCE(rv.review_count, 0) + COALESCE(rf.reinforce_count, 0)) * 1.5) AS estimated_minutes,
      EXISTS (SELECT 1 FROM missing_topics mt WHERE mt.plan_date = ds.plan_date) AS has_missing_questions
    FROM date_series ds
    LEFT JOIN new_topics nt ON nt.plan_date = ds.plan_date
    LEFT JOIN reviews rv ON rv.plan_date = ds.plan_date
    LEFT JOIN reinforcement rf ON rf.plan_date = ds.plan_date
  )
  SELECT
    c.plan_date,
    c.new_topic_id,
    c.new_topic_title,
    c.new_question_count,
    c.review_question_count,
    c.intro_reinforcement_count,
    c.estimated_questions,
    c.estimated_minutes,
    c.has_missing_questions
  FROM combined c
  WHERE c.estimated_questions > 0 OR c.has_missing_questions
  ORDER BY c.plan_date;
END;
$$;
