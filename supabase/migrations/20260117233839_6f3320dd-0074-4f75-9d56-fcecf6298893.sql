-- =============================================
-- SEED DATA: Calculus I Course Pack
-- =============================================

-- 1. Create Course Pack
INSERT INTO public.course_packs (id, title, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Calculus I', 'Differential and integral calculus fundamentals');

-- 2. Create Topics
INSERT INTO public.topics (id, course_pack_id, title, description, scheduled_date) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Limits', 'Understanding limits and continuity', 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Derivatives', 'Rates of change and differentiation rules', 2),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Chain Rule', 'Differentiating composite functions', 3),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Integrals', 'Antiderivatives and the Fundamental Theorem', 4),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'Series & Sequences', 'Infinite series, convergence tests', 5);

-- 3. Create Sample Questions with valid UUIDs
INSERT INTO public.questions (id, question_type_id, prompt, choices, hint, difficulty, topic_ids, source_exam, solution_steps) VALUES
  (
    '01111111-1111-1111-1111-111111111111',
    (SELECT id FROM public.question_types WHERE name = 'multiple_choice'),
    'Find the derivative of $f(x) = 3x^2 + 2x - 5$',
    '[{"id": "a", "text": "$6x + 2$", "isCorrect": true}, {"id": "b", "text": "$6x - 2$", "isCorrect": false}, {"id": "c", "text": "$3x + 2$", "isCorrect": false}, {"id": "d", "text": "$6x^2 + 2$", "isCorrect": false}]',
    'Use the power rule: the derivative of $x^n$ is $nx^{n-1}$',
    2,
    ARRAY['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
    'Fall 2023 Midterm',
    '["Apply the power rule to each term", "Derivative of $3x^2$ is $6x$", "Derivative of $2x$ is $2$", "Derivative of constant $-5$ is $0$", "Combine: $6x + 2$"]'
  ),
  (
    '02222222-2222-2222-2222-222222222222',
    (SELECT id FROM public.question_types WHERE name = 'multiple_choice'),
    'Evaluate $\lim_{x \to 0} \frac{\sin(x)}{x}$',
    '[{"id": "a", "text": "$0$", "isCorrect": false}, {"id": "b", "text": "$1$", "isCorrect": true}, {"id": "c", "text": "$\\infty$", "isCorrect": false}, {"id": "d", "text": "Does not exist", "isCorrect": false}]',
    'This is a fundamental limit. Consider using L''Hopital''s Rule or the squeeze theorem.',
    3,
    ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid],
    'Fall 2023 Midterm',
    '["This is an indeterminate form 0/0", "Apply L''Hopital''s Rule", "Derivative of sin(x) is cos(x), derivative of x is 1", "Evaluate: cos(0) = 1"]'
  ),
  (
    '03333333-3333-3333-3333-333333333333',
    (SELECT id FROM public.question_types WHERE name = 'multiple_choice'),
    'Find $\int x^3 \, dx$',
    '[{"id": "a", "text": "$3x^2 + C$", "isCorrect": false}, {"id": "b", "text": "$\\frac{x^4}{4} + C$", "isCorrect": true}, {"id": "c", "text": "$x^4 + C$", "isCorrect": false}, {"id": "d", "text": "$\\frac{x^3}{3} + C$", "isCorrect": false}]',
    'Use the power rule for integration: integral of x^n dx = x^(n+1)/(n+1) + C',
    2,
    ARRAY['dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid],
    'Spring 2023 Final',
    '["Apply the power rule for integration", "Add 1 to the exponent: 3 + 1 = 4", "Divide by the new exponent: x^4/4", "Add the constant of integration: + C"]'
  ),
  (
    '04444444-4444-4444-4444-444444444444',
    (SELECT id FROM public.question_types WHERE name = 'multiple_choice'),
    'Find the derivative of $f(x) = \sin(x^2)$',
    '[{"id": "a", "text": "$\\cos(x^2)$", "isCorrect": false}, {"id": "b", "text": "$2x\\cos(x^2)$", "isCorrect": true}, {"id": "c", "text": "$2x\\sin(x^2)$", "isCorrect": false}, {"id": "d", "text": "$x^2\\cos(x^2)$", "isCorrect": false}]',
    'This is a composite function. Use the chain rule.',
    3,
    ARRAY['cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
    'Fall 2023 Midterm',
    '["Identify outer function f(u) = sin(u) and inner function g(x) = x^2", "Derivative of outer: cos(u)", "Derivative of inner: 2x", "Apply chain rule: cos(x^2) * 2x = 2x*cos(x^2)"]'
  ),
  (
    '05555555-5555-5555-5555-555555555555',
    (SELECT id FROM public.question_types WHERE name = 'multiple_choice'),
    'Does the series $\sum_{n=1}^{\infty} \frac{1}{n^2}$ converge or diverge?',
    '[{"id": "a", "text": "Diverges", "isCorrect": false}, {"id": "b", "text": "Converges", "isCorrect": true}, {"id": "c", "text": "Cannot be determined", "isCorrect": false}, {"id": "d", "text": "Oscillates", "isCorrect": false}]',
    'Compare with the p-series test: sum of 1/n^p converges if p > 1',
    4,
    ARRAY['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid],
    'Spring 2023 Final',
    '["This is a p-series with p = 2", "The p-series test states: sum of 1/n^p converges if p > 1", "Since p = 2 > 1, the series converges", "This converges to pi^2/6"]'
  ),
  (
    '06666666-6666-6666-6666-666666666666',
    (SELECT id FROM public.question_types WHERE name = 'multiple_choice'),
    'Find $\frac{d}{dx}[e^{3x}]$',
    '[{"id": "a", "text": "$e^{3x}$", "isCorrect": false}, {"id": "b", "text": "$3e^{3x}$", "isCorrect": true}, {"id": "c", "text": "$3e^{x}$", "isCorrect": false}, {"id": "d", "text": "$e^{3x+1}$", "isCorrect": false}]',
    'Use the chain rule with e^u where u = 3x',
    2,
    ARRAY['cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid],
    'Fall 2022 Midterm',
    '["Let u = 3x, so we have e^u", "Derivative of e^u is e^u", "Derivative of u = 3x is 3", "By chain rule: e^(3x) * 3 = 3e^(3x)"]'
  );

-- =============================================
-- ATOMIC LEARNER STATE UPDATE TRIGGER
-- =============================================

-- Function to compute quality score (0-5) from attempt data
CREATE OR REPLACE FUNCTION public.compute_quality_score(
  p_is_correct BOOLEAN,
  p_confidence TEXT,
  p_hint_used BOOLEAN,
  p_guide_used BOOLEAN
) RETURNS NUMERIC AS $$
DECLARE
  base_score NUMERIC;
  penalty NUMERIC := 0;
BEGIN
  IF p_is_correct THEN
    base_score := 4;
  ELSE
    base_score := 1;
  END IF;

  IF p_is_correct THEN
    CASE p_confidence
      WHEN 'knew_it' THEN base_score := base_score + 1;
      WHEN 'unsure' THEN base_score := base_score;
      WHEN 'guessed' THEN base_score := base_score - 0.5;
      ELSE base_score := base_score;
    END CASE;
  ELSE
    CASE p_confidence
      WHEN 'knew_it' THEN base_score := base_score - 0.5;
      WHEN 'guessed' THEN base_score := base_score + 0.5;
      ELSE base_score := base_score;
    END CASE;
  END IF;

  IF p_hint_used THEN penalty := penalty + 0.5; END IF;
  IF p_guide_used THEN penalty := penalty + 1; END IF;

  RETURN GREATEST(0, LEAST(5, base_score - penalty));
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Function to update SRS state using SM-2 algorithm variant
CREATE OR REPLACE FUNCTION public.update_srs_after_attempt()
RETURNS TRIGGER AS $$
DECLARE
  v_quality NUMERIC;
  v_current_ease NUMERIC;
  v_current_interval NUMERIC;
  v_current_reps INT;
  v_new_ease NUMERIC;
  v_new_interval NUMERIC;
  v_new_reps INT;
  v_topic_id UUID;
BEGIN
  v_quality := public.compute_quality_score(
    NEW.is_correct,
    NEW.confidence,
    NEW.hint_used,
    NEW.guide_used
  );

  SELECT ease, interval_days, reps
  INTO v_current_ease, v_current_interval, v_current_reps
  FROM public.srs_state
  WHERE user_id = NEW.user_id AND question_id = NEW.question_id;

  IF NOT FOUND THEN
    v_current_ease := 2.5;
    v_current_interval := 1;
    v_current_reps := 0;
  END IF;

  IF v_quality >= 3 THEN
    v_new_reps := v_current_reps + 1;
    
    IF v_new_reps = 1 THEN
      v_new_interval := 1;
    ELSIF v_new_reps = 2 THEN
      v_new_interval := 3;
    ELSE
      v_new_interval := v_current_interval * v_current_ease;
    END IF;
    
    v_new_ease := v_current_ease + (0.1 - (5 - v_quality) * (0.08 + (5 - v_quality) * 0.02));
  ELSE
    v_new_reps := 0;
    v_new_interval := 1;
    v_new_ease := v_current_ease - 0.2;
  END IF;

  v_new_ease := GREATEST(1.3, v_new_ease);

  INSERT INTO public.srs_state (user_id, question_id, ease, interval_days, reps, due_at, last_reviewed_at)
  VALUES (
    NEW.user_id,
    NEW.question_id,
    v_new_ease,
    v_new_interval,
    v_new_reps,
    NOW() + (v_new_interval || ' days')::INTERVAL,
    NOW()
  )
  ON CONFLICT (user_id, question_id)
  DO UPDATE SET
    ease = EXCLUDED.ease,
    interval_days = EXCLUDED.interval_days,
    reps = EXCLUDED.reps,
    due_at = EXCLUDED.due_at,
    last_reviewed_at = EXCLUDED.last_reviewed_at,
    updated_at = NOW();

  FOR v_topic_id IN SELECT unnest(topic_ids) FROM public.questions WHERE id = NEW.question_id
  LOOP
    INSERT INTO public.topic_mastery (
      user_id,
      topic_id,
      mastery_0_1,
      retention_0_1,
      questions_attempted,
      questions_correct,
      last_practiced_at,
      retention_updated_at
    )
    VALUES (
      NEW.user_id,
      v_topic_id,
      CASE WHEN NEW.is_correct THEN 0.1 ELSE 0 END,
      0.5,
      1,
      CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, topic_id)
    DO UPDATE SET
      mastery_0_1 = topic_mastery.mastery_0_1 * 0.8 + (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END) * 0.2,
      questions_attempted = topic_mastery.questions_attempted + 1,
      questions_correct = topic_mastery.questions_correct + (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END),
      last_practiced_at = NOW(),
      updated_at = NOW();
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER after_attempt_insert
  AFTER INSERT ON public.attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_srs_after_attempt();