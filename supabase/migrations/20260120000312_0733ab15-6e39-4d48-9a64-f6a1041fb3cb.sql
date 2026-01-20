-- Add structured exam detail columns to ingestion_jobs
ALTER TABLE public.ingestion_jobs ADD COLUMN IF NOT EXISTS exam_year INTEGER;
ALTER TABLE public.ingestion_jobs ADD COLUMN IF NOT EXISTS exam_semester TEXT;
ALTER TABLE public.ingestion_jobs ADD COLUMN IF NOT EXISTS exam_type TEXT;