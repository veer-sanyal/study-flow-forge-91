-- Add policy for admins to view ALL questions (including those needing review)
CREATE POLICY "Admins can view all questions" 
ON public.questions 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add policy for admins to update questions (for approving, editing)
CREATE POLICY "Admins can update questions" 
ON public.questions 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add policy for admins to delete questions
CREATE POLICY "Admins can delete questions" 
ON public.questions 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add policy for admins to insert questions (for ingestion)
CREATE POLICY "Admins can insert questions" 
ON public.questions 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));