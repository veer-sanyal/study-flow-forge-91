-- North Star metric + metric-tree inputs + guardrails for a spaced-practice study app.
-- See docs/metrics.md for definitions and the research rationale.
--
-- North Star = weekly count of items reaching DURABLE MASTERY: a question answered
-- correctly this week that also had a prior correct answer >= 7 days earlier
-- (spaced-retrieval success at delay — the best-evidenced behavioral proxy for durable
-- learning; mirrors Khan Academy's "skills to proficient", which demotes on later misses).
-- Deliberately NOT engagement (DAU/streaks) — engagement != learning (MOOC LA studies).
--
-- Read-only, STABLE, SECURITY DEFINER. Computed entirely from `attempts` + `srs_state`.
CREATE OR REPLACE FUNCTION get_north_star_metrics(
  p_user_id UUID,
  p_enrolled_course_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_week_start TIMESTAMPTZ := date_trunc('week', now());
  v_result JSONB;
BEGIN
  WITH ranked AS (
    SELECT
      a.question_id,
      a.is_correct,
      a.confidence,
      a.time_spent_ms,
      a.created_at,
      q.topic_ids,
      LAG(a.created_at)  OVER w AS prev_at,
      ROW_NUMBER()       OVER w AS attempt_no
    FROM attempts a
    JOIN questions q ON q.id = a.question_id
    WHERE a.user_id = p_user_id
      AND (p_enrolled_course_ids IS NULL OR q.course_pack_id = ANY(p_enrolled_course_ids))
    WINDOW w AS (PARTITION BY a.question_id ORDER BY a.created_at)
  ),
  week AS (
    SELECT * FROM ranked WHERE created_at >= v_week_start
  ),
  -- NSM: distinct items reaching durable mastery this week.
  durable AS (
    SELECT count(DISTINCT w.question_id) AS n
    FROM week w
    WHERE w.is_correct
      AND EXISTS (
        SELECT 1 FROM attempts pa
        WHERE pa.user_id = p_user_id
          AND pa.question_id = w.question_id
          AND pa.is_correct
          AND pa.created_at <= w.created_at - INTERVAL '7 days'
      )
  ),
  -- INPUT: breadth — distinct topics touched this week.
  breadth AS (
    SELECT count(DISTINCT t) AS n
    FROM week w, LATERAL unnest(w.topic_ids) AS t
  ),
  -- INPUT: depth — first-attempt accuracy on brand-new items.
  newmat AS (
    SELECT
      count(*) AS n,
      count(*) FILTER (WHERE is_correct)::numeric / NULLIF(count(*), 0) AS acc
    FROM week WHERE attempt_no = 1
  ),
  -- INPUT: promotion — correctness on review (repeat) attempts this week.
  reviews AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_correct)::numeric / NULLIF(count(*), 0) AS promote_rate
    FROM week WHERE attempt_no > 1
  ),
  -- INPUT: review-completion — share of review demand met (done vs done+overdue).
  due AS (
    SELECT count(*) AS overdue
    FROM srs_state s
    WHERE s.user_id = p_user_id AND s.due_at <= now()
  ),
  -- GUARDRAIL helpers
  topic_counts AS (
    SELECT t AS topic, count(*) AS c
    FROM week w, LATERAL unnest(w.topic_ids) AS t
    GROUP BY t
  ),
  agg AS (
    SELECT
      count(*) AS attempts_n,
      count(DISTINCT date(created_at)) AS active_days,
      count(*) FILTER (WHERE time_spent_ms BETWEEN 1 AND 8000)::numeric
        / NULLIF(count(*), 0) AS cram_rate,
      count(*) FILTER (WHERE confidence = 3 AND NOT is_correct)::numeric
        / NULLIF(count(*) FILTER (WHERE confidence IS NOT NULL), 0) AS high_conf_wrong_rate,
      count(*) FILTER (WHERE is_correct AND prev_at IS NOT NULL
                        AND prev_at <= created_at - INTERVAL '30 days')::numeric
        / NULLIF(count(*) FILTER (WHERE prev_at IS NOT NULL
                        AND prev_at <= created_at - INTERVAL '30 days'), 0) AS retention_30d
    FROM week
  )
  SELECT jsonb_build_object(
    'week_start', v_week_start,
    'north_star', jsonb_build_object(
      'durable_mastery_items', COALESCE((SELECT n FROM durable), 0)
    ),
    'inputs', jsonb_build_object(
      'topic_breadth',          COALESCE((SELECT n FROM breadth), 0),
      'new_first_attempt_acc',  ROUND(COALESCE((SELECT acc FROM newmat), 0), 3),
      'promotion_rate',         ROUND(COALESCE((SELECT promote_rate FROM reviews), 0), 3),
      'review_completion_rate', ROUND(
        COALESCE((SELECT total FROM reviews), 0)::numeric
        / NULLIF(COALESCE((SELECT total FROM reviews), 0) + COALESCE((SELECT overdue FROM due), 0), 0), 3)
    ),
    'guardrails', jsonb_build_object(
      'cram_rate',            ROUND(COALESCE((SELECT cram_rate FROM agg), 0), 3),
      'high_conf_wrong_rate', ROUND(COALESCE((SELECT high_conf_wrong_rate FROM agg), 0), 3),
      'retention_30d',        ROUND(COALESCE((SELECT retention_30d FROM agg), 0), 3),
      'max_topic_share',      ROUND(COALESCE(
        (SELECT max(c)::numeric / NULLIF(sum(c), 0) FROM topic_counts), 0), 3),
      'active_days',          COALESCE((SELECT active_days FROM agg), 0),
      'attempts',             COALESCE((SELECT attempts_n FROM agg), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_north_star_metrics(UUID, UUID[]) TO authenticated;
