-- Phase 1: Dynamic Goals + Topic Introduction Tracking
-- Adds topic_intro_status table, session_intensity setting,
-- sync_topic_introductions() function, and get_recommended_session_size() RPC.

-- 1a. topic_intro_status table
CREATE TABLE topic_intro_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  introduced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'calendar',
  UNIQUE(user_id, topic_id)
);

CREATE INDEX idx_topic_intro_status_user ON topic_intro_status(user_id);
CREATE INDEX idx_topic_intro_status_topic ON topic_intro_status(topic_id);

-- RLS
ALTER TABLE topic_intro_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own topic introductions"
  ON topic_intro_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own topic introductions"
  ON topic_intro_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 1b. session_intensity column on user_settings
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS session_intensity TEXT NOT NULL DEFAULT 'moderate'
    CHECK (session_intensity IN ('light', 'moderate', 'heavy'));

-- 1c. sync_topic_introductions() function
-- Joins calendar_events (event_type='topic', event_date <= today) with topics via ILIKE title match
CREATE OR REPLACE FUNCTION sync_topic_introductions(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO topic_intro_status (user_id, topic_id, introduced_at, source)
  SELECT DISTINCT
    p_user_id,
    t.id,
    ce.event_date::timestamptz,
    'calendar'
  FROM calendar_events ce
  JOIN user_enrollments ue ON ue.course_pack_id = ce.course_pack_id AND ue.user_id = p_user_id
  JOIN topics t ON t.course_pack_id = ce.course_pack_id
    AND LOWER(TRIM(t.title)) ILIKE '%' || LOWER(TRIM(ce.title)) || '%'
  WHERE ce.event_type = 'topic'
    AND ce.event_date <= CURRENT_DATE
  ON CONFLICT (user_id, topic_id) DO NOTHING;
END;
$$;

-- 1d. get_recommended_session_size() RPC
CREATE OR REPLACE FUNCTION get_recommended_session_size(
  p_user_id UUID,
  p_enrolled_course_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_srs_due_count INT;
  v_new_question_count INT;
  v_intensity TEXT;
  v_multiplier NUMERIC;
  v_computed_total INT;
  v_recommended_total INT;
  v_estimated_minutes INT;
BEGIN
  -- Get user's intensity preference
  SELECT COALESCE(session_intensity, 'moderate')
  INTO v_intensity
  FROM user_settings
  WHERE user_id = p_user_id;

  IF v_intensity IS NULL THEN
    v_intensity := 'moderate';
  END IF;

  -- Count SRS due questions (state IN 1,2,3 = learning/review/relearning, due now, not attempted today)
  SELECT COUNT(*)
  INTO v_srs_due_count
  FROM srs_state ss
  JOIN questions q ON q.id = ss.question_id
  WHERE ss.user_id = p_user_id
    AND ss.state IN (1, 2, 3)
    AND ss.due_at <= now()
    AND (p_enrolled_course_ids IS NULL OR q.course_pack_id = ANY(p_enrolled_course_ids))
    AND NOT EXISTS (
      SELECT 1 FROM attempts a
      WHERE a.user_id = p_user_id
        AND a.question_id = ss.question_id
        AND a.created_at >= CURRENT_DATE
    );

  -- Count new questions from recently-introduced topics (last 7 days, not yet in SRS)
  SELECT COUNT(*)
  INTO v_new_question_count
  FROM questions q
  JOIN topic_intro_status tis ON tis.user_id = p_user_id
    AND q.topic_ids && ARRAY[tis.topic_id]
  WHERE tis.introduced_at >= now() - INTERVAL '7 days'
    AND (p_enrolled_course_ids IS NULL OR q.course_pack_id = ANY(p_enrolled_course_ids))
    AND q.needs_review = false
    AND NOT EXISTS (
      SELECT 1 FROM srs_state ss
      WHERE ss.user_id = p_user_id AND ss.question_id = q.id
    );

  -- Apply intensity multiplier
  v_multiplier := CASE v_intensity
    WHEN 'light' THEN 0.7
    WHEN 'moderate' THEN 1.0
    WHEN 'heavy' THEN 1.4
    ELSE 1.0
  END;

  v_computed_total := CEIL((v_srs_due_count + v_new_question_count) * v_multiplier);
  v_recommended_total := GREATEST(5, v_computed_total);
  v_estimated_minutes := CEIL(v_recommended_total * 1.5);

  RETURN json_build_object(
    'srs_due_count', v_srs_due_count,
    'new_question_count', v_new_question_count,
    'recommended_total', v_recommended_total,
    'estimated_minutes', v_estimated_minutes,
    'intensity', v_intensity
  );
END;
$$;
