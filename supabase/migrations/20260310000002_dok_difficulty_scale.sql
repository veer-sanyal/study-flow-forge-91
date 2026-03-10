-- Migration: Update empirical difficulty formula for DOK 1-5 scale
--
-- Previously: (1 - correct_rate) * 2.0 + 1.0  → mapped to [1, 3]
-- Now:        (1 - correct_rate) * 4.0 + 1.0  → mapped to [1, 5]
--
-- Also updates the Gemini difficulty fallback from 2 to 3 (midpoint of 1-5)

CREATE OR REPLACE FUNCTION public.refresh_empirical_difficulty()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  -- Batch-update empirical_difficulty for questions with >= 5 attempts.
  -- Formula: 0.5 * gemini_difficulty + 0.5 * ((1 - correct_rate) * 4 + 1)
  -- Maps correct_rate [0,1] → empirical component [1,5] matching DOK 1-5 scale.
  --
  -- NOTE: Currently counts raw attempts, not distinct users.
  -- Future improvement: COUNT(DISTINCT a.user_id) for better signal.
  UPDATE questions q
  SET empirical_difficulty =
    0.5 * COALESCE(q.difficulty, 3)::real
    + 0.5 * ((1.0 - s.correct / s.total) * 4.0 + 1.0)
  FROM (
    SELECT a.question_id,
           COUNT(*)::real AS total,
           SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::real AS correct
    FROM attempts a
    GROUP BY a.question_id
    HAVING COUNT(*) >= 5
  ) s
  WHERE q.id = s.question_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.refresh_empirical_difficulty() IS
  'Batch-updates empirical_difficulty for questions with >= 5 attempts using DOK 1-5 scale. Called by run_daily_fsrs_maintenance().';
