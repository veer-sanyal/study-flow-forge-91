-- Add content_date to course_materials for better tracking of source dates
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS content_date DATE;

-- Update the topic date backfill function to use MAX instead of MIN
-- "set the date as the last day the topic is covered"
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
  -- For each topic, find the LAST calendar event that matches (max date)
  FOR r_topic IN
    SELECT t.id, t.course_pack_id, t.title, t.scheduled_week
    FROM topics t
    WHERE t.scheduled_week IS NOT NULL
  LOOP
    -- Find the LATEST event date for this topic's week or explicit coverage
    SELECT MAX(ce.event_date)
    INTO v_topic_date
    FROM calendar_events ce
    WHERE ce.course_pack_id = r_topic.course_pack_id
      AND ce.event_date IS NOT NULL
      AND (
        (ce.week_number = r_topic.scheduled_week AND ce.event_type = 'topic') 
        OR 
        (ce.topics_covered IS NOT NULL AND r_topic.title = ANY(ce.topics_covered))
      );
    
    -- Update the topic if we found a date and it's different
    IF v_topic_date IS NOT NULL THEN
      UPDATE topics
      SET scheduled_date = v_topic_date
      WHERE id = r_topic.id AND (scheduled_date IS NULL OR scheduled_date != v_topic_date);
      
      IF FOUND THEN
        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_updated;
END;
$$;
