-- Cleanup: drop unused columns from topics and calendar_events tables
-- Also fix midterm_coverage NULLs → 0 for post-midterm (finals) topics

-- ============================================================
-- TOPICS TABLE: Drop unused columns
-- ============================================================

-- Drop foreign key constraint for edition_id first
ALTER TABLE public.topics
  DROP CONSTRAINT IF EXISTS topics_edition_id_fkey;

-- Drop columns
ALTER TABLE public.topics
  DROP COLUMN IF EXISTS prerequisite_topic_ids,
  DROP COLUMN IF EXISTS edition_id,
  DROP COLUMN IF EXISTS topic_code,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS scheduled_date;

-- ============================================================
-- CALENDAR_EVENTS TABLE: Drop unused columns
-- (Keep description — repurposed for AI-generated topic descriptions)
-- ============================================================

ALTER TABLE public.calendar_events
  DROP COLUMN IF EXISTS time_slot,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS topics_covered,
  DROP COLUMN IF EXISTS homework_assignments;

-- ============================================================
-- Fix midterm_coverage: widen check constraint to allow 0 (finals)
-- Old constraint: CHECK (midterm_coverage BETWEEN 1 AND 3)
-- New constraint: CHECK (midterm_coverage BETWEEN 0 AND 3)
-- ============================================================

ALTER TABLE public.topics
  DROP CONSTRAINT IF EXISTS topics_midterm_coverage_check;

ALTER TABLE public.topics
  ADD CONSTRAINT topics_midterm_coverage_check CHECK (midterm_coverage BETWEEN 0 AND 3);

-- Set NULLs to 0 (means "Finals only")
UPDATE public.topics
SET midterm_coverage = 0
WHERE midterm_coverage IS NULL;

-- Now make the column NOT NULL with default 0
ALTER TABLE public.topics
  ALTER COLUMN midterm_coverage SET DEFAULT 0,
  ALTER COLUMN midterm_coverage SET NOT NULL;

-- ============================================================
-- Drop stale update_topic_scheduled_dates() RPC
-- (references scheduled_date which is now dropped)
-- ============================================================

DROP FUNCTION IF EXISTS public.update_topic_scheduled_dates();
