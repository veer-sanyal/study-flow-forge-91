-- Add FSRS-6 fields to srs_state table for proper FSRS algorithm support
-- This enables tracking the full memory state as defined by ts-fsrs

-- Add new FSRS columns (with defaults to not break existing data)
ALTER TABLE public.srs_state
ADD COLUMN IF NOT EXISTS stability real DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS difficulty real DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS elapsed_days real DEFAULT 0,
ADD COLUMN IF NOT EXISTS scheduled_days real DEFAULT 0,
ADD COLUMN IF NOT EXISTS lapses integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS learning_steps integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS state integer DEFAULT 0;

-- Add comments for clarity
COMMENT ON COLUMN public.srs_state.stability IS 'FSRS stability: interval when R=90%';
COMMENT ON COLUMN public.srs_state.difficulty IS 'FSRS difficulty: D∈[1,10]';
COMMENT ON COLUMN public.srs_state.elapsed_days IS 'Days since last review';
COMMENT ON COLUMN public.srs_state.scheduled_days IS 'Scheduled interval until next review';
COMMENT ON COLUMN public.srs_state.lapses IS 'Number of times forgotten (rated Again after graduating)';
COMMENT ON COLUMN public.srs_state.learning_steps IS 'Current learning/relearning step';
COMMENT ON COLUMN public.srs_state.state IS 'Card state: 0=New, 1=Learning, 2=Review, 3=Relearning';

-- Migrate existing data: convert SM-2 ease/interval to FSRS stability/difficulty
UPDATE public.srs_state
SET
  stability = GREATEST(0.1, interval_days),  -- Use interval as stability approximation
  difficulty = LEAST(10, GREATEST(1, (3.0 - ease) / 0.08 + 5)),  -- Convert ease to difficulty
  scheduled_days = interval_days,
  state = CASE WHEN reps > 0 THEN 2 ELSE 0 END  -- 2=Review if has reps, else 0=New
WHERE stability = 1.0;  -- Only update rows with default values

-- Update the recalculate function to work with new columns
CREATE OR REPLACE FUNCTION public.recalculate_fsrs_for_user(
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_processed integer := 0;
  r_srs RECORD;
  v_now timestamptz;
  v_last_review timestamptz;
  v_elapsed_days real;
BEGIN
  v_now := now();
  
  -- Process all SRS states for this specific user
  -- Update elapsed_days based on time since last_reviewed_at
  FOR r_srs IN
    SELECT 
      s.id,
      s.last_reviewed_at,
      s.elapsed_days
    FROM srs_state s
    WHERE s.user_id = p_user_id
      AND s.last_reviewed_at IS NOT NULL
  LOOP
    v_processed := v_processed + 1;
    
    -- Calculate elapsed days since last review
    v_last_review := r_srs.last_reviewed_at;
    v_elapsed_days := EXTRACT(EPOCH FROM (v_now - v_last_review)) / 86400.0;
    
    -- Only update if elapsed_days has changed significantly (more than 0.1 days)
    IF ABS(v_elapsed_days - COALESCE(r_srs.elapsed_days, 0)) > 0.1 THEN
      UPDATE srs_state
      SET 
        elapsed_days = v_elapsed_days,
        updated_at = v_now
      WHERE id = r_srs.id;
      
      v_updated := v_updated + 1;
    END IF;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'updated', v_updated,
    'processed', v_processed,
    'timestamp', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_fsrs_for_user TO authenticated;