-- Add extracted_text column to course_materials for caching PDF text extraction
ALTER TABLE course_materials
ADD COLUMN IF NOT EXISTS extracted_text TEXT;

COMMENT ON COLUMN course_materials.extracted_text IS 'Cached text content extracted from the PDF for question generation';
