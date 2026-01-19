-- Add is_published column to course_packs for course-level publishing
ALTER TABLE public.course_packs ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

-- Create index for filtering published courses (if not exists)
CREATE INDEX IF NOT EXISTS idx_course_packs_is_published ON public.course_packs(is_published);