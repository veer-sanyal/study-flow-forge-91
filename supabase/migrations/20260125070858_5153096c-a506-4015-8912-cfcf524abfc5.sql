-- Create user_enrollments table to track which courses users are enrolled in
CREATE TABLE public.user_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_pack_id uuid NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  enrolled_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_pack_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_enrollments ENABLE ROW LEVEL SECURITY;

-- Users can view their own enrollments
CREATE POLICY "Users can view own enrollments"
  ON public.user_enrollments
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can enroll themselves in courses
CREATE POLICY "Users can enroll in courses"
  ON public.user_enrollments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can remove their own enrollments
CREATE POLICY "Users can remove own enrollments"
  ON public.user_enrollments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can manage all enrollments
CREATE POLICY "Admins can manage all enrollments"
  ON public.user_enrollments
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));