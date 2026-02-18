-- Migration: Calendar consistency + topic last_covered_date
-- See docs/data-model.md for canonical rules.

-- ============================================================
-- A) One-time fix: repair day_of_week where it disagrees with event_date
-- ============================================================
UPDATE calendar_events
SET day_of_week = UPPER(TO_CHAR(event_date, 'DY'))
WHERE event_date IS NOT NULL
  AND day_of_week IS NOT NULL
  AND UPPER(day_of_week) != UPPER(TO_CHAR(event_date, 'DY'));

-- ============================================================
-- B) Trigger: auto-derive day_of_week from event_date on INSERT/UPDATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.derive_day_of_week()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_date IS NOT NULL THEN
    NEW.day_of_week := UPPER(TO_CHAR(NEW.event_date, 'DY'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_day_of_week ON public.calendar_events;
CREATE TRIGGER trg_derive_day_of_week
  BEFORE INSERT OR UPDATE OF event_date
  ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_day_of_week();

-- ============================================================
-- C) Validation function: returns rows with mismatches (should return 0)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_calendar_date_consistency()
RETURNS TABLE(
  event_id UUID,
  title TEXT,
  event_date DATE,
  stored_day_of_week TEXT,
  expected_day_of_week TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ce.id AS event_id,
    ce.title,
    ce.event_date::DATE,
    ce.day_of_week AS stored_day_of_week,
    UPPER(TO_CHAR(ce.event_date, 'DY')) AS expected_day_of_week
  FROM calendar_events ce
  WHERE ce.event_date IS NOT NULL
    AND ce.day_of_week IS NOT NULL
    AND UPPER(ce.day_of_week) != UPPER(TO_CHAR(ce.event_date, 'DY'));
$$;

-- ============================================================
-- D) Add column: topics.last_covered_date
-- ============================================================
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS last_covered_date TIMESTAMPTZ;

-- ============================================================
-- E) Update RPC: also compute last_covered_date
-- ============================================================
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
  v_last_covered TIMESTAMPTZ;
BEGIN
  FOR r_topic IN
    SELECT t.id, t.course_pack_id, t.title, t.scheduled_date
    FROM topics t
    WHERE t.scheduled_date IS NOT NULL
  LOOP
    -- Find the LATEST event date for this topic's week or explicit coverage
    SELECT MAX(ce.event_date)
    INTO v_topic_date
    FROM calendar_events ce
    WHERE ce.course_pack_id = r_topic.course_pack_id
      AND ce.event_date IS NOT NULL
      AND (
        (ce.week_number = r_topic.scheduled_date AND ce.event_type = 'topic')
        OR
        (ce.topics_covered IS NOT NULL AND r_topic.title = ANY(ce.topics_covered))
      );

    -- Compute last_covered_date as MAX(event_date) from matching calendar events
    SELECT MAX(ce.event_date)::TIMESTAMPTZ
    INTO v_last_covered
    FROM calendar_events ce
    WHERE ce.course_pack_id = r_topic.course_pack_id
      AND ce.event_date IS NOT NULL
      AND ce.topics_covered IS NOT NULL
      AND r_topic.title = ANY(ce.topics_covered);

    -- Update the topic if we found a date
    IF v_topic_date IS NOT NULL OR v_last_covered IS NOT NULL THEN
      UPDATE topics
      SET
        scheduled_date = COALESCE(v_topic_date, scheduled_date),
        last_covered_date = COALESCE(v_last_covered, last_covered_date)
      WHERE id = r_topic.id
        AND (
          (scheduled_date IS NULL OR scheduled_date != v_topic_date)
          OR (last_covered_date IS NULL OR last_covered_date != v_last_covered)
        );

      IF FOUND THEN
        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_updated;
END;
$$;
