-- Add daily_plan_mode column to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN daily_plan_mode TEXT NOT NULL DEFAULT 'single_course'
CHECK (daily_plan_mode IN ('single_course', 'mixed'));

-- Add comment for clarity
COMMENT ON COLUMN public.user_settings.daily_plan_mode IS 'Controls whether daily plan focuses on one course or mixes all courses';