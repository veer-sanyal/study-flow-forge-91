-- Fix existing questions with PARADOX-contaminated choice IDs
UPDATE questions 
SET choices = (
  SELECT jsonb_agg(
    jsonb_set(
      choice,
      '{id}',
      to_jsonb(lower(substring(choice->>'id' from 1 for 1)))
    )
  )
  FROM jsonb_array_elements(choices) AS choice
)
WHERE choices::text ILIKE '%paradox%';

-- Enable realtime for ingestion_jobs for progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.ingestion_jobs;