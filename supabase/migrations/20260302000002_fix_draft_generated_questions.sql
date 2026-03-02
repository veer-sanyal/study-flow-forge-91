-- Bug 4 fix: generated questions that are published but still status='draft'
-- are visible to students but invisible to admins (AdminCoursesList and
-- AdminQuestionsEditor both filter them out). Fix them in-place.

UPDATE public.questions
SET
  status = 'approved',
  source_exam = COALESCE(
    source_exam,
    CONCAT(
      'Generated — ',
      (
        SELECT title
        FROM public.course_materials
        WHERE id = questions.source_material_id
        LIMIT 1
      )
    )
  )
WHERE source = 'generated'
  AND is_published = true
  AND status = 'draft';

-- Bug 5 fix: clean up ghost "running" jobs older than 1 hour that were
-- abandoned when the browser tab was closed.

UPDATE public.generation_jobs
SET
  status = 'failed',
  error_message = 'Cleaned up — browser session ended without finalize',
  completed_at = NOW()
WHERE status IN ('running', 'pending')
  AND created_at < NOW() - INTERVAL '1 hour';
