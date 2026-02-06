-- Add scheduled_date column to topics table for exact date tracking
-- This allows the system to know the exact date when each topic is covered, not just the week

ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Create index for efficient date-based queries
CREATE INDEX IF NOT EXISTS idx_topics_scheduled_date ON public.topics(scheduled_date) WHERE scheduled_date IS NOT NULL;

-- Function to backfill scheduled_date from calendar_events
-- Maps topics to the exact date they're covered based on calendar events
CREATE OR REPLACE FUNCTION public.update_topic_scheduled_dates()
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  r_topic RECORD;
  v_topic_date DATE;
BEGIN
  -- For each topic, find the earliest calendar event that matches
  FOR r_topic IN
    SELECT t.id, t.course_pack_id, t.title, t.scheduled_week
    FROM topics t
    WHERE t.scheduled_week IS NOT NULL
      AND (t.scheduled_date IS NULL OR t.scheduled_date != (
        SELECT MIN(ce.event_date)
        FROM calendar_events ce
        WHERE ce.course_pack_id = t.course_pack_id
          AND ce.week_number = t.scheduled_week
          AND ce.event_date IS NOT NULL
          AND (ce.event_type = 'topic' OR ce.topics_covered IS NOT NULL)
      ))
  LOOP
    -- Find the earliest event date for this topic's week
    SELECT MIN(ce.event_date)
    INTO v_topic_date
    FROM calendar_events ce
    WHERE ce.course_pack_id = r_topic.course_pack_id
      AND ce.week_number = r_topic.scheduled_week
      AND ce.event_date IS NOT NULL
      AND (ce.event_type = 'topic' OR ce.topics_covered IS NOT NULL);
    
    -- Update the topic if we found a date
    IF v_topic_date IS NOT NULL THEN
      UPDATE topics
      SET scheduled_date = v_topic_date
      WHERE id = r_topic.id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_updated;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_topic_scheduled_dates TO authenticated;

COMMENT ON COLUMN public.topics.scheduled_date IS 'Exact date when this topic is covered in the course schedule, derived from calendar events';
COMMENT ON FUNCTION public.update_topic_scheduled_dates IS 'Updates topic scheduled_date from calendar_events based on week_number matching';
