-- Create analysis_jobs table to track server-side batch analysis progress
CREATE TABLE public.analysis_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_pack_id UUID NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  source_exam TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  total_questions INTEGER NOT NULL DEFAULT 0,
  completed_questions INTEGER NOT NULL DEFAULT 0,
  failed_questions INTEGER NOT NULL DEFAULT 0,
  current_question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  current_question_prompt TEXT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;

-- Admin can manage all analysis jobs (using consistent has_role pattern from other tables)
CREATE POLICY "Admins can manage analysis jobs"
  ON public.analysis_jobs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own analysis jobs
CREATE POLICY "Users can view their own analysis jobs"
  ON public.analysis_jobs
  FOR SELECT
  USING (auth.uid() = created_by);

-- Create trigger for updated_at
CREATE TRIGGER update_analysis_jobs_updated_at
  BEFORE UPDATE ON public.analysis_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.analysis_jobs;

-- Add index for faster lookups
CREATE INDEX idx_analysis_jobs_course_exam ON public.analysis_jobs(course_pack_id, source_exam);
CREATE INDEX idx_analysis_jobs_status ON public.analysis_jobs(status) WHERE status IN ('pending', 'running');