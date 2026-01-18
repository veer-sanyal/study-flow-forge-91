-- 1. Create storage bucket for exam PDFs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('exam-pdfs', 'exam-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for exam PDFs (admins only)
CREATE POLICY "Admins can upload exam PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-pdfs' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can view exam PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-pdfs' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete exam PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-pdfs' 
  AND public.has_role(auth.uid(), 'admin')
);

-- 3. Create ingestion_jobs table for tracking PDF processing
CREATE TABLE public.ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_pack_id UUID REFERENCES public.course_packs(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  current_step TEXT, -- Step codes like A1, A2, B1-B7
  progress_pct INT DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  questions_extracted INT DEFAULT 0,
  questions_mapped INT DEFAULT 0,
  questions_pending_review INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 4. Enable RLS on ingestion_jobs
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for ingestion_jobs (admins only)
CREATE POLICY "Admins can view all ingestion jobs"
ON public.ingestion_jobs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create ingestion jobs"
ON public.ingestion_jobs FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ingestion jobs"
ON public.ingestion_jobs FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete ingestion jobs"
ON public.ingestion_jobs FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Add trigger for updated_at
CREATE TRIGGER update_ingestion_jobs_updated_at
BEFORE UPDATE ON public.ingestion_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();