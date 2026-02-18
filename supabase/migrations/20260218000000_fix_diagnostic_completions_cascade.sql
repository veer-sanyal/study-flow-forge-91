-- Drop the existing foreign key constraint
ALTER TABLE public.diagnostic_completions
DROP CONSTRAINT diagnostic_completions_course_pack_id_fkey;

-- Add the new foreign key constraint with ON DELETE CASCADE
ALTER TABLE public.diagnostic_completions
ADD CONSTRAINT diagnostic_completions_course_pack_id_fkey
FOREIGN KEY (course_pack_id)
REFERENCES public.course_packs(id)
ON DELETE CASCADE;
