-- Add answer key support to ingestion_jobs table
ALTER TABLE public.ingestion_jobs 
ADD COLUMN IF NOT EXISTS answer_key_path TEXT,
ADD COLUMN IF NOT EXISTS answer_key_file_name TEXT,
ADD COLUMN IF NOT EXISTS has_answer_key BOOLEAN DEFAULT FALSE;

-- Add answer verification columns to questions table
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS answer_key_answer TEXT,
ADD COLUMN IF NOT EXISTS answer_mismatch BOOLEAN DEFAULT FALSE;

-- Add index for quickly finding mismatched questions
CREATE INDEX IF NOT EXISTS idx_questions_answer_mismatch ON public.questions(answer_mismatch) WHERE answer_mismatch = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.questions.answer_key_answer IS 'The correct answer from the uploaded answer key (e.g., "B")';
COMMENT ON COLUMN public.questions.answer_mismatch IS 'True when AI-generated answer differs from answer key answer';
COMMENT ON COLUMN public.ingestion_jobs.answer_key_path IS 'Storage path to the uploaded answer key PDF';
COMMENT ON COLUMN public.ingestion_jobs.has_answer_key IS 'Whether an answer key was provided for verification';