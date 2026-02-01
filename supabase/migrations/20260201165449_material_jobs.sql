-- Create material_jobs table to track server-side material analysis and question generation progress
CREATE TABLE public.material_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('analysis', 'generation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  
  -- Analysis-specific fields
  analysis_phase TEXT CHECK (analysis_phase IN ('chunk_summarization', 'outline', 'topic_extraction', null)),
  total_chunks INTEGER DEFAULT 0,
  completed_chunks INTEGER DEFAULT 0,
  
  -- Generation-specific fields
  total_topics INTEGER DEFAULT 0,
  completed_topics INTEGER DEFAULT 0,
  total_questions INTEGER DEFAULT 0,
  completed_questions INTEGER DEFAULT 0,
  
  -- Current progress info
  current_item TEXT, -- e.g., "Section 3: Derivatives" or "Topic: Integration"
  progress_message TEXT, -- e.g., "Analyzing page 5 of 20" or "Generating questions for topic 2 of 5"
  
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.material_jobs ENABLE ROW LEVEL SECURITY;

-- Admin can manage all material jobs
CREATE POLICY "Admins can manage material jobs"
  ON public.material_jobs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own material jobs
CREATE POLICY "Users can view their own material jobs"
  ON public.material_jobs
  FOR SELECT
  USING (auth.uid() = created_by);

-- Create trigger for updated_at
CREATE TRIGGER update_material_jobs_updated_at
  BEFORE UPDATE ON public.material_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.material_jobs;

-- Add indexes for faster lookups
CREATE INDEX idx_material_jobs_material_id ON public.material_jobs(material_id);
CREATE INDEX idx_material_jobs_status ON public.material_jobs(status) WHERE status IN ('pending', 'running');
CREATE INDEX idx_material_jobs_type_status ON public.material_jobs(job_type, status) WHERE status IN ('pending', 'running');
