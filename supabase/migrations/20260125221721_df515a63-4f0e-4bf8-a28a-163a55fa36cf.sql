-- =====================================================
-- COURSE MATERIALS & QUESTION GENERATION SCHEMA
-- =====================================================

-- 1) Course Editions (optional term/instructor variants of a course_pack)
CREATE TABLE public.course_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_pack_id uuid NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  term text, -- e.g., "Fall 2024"
  instructor text,
  section text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Course Materials (lecture PDFs, etc.)
CREATE TABLE public.course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_pack_id uuid NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  edition_id uuid REFERENCES public.course_editions(id) ON DELETE SET NULL,
  material_type text NOT NULL CHECK (material_type IN ('exam_pdf', 'lecture_pdf', 'lecture_pptx', 'lecture_notes_text')),
  title text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  sha256 text NOT NULL,
  content_fingerprint text, -- for near-duplicate detection (optional)
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'analyzing', 'analyzed', 'generating_questions', 'ready', 'published', 'failed')),
  analysis_json jsonb,
  error_message text,
  topics_extracted_count integer DEFAULT 0,
  questions_generated_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for dedupe lookup
CREATE UNIQUE INDEX idx_course_materials_sha256 ON public.course_materials(course_pack_id, sha256);

-- 3) Material Chunks (extracted text per page/slide)
CREATE TABLE public.material_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.course_materials(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chunk_type text NOT NULL CHECK (chunk_type IN ('page', 'slide')),
  text text NOT NULL,
  title_hint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_material_chunks_material ON public.material_chunks(material_id);

-- 4) Learning Objectives (linked to topics)
CREATE TABLE public.objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  objective_text text NOT NULL,
  source_material_id uuid REFERENCES public.course_materials(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_objectives_topic ON public.objectives(topic_id);

-- 5) Extend topics table with source tracking
ALTER TABLE public.topics 
  ADD COLUMN IF NOT EXISTS edition_id uuid REFERENCES public.course_editions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_code text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' CHECK (source IN ('exam', 'lecture', 'calendar', 'manual', 'mixed'));

-- 6) Extend questions table for generated questions + publishing workflow
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS objective_id uuid REFERENCES public.objectives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_material_id uuid REFERENCES public.course_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'exam' CHECK (source IN ('exam', 'generated', 'manual')),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS full_solution text,
  ADD COLUMN IF NOT EXISTS common_mistakes jsonb,
  ADD COLUMN IF NOT EXISTS tags jsonb,
  ADD COLUMN IF NOT EXISTS quality_score numeric,
  ADD COLUMN IF NOT EXISTS quality_flags jsonb;

-- Set existing questions as approved + published (backwards compatibility)
UPDATE public.questions SET status = 'approved', is_published = true WHERE status IS NULL OR status = 'approved';

-- 7) Update updated_at triggers
CREATE TRIGGER update_course_editions_updated_at
  BEFORE UPDATE ON public.course_editions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_course_materials_updated_at
  BEFORE UPDATE ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Course Editions
ALTER TABLE public.course_editions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view course editions"
  ON public.course_editions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert course editions"
  ON public.course_editions FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update course editions"
  ON public.course_editions FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete course editions"
  ON public.course_editions FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Course Materials
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all course materials"
  ON public.course_materials FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert course materials"
  ON public.course_materials FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update course materials"
  ON public.course_materials FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete course materials"
  ON public.course_materials FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Material Chunks
ALTER TABLE public.material_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all material chunks"
  ON public.material_chunks FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert material chunks"
  ON public.material_chunks FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete material chunks"
  ON public.material_chunks FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- Objectives
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view objectives"
  ON public.objectives FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert objectives"
  ON public.objectives FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update objectives"
  ON public.objectives FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete objectives"
  ON public.objectives FOR DELETE
  USING (has_role(auth.uid(), 'admin'));

-- =====================================================
-- STORAGE BUCKET
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-materials', 'course-materials', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for course-materials bucket
CREATE POLICY "Admins can upload course materials"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-materials' 
    AND has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can view course materials"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'course-materials' 
    AND has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can delete course materials"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'course-materials' 
    AND has_role(auth.uid(), 'admin')
  );

-- Service role needs access for edge functions
CREATE POLICY "Service role can access course materials"
  ON storage.objects FOR ALL
  USING (bucket_id = 'course-materials')
  WITH CHECK (bucket_id = 'course-materials');