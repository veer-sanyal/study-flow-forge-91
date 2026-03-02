-- Fix orphaned generated questions that have source_material_id but no course_pack_id.
-- These were generated before Bug 1 was fixed (saveQuestions missing course_pack_id).
-- Look up each question's material to backfill course_pack_id and source_exam.

UPDATE public.questions q
SET
  course_pack_id  = cm.course_pack_id,
  source_exam     = 'Generated — ' || TRIM(cm.title),
  status          = 'approved',
  is_published    = true
FROM public.course_materials cm
WHERE q.source            = 'generated'
  AND q.source_material_id = cm.id
  AND q.course_pack_id    IS NULL;

-- Also trim any trailing/leading whitespace from existing source_exam values
-- to prevent URL mismatches (material titles sometimes carry trailing spaces).

UPDATE public.questions
SET source_exam = TRIM(source_exam)
WHERE source = 'generated'
  AND source_exam IS NOT NULL
  AND source_exam <> TRIM(source_exam);
