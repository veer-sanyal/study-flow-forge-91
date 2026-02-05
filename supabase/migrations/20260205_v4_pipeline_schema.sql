-- V4 Question-Ready Facts Pipeline Schema Migration
-- This migration adds support for the v4 pipeline with rich chunk extraction

-- Add analysis_json_v4 column to course_materials for new pipeline output
ALTER TABLE public.course_materials
  ADD COLUMN IF NOT EXISTS analysis_json_v4 jsonb;

-- Create chunk extraction cache table for incremental processing
CREATE TABLE IF NOT EXISTS public.chunk_extraction_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_hash text NOT NULL,
  chunk_index integer NOT NULL,
  extracted_at timestamptz DEFAULT now(),
  data jsonb NOT NULL,
  UNIQUE(doc_hash, chunk_index)
);

-- Add index for fast lookups by document hash
CREATE INDEX IF NOT EXISTS idx_chunk_extraction_cache_doc_hash
  ON public.chunk_extraction_cache(doc_hash);

-- Add source_evidence and grounding_score columns to questions table
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source_evidence jsonb,
  ADD COLUMN IF NOT EXISTS grounding_score numeric;

-- Add index for grounding score filtering
CREATE INDEX IF NOT EXISTS idx_questions_grounding_score
  ON public.questions(grounding_score)
  WHERE grounding_score IS NOT NULL;

-- Add RLS policies for chunk_extraction_cache (admin only)
ALTER TABLE public.chunk_extraction_cache ENABLE ROW LEVEL SECURITY;

-- Allow admins to read/write chunk extraction cache
CREATE POLICY "Admins can manage chunk extraction cache"
  ON public.chunk_extraction_cache
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Comment on new columns
COMMENT ON COLUMN public.course_materials.analysis_json_v4 IS 'V4 pipeline analysis with question-ready chunks';
COMMENT ON COLUMN public.questions.source_evidence IS 'Evidence spans and fact IDs cited by this question';
COMMENT ON COLUMN public.questions.grounding_score IS 'Grounding quality score (0-1) based on evidence citations';
COMMENT ON TABLE public.chunk_extraction_cache IS 'Cache of extracted question-ready chunks by document hash';
