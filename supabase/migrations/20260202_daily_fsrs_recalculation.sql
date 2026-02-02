-- Daily FSRS Recalculation Function
-- This function updates FSRS state to account for elapsed time, even when users don't submit questions
-- FSRS retrievability decreases over time, and this keeps schedules accurate

CREATE OR REPLACE FUNCTION public.recalculate_fsrs_daily()
RETURNS TABLE(updated_count integer, processed_count integer)
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
  v_due_at timestamptz;
BEGIN
  v_now := now();
  
  -- Process all SRS states that haven't been updated today
  -- Update elapsed_days based on time since last_reviewed_at
  FOR r_srs IN
    SELECT 
      s.id,
      s.user_id,
      s.question_id,
      s.due_at,
      s.last_reviewed_at,
      s.stability,
      s.difficulty,
      s.elapsed_days,
      s.scheduled_days,
      s.state,
      s.reps,
      s.lapses,
      s.learning_steps
    FROM srs_state s
    WHERE s.last_reviewed_at IS NOT NULL
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
      -- Note: We don't recalculate stability/difficulty here because FSRS algorithm
      -- should only run when a user actually reviews. However, we update elapsed_days
      -- to reflect the passage of time, which affects retrievability calculations.
      
      UPDATE srs_state
      SET 
        elapsed_days = v_elapsed_days,
        updated_at = v_now
      WHERE id = r_srs.id;
      
      v_updated := v_updated + 1;
    END IF;
  END LOOP;
  
  -- Also handle cards that are overdue - ensure due_at is accurate
  -- Cards that are past their due date should have their priority reflected
  -- (This is already handled by the query functions, but we ensure data consistency)
  
  RETURN QUERY SELECT v_updated, v_processed;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.recalculate_fsrs_daily TO authenticated;

COMMENT ON FUNCTION public.recalculate_fsrs_daily IS 'Daily function to update FSRS elapsed_days based on time passage. Should be run daily via cron or scheduled job.';

-- Create a helper function that can be called from edge functions or cron
CREATE OR REPLACE FUNCTION public.run_daily_fsrs_maintenance()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fsrs_result RECORD;
  v_topic_result RECORD;
  v_fsrs_updated integer;
  v_fsrs_processed integer;
  v_topic_updated integer;
BEGIN
  -- Run FSRS recalculation
  SELECT * INTO v_fsrs_result FROM recalculate_fsrs_daily();
  v_fsrs_updated := v_fsrs_result.updated_count;
  v_fsrs_processed := v_fsrs_result.processed_count;
  
  -- Update topic scheduled dates (in case calendar events were added/modified)
  SELECT * INTO v_topic_result FROM update_topic_scheduled_dates();
  v_topic_updated := v_topic_result.updated_count;
  
  RETURN json_build_object(
    'success', true,
    'fsrs_updated', v_fsrs_updated,
    'fsrs_processed', v_fsrs_processed,
    'topics_updated', v_topic_updated,
    'timestamp', now()
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.run_daily_fsrs_maintenance TO authenticated;

COMMENT ON FUNCTION public.run_daily_fsrs_maintenance IS 'Maintenance function that runs both FSRS recalculation and topic date updates. Can be called daily via cron or edge function.';
