-- Add pre_run_count to generation_jobs
-- Stores how many questions existed before a generation run started.
-- Allows the finalize step (and UI) to report newly_generated = total - pre_run_count.

ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS pre_run_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.generation_jobs.pre_run_count IS
  'Count of questions that existed before this generation run; newly_generated = total_questions_generated - pre_run_count';
