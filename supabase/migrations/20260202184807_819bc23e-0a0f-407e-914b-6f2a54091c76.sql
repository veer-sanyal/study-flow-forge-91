-- User-specific FSRS recalculation function
-- This version only updates FSRS state for a specific user
-- More efficient for on-demand updates when a user loads the app

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
      -- Only update if last_reviewed_at is before today (to avoid double updates)
      AND s.last_reviewed_at < date_trunc('day', v_now)
  LOOP
    v_processed := v_processed + 1;
    
    -- Calculate elapsed days since last review
    v_last_review := r_srs.last_reviewed_at;
    v_elapsed_days := EXTRACT(EPOCH FROM (v_now - v_last_review)) / 86400.0;
    
    -- Only update if elapsed_days has changed significantly (more than 0.1 days)
    -- This avoids unnecessary updates for cards reviewed recently
    IF ABS(v_elapsed_days - COALESCE(r_srs.elapsed_days, 0)) > 0.1 THEN
      -- Update elapsed_days
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.recalculate_fsrs_for_user TO authenticated;

COMMENT ON FUNCTION public.recalculate_fsrs_for_user IS 'User-specific FSRS recalculation. Updates elapsed_days for a single user based on time passage. Efficient for on-demand updates on app load.';