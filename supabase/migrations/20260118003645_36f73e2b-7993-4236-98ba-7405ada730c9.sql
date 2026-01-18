-- Create trigger to automatically update SRS state and topic mastery after each attempt
CREATE TRIGGER trigger_update_srs_after_attempt
  AFTER INSERT ON public.attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_srs_after_attempt();