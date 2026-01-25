-- Phase 1: Enhanced Learner Model
-- Add difficulty comfort level and streak tracking to topic_mastery

-- Add new columns for adaptive difficulty ramping
ALTER TABLE public.topic_mastery
ADD COLUMN IF NOT EXISTS effective_difficulty_level integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS consecutive_correct integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS consecutive_incorrect integer NOT NULL DEFAULT 0;

-- Add constraints for valid ranges
ALTER TABLE public.topic_mastery
ADD CONSTRAINT effective_difficulty_level_range 
  CHECK (effective_difficulty_level >= 1 AND effective_difficulty_level <= 5);

-- Update the SRS trigger function to also update streak tracking and difficulty ramping
CREATE OR REPLACE FUNCTION public.update_srs_after_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quality integer;
  v_ease numeric;
  v_interval numeric;
  v_reps integer;
  v_topic_id uuid;
  v_current_mastery numeric;
  v_new_mastery numeric;
  v_ema_alpha numeric := 0.3;
  v_performance numeric;
  v_current_difficulty integer;
  v_new_difficulty integer;
  v_current_correct integer;
  v_current_incorrect integer;
BEGIN
  -- Calculate quality score (0-5 scale for SM-2)
  v_quality := public.compute_quality_score(
    NEW.confidence,
    NEW.guide_used,
    NEW.hint_used,
    NEW.is_correct
  );

  -- Update or insert SRS state for this question
  INSERT INTO public.srs_state (user_id, question_id, ease, interval_days, reps, due_at, last_reviewed_at)
  VALUES (
    NEW.user_id,
    NEW.question_id,
    2.5,
    1,
    1,
    CASE 
      WHEN NEW.is_correct THEN now() + interval '1 day'
      ELSE now() + interval '10 minutes'
    END,
    now()
  )
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    ease = GREATEST(1.3, srs_state.ease + (0.1 - (5 - v_quality) * (0.08 + (5 - v_quality) * 0.02))),
    interval_days = CASE
      WHEN v_quality < 3 THEN 1
      WHEN srs_state.reps = 0 THEN 1
      WHEN srs_state.reps = 1 THEN 6
      ELSE LEAST(365, srs_state.interval_days * srs_state.ease)
    END,
    reps = CASE
      WHEN v_quality < 3 THEN 0
      ELSE srs_state.reps + 1
    END,
    due_at = CASE
      WHEN v_quality < 3 THEN now() + interval '10 minutes'
      WHEN srs_state.reps = 0 THEN now() + interval '1 day'
      WHEN srs_state.reps = 1 THEN now() + interval '6 days'
      ELSE now() + (LEAST(365, srs_state.interval_days * srs_state.ease) || ' days')::interval
    END,
    last_reviewed_at = now(),
    updated_at = now();

  -- Update topic mastery for each topic associated with this question
  FOR v_topic_id IN 
    SELECT unnest(topic_ids) FROM public.questions WHERE id = NEW.question_id
  LOOP
    -- Calculate performance score (0-1)
    v_performance := CASE WHEN NEW.is_correct THEN 1.0 ELSE 0.0 END;
    
    -- Get current mastery and streak data
    SELECT mastery_0_1, effective_difficulty_level, consecutive_correct, consecutive_incorrect
    INTO v_current_mastery, v_current_difficulty, v_current_correct, v_current_incorrect
    FROM public.topic_mastery 
    WHERE user_id = NEW.user_id AND topic_id = v_topic_id;
    
    -- Default values if not found
    v_current_mastery := COALESCE(v_current_mastery, 0.5);
    v_current_difficulty := COALESCE(v_current_difficulty, 3);
    v_current_correct := COALESCE(v_current_correct, 0);
    v_current_incorrect := COALESCE(v_current_incorrect, 0);
    
    -- Calculate new mastery using EMA
    v_new_mastery := v_current_mastery * (1 - v_ema_alpha) + v_performance * v_ema_alpha;
    
    -- Update streak counters
    IF NEW.is_correct THEN
      v_current_correct := v_current_correct + 1;
      v_current_incorrect := 0;
    ELSE
      v_current_incorrect := v_current_incorrect + 1;
      v_current_correct := 0;
    END IF;
    
    -- Calculate difficulty ramping
    -- 3 correct in a row = increase difficulty (max 5)
    -- 2 wrong in a row = decrease difficulty (min 1)
    v_new_difficulty := v_current_difficulty;
    IF v_current_correct >= 3 THEN
      v_new_difficulty := LEAST(5, v_current_difficulty + 1);
      v_current_correct := 0; -- Reset after ramping
    ELSIF v_current_incorrect >= 2 THEN
      v_new_difficulty := GREATEST(1, v_current_difficulty - 1);
      v_current_incorrect := 0; -- Reset after ramping
    END IF;
    
    -- Upsert topic mastery with new fields
    INSERT INTO public.topic_mastery (
      user_id, topic_id, mastery_0_1, retention_0_1,
      questions_attempted, questions_correct, last_practiced_at,
      effective_difficulty_level, consecutive_correct, consecutive_incorrect
    )
    VALUES (
      NEW.user_id, v_topic_id, v_new_mastery, v_new_mastery,
      1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, now(),
      v_new_difficulty, v_current_correct, v_current_incorrect
    )
    ON CONFLICT (user_id, topic_id) DO UPDATE SET
      mastery_0_1 = v_new_mastery,
      retention_0_1 = v_new_mastery,
      questions_attempted = topic_mastery.questions_attempted + 1,
      questions_correct = topic_mastery.questions_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      last_practiced_at = now(),
      effective_difficulty_level = v_new_difficulty,
      consecutive_correct = v_current_correct,
      consecutive_incorrect = v_current_incorrect,
      retention_updated_at = now(),
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

-- Add comment for documentation
COMMENT ON COLUMN public.topic_mastery.effective_difficulty_level IS 'Student comfort level 1-5 for this topic, auto-adjusted by streak logic';
COMMENT ON COLUMN public.topic_mastery.consecutive_correct IS 'Current streak of correct answers, resets on wrong or after difficulty ramp';
COMMENT ON COLUMN public.topic_mastery.consecutive_incorrect IS 'Current streak of incorrect answers, resets on correct or after difficulty ramp';