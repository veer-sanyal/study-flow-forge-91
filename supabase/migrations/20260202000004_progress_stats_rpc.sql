-- Progress Stats RPCs for FSRS-native dashboard
-- RPC 1: get_progress_stats — per-topic FSRS aggregates
-- RPC 2: get_review_forecast — daily review counts for next N days

-- ============================================================
-- RPC 1: get_progress_stats
-- Returns per-topic rows with card counts, FSRS aggregates,
-- and attempt stats within a time window.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_progress_stats(
  p_user_id uuid,
  p_course_ids uuid[] DEFAULT NULL,
  p_days_back integer DEFAULT 7
)
RETURNS TABLE(
  topic_id uuid,
  topic_title text,
  course_pack_id uuid,
  total_cards bigint,
  new_cards bigint,
  learning_cards bigint,
  review_cards bigint,
  due_today bigint,
  median_stability double precision,
  p10_stability double precision,
  median_difficulty double precision,
  median_elapsed_days double precision,
  attempts_count bigint,
  correct_count bigint,
  total_reps bigint,
  total_lapses bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
BEGIN
  v_window_start := now() - (p_days_back || ' days')::interval;

  RETURN QUERY
  WITH topic_cards AS (
    -- Unnest question topic_ids and join to srs_state
    SELECT
      t.id AS tid,
      t.title AS ttitle,
      t.course_pack_id AS cpid,
      s.state,
      s.stability,
      s.difficulty,
      s.elapsed_days,
      s.due_at,
      s.reps,
      s.lapses,
      q.id AS qid
    FROM questions q
    CROSS JOIN LATERAL unnest(q.topic_ids) AS ut(topic_uuid)
    JOIN topics t ON t.id = ut.topic_uuid
    LEFT JOIN srs_state s ON s.question_id = q.id AND s.user_id = p_user_id
    WHERE q.needs_review = FALSE
      AND COALESCE(q.is_published, true) = true
      AND COALESCE(q.status, 'approved') = 'approved'
      AND (
        p_course_ids IS NULL
        OR q.course_pack_id = ANY(p_course_ids)
      )
  ),
  topic_agg AS (
    SELECT
      tc.tid,
      tc.ttitle,
      tc.cpid,
      COUNT(DISTINCT tc.qid) AS total_cards,
      COUNT(DISTINCT tc.qid) FILTER (WHERE tc.state IS NULL OR tc.state = 0) AS new_cards,
      COUNT(DISTINCT tc.qid) FILTER (WHERE tc.state IN (1, 3)) AS learning_cards,
      COUNT(DISTINCT tc.qid) FILTER (WHERE tc.state = 2) AS review_cards,
      COUNT(DISTINCT tc.qid) FILTER (WHERE tc.due_at IS NOT NULL AND tc.due_at <= now()) AS due_today,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY tc.stability) FILTER (WHERE tc.stability > 0) AS median_stability,
      percentile_cont(0.1) WITHIN GROUP (ORDER BY tc.stability) FILTER (WHERE tc.stability > 0) AS p10_stability,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY tc.difficulty) FILTER (WHERE tc.stability > 0) AS median_difficulty,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY tc.elapsed_days) FILTER (WHERE tc.stability > 0) AS median_elapsed_days,
      COALESCE(SUM(tc.reps), 0) AS total_reps,
      COALESCE(SUM(tc.lapses), 0) AS total_lapses
    FROM topic_cards tc
    GROUP BY tc.tid, tc.ttitle, tc.cpid
  ),
  topic_attempts AS (
    -- Attempt stats within window, grouped by topic
    SELECT
      ut.topic_uuid AS tid,
      COUNT(*) AS attempts_count,
      COUNT(*) FILTER (WHERE a.is_correct) AS correct_count
    FROM attempts a
    JOIN questions q ON q.id = a.question_id
    CROSS JOIN LATERAL unnest(q.topic_ids) AS ut(topic_uuid)
    WHERE a.user_id = p_user_id
      AND a.created_at >= v_window_start
      AND (
        p_course_ids IS NULL
        OR q.course_pack_id = ANY(p_course_ids)
      )
    GROUP BY ut.topic_uuid
  )
  SELECT
    ta.tid AS topic_id,
    ta.ttitle AS topic_title,
    ta.cpid AS course_pack_id,
    ta.total_cards,
    ta.new_cards,
    ta.learning_cards,
    ta.review_cards,
    ta.due_today,
    ta.median_stability,
    ta.p10_stability,
    ta.median_difficulty,
    ta.median_elapsed_days,
    COALESCE(att.attempts_count, 0) AS attempts_count,
    COALESCE(att.correct_count, 0) AS correct_count,
    ta.total_reps,
    ta.total_lapses
  FROM topic_agg ta
  LEFT JOIN topic_attempts att ON att.tid = ta.tid
  ORDER BY ta.ttitle;
END;
$$;

-- ============================================================
-- RPC 2: get_review_forecast
-- Returns (due_date, course_pack_id, review_count, is_overdue)
-- for the next N days, bucketed by date + course.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_review_forecast(
  p_user_id uuid,
  p_course_ids uuid[] DEFAULT NULL,
  p_days_ahead integer DEFAULT 14
)
RETURNS TABLE(
  due_date date,
  course_pack_id uuid,
  review_count bigint,
  is_overdue boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_end_date date;
BEGIN
  v_today := current_date;
  v_end_date := v_today + p_days_ahead;

  RETURN QUERY
  SELECT
    CASE
      WHEN s.due_at::date < v_today THEN v_today  -- bucket overdue into today
      ELSE s.due_at::date
    END AS due_date,
    q.course_pack_id,
    COUNT(*) AS review_count,
    s.due_at::date < v_today AS is_overdue
  FROM srs_state s
  JOIN questions q ON q.id = s.question_id
  WHERE s.user_id = p_user_id
    AND s.due_at::date <= v_end_date
    AND s.state IN (1, 2, 3)  -- only learning/review/relearning cards
    AND q.needs_review = FALSE
    AND COALESCE(q.is_published, true) = true
    AND COALESCE(q.status, 'approved') = 'approved'
    AND (
      p_course_ids IS NULL
      OR q.course_pack_id = ANY(p_course_ids)
    )
  GROUP BY
    CASE
      WHEN s.due_at::date < v_today THEN v_today
      ELSE s.due_at::date
    END,
    q.course_pack_id,
    s.due_at::date < v_today
  ORDER BY due_date;
END;
$$;
