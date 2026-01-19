-- Fix the admin policy with correct has_role argument order
DROP POLICY IF EXISTS "Admins can read all questions" ON public.questions;

CREATE POLICY "Admins can read all questions" ON public.questions
  FOR SELECT TO authenticated 
  USING (
    has_role(auth.uid(), 'admin'::app_role)
  );