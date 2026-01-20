-- Add is_published column to ingestion_jobs table
ALTER TABLE public.ingestion_jobs
ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT false;