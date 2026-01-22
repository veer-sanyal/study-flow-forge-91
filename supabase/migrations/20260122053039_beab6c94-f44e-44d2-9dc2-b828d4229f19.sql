-- Drop the overly permissive "Anyone can view question types" policy
DROP POLICY IF EXISTS "Anyone can view question types" ON public.question_types;

-- Create a new policy requiring authentication for SELECT
CREATE POLICY "Authenticated users can view question types" 
ON public.question_types 
FOR SELECT 
USING (auth.uid() IS NOT NULL);