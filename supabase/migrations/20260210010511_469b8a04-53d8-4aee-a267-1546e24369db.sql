
CREATE TABLE IF NOT EXISTS public.diagnostic_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  course_pack_id UUID NOT NULL REFERENCES public.course_packs(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  questions_answered INTEGER NOT NULL DEFAULT 0,
  questions_correct INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_pack_id)
);

ALTER TABLE public.diagnostic_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own completions"
  ON public.diagnostic_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own completions"
  ON public.diagnostic_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own completions"
  ON public.diagnostic_completions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own completions"
  ON public.diagnostic_completions FOR DELETE
  USING (auth.uid() = user_id);
