-- Fix: update_topic_mastery_after_attempt referenced dropped column retention_0_1
-- which caused all attempts INSERT to fail with "Failed to save progress" toast.
-- Removed references to retention_0_1 (dropped in 20260309000001) and
-- retention_updated_at (still exists but unnecessary since updated_at covers it).

CREATE OR REPLACE FUNCTION public.update_topic_mastery_after_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
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
  FOR v_topic_id IN
    SELECT unnest(topic_ids) FROM public.questions WHERE id = NEW.question_id
  LOOP
    v_performance := CASE WHEN NEW.is_correct THEN 1.0 ELSE 0.0 END;

    SELECT mastery_0_1, effective_difficulty_level, consecutive_correct, consecutive_incorrect
    INTO v_current_mastery, v_current_difficulty, v_current_correct, v_current_incorrect
    FROM public.topic_mastery
    WHERE user_id = NEW.user_id AND topic_id = v_topic_id;

    v_current_mastery := COALESCE(v_current_mastery, 0.5);
    v_current_difficulty := COALESCE(v_current_difficulty, 3);
    v_current_correct := COALESCE(v_current_correct, 0);
    v_current_incorrect := COALESCE(v_current_incorrect, 0);

    v_new_mastery := v_current_mastery * (1 - v_ema_alpha) + v_performance * v_ema_alpha;

    IF NEW.is_correct THEN
      v_current_correct := v_current_correct + 1;
      v_current_incorrect := 0;
    ELSE
      v_current_incorrect := v_current_incorrect + 1;
      v_current_correct := 0;
    END IF;

    v_new_difficulty := v_current_difficulty;
    IF v_current_correct >= 3 THEN
      v_new_difficulty := LEAST(5, v_current_difficulty + 1);
      v_current_correct := 0;
    ELSIF v_current_incorrect >= 2 THEN
      v_new_difficulty := GREATEST(1, v_current_difficulty - 1);
      v_current_incorrect := 0;
    END IF;

    INSERT INTO public.topic_mastery (
      user_id, topic_id, mastery_0_1,
      questions_attempted, questions_correct, last_practiced_at,
      effective_difficulty_level, consecutive_correct, consecutive_incorrect
    )
    VALUES (
      NEW.user_id, v_topic_id, v_new_mastery,
      1,
      CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      now(),
      v_new_difficulty, v_current_correct, v_current_incorrect
    )
    ON CONFLICT (user_id, topic_id)
    DO UPDATE SET
      mastery_0_1 = v_new_mastery,
      questions_attempted = topic_mastery.questions_attempted + 1,
      questions_correct = topic_mastery.questions_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      last_practiced_at = now(),
      effective_difficulty_level = v_new_difficulty,
      consecutive_correct = v_current_correct,
      consecutive_incorrect = v_current_incorrect,
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$function$;
