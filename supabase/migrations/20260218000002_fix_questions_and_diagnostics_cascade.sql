-- Fix for 409 Conflict: Ensure questions and diagnostic_completions cascade delete
-- This migration handles potential varying constraint names by looking them up dynamically

DO $$
DECLARE
    q_constraint_name text;
    dc_constraint_name text;
BEGIN
    -- 1. Handle QUESTIONS table
    -- Find the constraint name for the foreign key on course_pack_id
    SELECT conname INTO q_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.questions'::regclass
      AND confrelid = 'public.course_packs'::regclass
      AND contype = 'f';

    -- Drop the existing constraint if found
    IF q_constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.questions DROP CONSTRAINT ' || quote_ident(q_constraint_name);
    END IF;

    -- Add the new constraint with ON DELETE CASCADE
    ALTER TABLE public.questions
    ADD CONSTRAINT questions_course_pack_id_fkey
    FOREIGN KEY (course_pack_id)
    REFERENCES public.course_packs(id)
    ON DELETE CASCADE;


    -- 2. Handle DIAGNOSTIC_COMPLETIONS table (Re-applying for safety)
    -- Find the constraint name for the foreign key on course_pack_id
    SELECT conname INTO dc_constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.diagnostic_completions'::regclass
      AND confrelid = 'public.course_packs'::regclass
      AND contype = 'f';

    -- Drop the existing constraint if found
    IF dc_constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.diagnostic_completions DROP CONSTRAINT ' || quote_ident(dc_constraint_name);
    END IF;

    -- Add the new constraint with ON DELETE CASCADE
    ALTER TABLE public.diagnostic_completions
    ADD CONSTRAINT diagnostic_completions_course_pack_id_fkey
    FOREIGN KEY (course_pack_id)
    REFERENCES public.course_packs(id)
    ON DELETE CASCADE;

END $$;
