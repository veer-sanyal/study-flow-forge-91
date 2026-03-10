-- ============================================================================
-- CLEANUP: Remove dead/redundant columns, update trigger, add optimistic lock
-- ============================================================================
-- Context: Architecture audit (2026-03-09) identified redundant columns,
-- SM-2 legacy fields (system uses FSRS-6), and a deprecated table.
-- See question-generation-complete-architecture.md for full rationale.
-- ============================================================================

-- ─── 1. course_materials: drop unused columns ────────────────────────────────
ALTER TABLE course_materials DROP COLUMN IF EXISTS content_fingerprint;
ALTER TABLE course_materials DROP COLUMN IF EXISTS topics_extracted_count;
ALTER TABLE course_materials DROP COLUMN IF EXISTS questions_generated_count;

-- ─── 2. questions: drop deprecated/dead columns ─────────────────────────────
-- objective_id has a FK constraint — drop it first
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_objective_id_fkey;
ALTER TABLE questions DROP COLUMN IF EXISTS objective_id;
ALTER TABLE questions DROP COLUMN IF EXISTS common_mistakes;
ALTER TABLE questions DROP COLUMN IF EXISTS source_locator;

-- ─── 3. srs_state: drop SM-2 legacy columns, add optimistic lock ────────────
-- The system uses FSRS-6 exclusively. interval_days and ease were kept for
-- backward compatibility but all reads now use FSRS columns (stability,
-- difficulty, scheduled_days).
ALTER TABLE srs_state DROP COLUMN IF EXISTS interval_days;
ALTER TABLE srs_state DROP COLUMN IF EXISTS ease;

-- Optimistic locking: prevents silent overwrites on concurrent study sessions.
-- Client sends version=current+1 with WHERE version=current; if 0 rows
-- affected, refetch and recompute.
ALTER TABLE srs_state ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;

-- ─── 4. topic_mastery: drop redundant retention_0_1 ─────────────────────────
-- retention_0_1 always equals mastery_0_1 — same EMA computation.
ALTER TABLE topic_mastery DROP COLUMN IF EXISTS retention_0_1;

-- ─── 5. Drop deprecated material_jobs table ──────────────────────────────────
-- Fully replaced by generation_jobs in V2 pipeline.
DROP TABLE IF EXISTS material_jobs;

-- ─── 6. Update trigger: remove SM-2 SRS logic + retention_0_1 ───────────────
-- The trigger still ran SM-2 calculations on every attempt, but the client
-- immediately overwrites with FSRS-6 values. Now the trigger only handles
-- topic_mastery (EMA mastery, streaks, counts).
-- SRS state is managed entirely client-side via ts-fsrs.
CREATE OR REPLACE FUNCTION public.update_srs_after_attempt()
RETURNS TRIGGER AS $$
DECLARE
  v_topic_id UUID;
BEGIN
  -- Topic mastery update: EMA mastery + attempt counts
  -- SRS state (FSRS-6) is handled client-side in use-study.ts
  FOR v_topic_id IN SELECT unnest(topic_ids) FROM public.questions WHERE id = NEW.question_id
  LOOP
    INSERT INTO public.topic_mastery (
      user_id,
      topic_id,
      mastery_0_1,
      questions_attempted,
      questions_correct,
      last_practiced_at
    )
    VALUES (
      NEW.user_id,
      v_topic_id,
      CASE WHEN NEW.is_correct THEN 0.1 ELSE 0 END,
      1,
      CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
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
