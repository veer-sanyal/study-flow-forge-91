-- Create diagnostic_completions table to track which courses users have completed diagnostics for
-- This enables mandatory diagnostic quizzes before accessing the study dashboard

CREATE TABLE public.diagnostic_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_pack_id UUID NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  questions_answered INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, course_pack_id)
);

-- Create index for efficient lookups
CREATE INDEX idx_diagnostic_completions_user_id ON public.diagnostic_completions(user_id);
CREATE INDEX idx_diagnostic_completions_course_pack_id ON public.diagnostic_completions(course_pack_id);

-- Enable RLS
ALTER TABLE public.diagnostic_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own completions
CREATE POLICY "Users can view their own diagnostic completions"
  ON public.diagnostic_completions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own diagnostic completions"
  ON public.diagnostic_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own diagnostic completions"
  ON public.diagnostic_completions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own diagnostic completions"
  ON public.diagnostic_completions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostic_completions TO authenticated;

COMMENT ON TABLE public.diagnostic_completions IS 'Tracks which courses users have completed diagnostic quizzes for. Used to enforce mandatory diagnostics before study dashboard access.';
COMMENT ON COLUMN public.diagnostic_completions.skipped IS 'True if user chose to skip the diagnostic rather than complete it';
