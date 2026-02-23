-- Generation Jobs table for tracking parallel batch question generation
-- Tracks per-material generation runs from the generate-questions-batch edge function

CREATE TABLE public.generation_jobs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id               uuid NOT NULL REFERENCES public.course_materials(id),
  status                    text NOT NULL DEFAULT 'pending', -- pending|running|completed|failed
  total_chunks              integer NOT NULL DEFAULT 0,
  completed_chunks          integer NOT NULL DEFAULT 0,
  failed_chunks             integer NOT NULL DEFAULT 0,
  total_questions_target    integer NOT NULL DEFAULT 0,
  total_questions_generated integer NOT NULL DEFAULT 0,
  current_chunk_summary     text,
  topic_coverage            jsonb,     -- { [chunk_index]: { target: number, generated: number } }
  error_message             text,
  created_by                uuid REFERENCES auth.users(id),
  started_at                timestamptz,
  completed_at              timestamptz,
  created_at                timestamptz DEFAULT now()
);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage generation jobs"
  ON public.generation_jobs FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- Index for fast lookups by material_id and status
CREATE INDEX idx_generation_jobs_material_id ON public.generation_jobs(material_id);
CREATE INDEX idx_generation_jobs_status ON public.generation_jobs(status);

COMMENT ON TABLE public.generation_jobs IS 'Tracks parallel batch question generation jobs per course material';
COMMENT ON COLUMN public.generation_jobs.topic_coverage IS 'Per-chunk tracking: { [chunk_index]: { target, generated } }';
