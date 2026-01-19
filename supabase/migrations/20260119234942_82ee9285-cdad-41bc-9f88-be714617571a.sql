-- Add midterm_coverage column to topics table
-- This indicates which midterm period (1, 2, or 3) this topic is covered before
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS midterm_coverage integer CHECK (midterm_coverage BETWEEN 1 AND 3);

-- Add is_final column to ingestion_jobs table
-- This indicates if the exam is a final (which covers all midterm topics)
ALTER TABLE public.ingestion_jobs 
ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.topics.midterm_coverage IS 'Which midterm period (1, 2, or 3) this topic is covered before';
COMMENT ON COLUMN public.ingestion_jobs.is_final IS 'Whether this exam is a final (covers topics from multiple midterms)';