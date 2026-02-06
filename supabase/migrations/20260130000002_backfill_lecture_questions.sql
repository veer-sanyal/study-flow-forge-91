-- Backfill: ensure questions generated from lecture materials are published
-- These questions have source_material_id set but may lack is_published/status flags

UPDATE questions
SET is_published = true, status = 'approved'
WHERE source_material_id IS NOT NULL
  AND (is_published IS NULL OR is_published = false);
