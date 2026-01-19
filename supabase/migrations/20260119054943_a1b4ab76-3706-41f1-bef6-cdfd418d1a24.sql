-- Add corresponds_to_exam field to questions table
-- This tracks which exam period the question is relevant for based on topic coverage
-- (different from source_exam which is where the question came from)
-- Values: 'midterm_1', 'midterm_2', 'midterm_3', 'final', or null if not determined
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS corresponds_to_exam text DEFAULT NULL;

-- Add index for efficient filtering by corresponds_to_exam
CREATE INDEX IF NOT EXISTS idx_questions_corresponds_to_exam 
ON public.questions(corresponds_to_exam);

-- Add comment to clarify the difference between source_exam and corresponds_to_exam
COMMENT ON COLUMN public.questions.corresponds_to_exam IS 'The exam period this question topic coverage corresponds to (midterm_1, midterm_2, midterm_3, final) - derived from calendar topics. Different from source_exam which is the original exam PDF this question was extracted from.';