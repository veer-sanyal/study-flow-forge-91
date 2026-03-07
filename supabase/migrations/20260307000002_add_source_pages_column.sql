-- Add source_pages column to questions (needed by generate-questions edge function)
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source_pages JSONB;
