-- Question Generation V2: 3-Phase Architecture schema additions
-- Adds columns for course-aware analysis and research-backed question quality

-- 1. Add course_type to course_materials (auto-detected or admin-set)
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS course_type TEXT DEFAULT 'stem_quantitative';

-- 2. Add new quality/metadata columns to questions
--    (quality_score, quality_flags already exist — reuse them)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS cognitive_level TEXT,
  ADD COLUMN IF NOT EXISTS construct_claim TEXT,
  ADD COLUMN IF NOT EXISTS distractor_rationales JSONB;

-- 3. Enable Realtime for generation_jobs so frontend can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
