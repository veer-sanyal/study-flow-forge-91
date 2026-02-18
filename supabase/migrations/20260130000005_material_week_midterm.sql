-- Add organizational columns to course_materials for hierarchical display
-- These allow admins to organize lecture materials by week and midterm

ALTER TABLE course_materials
  ADD COLUMN IF NOT EXISTS scheduled_date integer,
  ADD COLUMN IF NOT EXISTS corresponds_to_midterm integer;

COMMENT ON COLUMN course_materials.scheduled_date IS 'Week number in the course when this material is covered';
COMMENT ON COLUMN course_materials.corresponds_to_midterm IS 'Which midterm this material corresponds to (1, 2, 3, etc.)';
