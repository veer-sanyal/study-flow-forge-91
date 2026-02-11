-- Migration: Taxonomy descriptions + health view
-- See docs/data-model.md for canonical rules.

-- ============================================================
-- A) Create view: taxonomy_health
-- ============================================================
-- Shows topics and question_types with missing descriptions.
-- 0 rows = healthy taxonomy.

CREATE OR REPLACE VIEW public.taxonomy_health AS
  SELECT 'topic' AS entity_type, id, title AS name, description
  FROM topics
  WHERE description IS NULL OR description = ''
UNION ALL
  SELECT 'question_type' AS entity_type, id, name, description
  FROM question_types
  WHERE description IS NULL OR description = '';

-- ============================================================
-- B) Set defaults to prevent future NULLs
-- ============================================================
ALTER TABLE public.topics
  ALTER COLUMN description SET DEFAULT '';

ALTER TABLE public.question_types
  ALTER COLUMN description SET DEFAULT '';
