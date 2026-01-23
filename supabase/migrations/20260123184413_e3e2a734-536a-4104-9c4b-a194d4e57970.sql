-- Phase 1: Add question format, subparts, and extended attempts support

-- Add question_format column to questions table
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_format TEXT DEFAULT 'multiple_choice';
-- Values: 'multiple_choice', 'short_answer', 'numeric'

-- Add subparts column for multi-part questions
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS subparts JSONB;
-- Structure: [{
--   id: "a", 
--   prompt: "Define the random variable X...",
--   points: number | null,
--   correctAnswer: string | null,
--   solutionSteps: string[] | null
-- }]

-- Extend attempts table for short-answer responses
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS answer_text TEXT;
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS answer_image_url TEXT;
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS subpart_id TEXT;
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS ai_feedback JSONB;
-- Structure: { isCorrect: boolean, score: number, explanation: string, keyMistakes: string[], suggestions: string[] }
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS points_earned NUMERIC;
ALTER TABLE public.attempts ADD COLUMN IF NOT EXISTS max_points NUMERIC;

-- Create storage bucket for answer images (student uploads)
INSERT INTO storage.buckets (id, name, public)
VALUES ('answer-images', 'answer-images', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can upload their own answer images
CREATE POLICY "Users can upload their own answer images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'answer-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: Users can view their own answer images
CREATE POLICY "Users can view their own answer images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'answer-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS: Users can delete their own answer images
CREATE POLICY "Users can delete their own answer images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'answer-images' AND auth.uid()::text = (storage.foldername(name))[1]);