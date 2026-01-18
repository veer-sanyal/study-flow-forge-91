-- Add midterm_number, question_order, and image_url columns to questions table
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS midterm_number integer CHECK (midterm_number IS NULL OR midterm_number BETWEEN 1 AND 3),
ADD COLUMN IF NOT EXISTS question_order integer,
ADD COLUMN IF NOT EXISTS image_url text;

-- Create index for better performance when ordering questions
CREATE INDEX IF NOT EXISTS idx_questions_source_exam_order ON public.questions(source_exam, question_order);

-- Create storage bucket for question images
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for question-images bucket
CREATE POLICY "Anyone can view question images"
ON storage.objects FOR SELECT
USING (bucket_id = 'question-images');

CREATE POLICY "Admins can upload question images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'question-images' 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can update question images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'question-images' 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete question images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'question-images' 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);