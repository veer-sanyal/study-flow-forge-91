-- Add guide_me_steps column to questions table for scaffolded questions
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS guide_me_steps jsonb DEFAULT NULL;

-- Add course_pack_id directly to questions for easier querying
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS course_pack_id uuid REFERENCES public.course_packs(id) ON DELETE SET NULL;

-- Create index for efficient querying by course pack
CREATE INDEX IF NOT EXISTS idx_questions_course_pack ON public.questions(course_pack_id);

-- Comment on columns for documentation
COMMENT ON COLUMN public.questions.guide_me_steps IS 'JSON array of scaffolded Guide Me steps with MC choices and hints';
COMMENT ON COLUMN public.questions.course_pack_id IS 'Direct reference to course pack for efficient querying';