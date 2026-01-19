-- Add course_pack_id and aliases to question_types table
ALTER TABLE public.question_types
ADD COLUMN IF NOT EXISTS course_pack_id uuid REFERENCES public.course_packs(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

-- Create index for efficient querying by course
CREATE INDEX IF NOT EXISTS idx_question_types_course_pack ON public.question_types(course_pack_id, name);

-- Update RLS policies for question_types to allow admin management
DROP POLICY IF EXISTS "Anyone can view question types" ON public.question_types;
DROP POLICY IF EXISTS "Authenticated users can read question types" ON public.question_types;
DROP POLICY IF EXISTS "Admins can insert question types" ON public.question_types;
DROP POLICY IF EXISTS "Admins can update question types" ON public.question_types;
DROP POLICY IF EXISTS "Admins can delete question types" ON public.question_types;

CREATE POLICY "Anyone can view question types"
ON public.question_types
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert question types"
ON public.question_types
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update question types"
ON public.question_types
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete question types"
ON public.question_types
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));