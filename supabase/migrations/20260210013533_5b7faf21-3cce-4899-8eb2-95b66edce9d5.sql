
-- Allow users to delete their own srs_state records
CREATE POLICY "Users can delete own srs_state"
ON public.srs_state
FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own topic_mastery records
CREATE POLICY "Users can delete own topic_mastery"
ON public.topic_mastery
FOR DELETE
USING (auth.uid() = user_id);

-- Allow users to delete their own attempts
CREATE POLICY "Users can delete own attempts"
ON public.attempts
FOR DELETE
USING (auth.uid() = user_id);
