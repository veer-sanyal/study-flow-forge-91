-- Drop stale overloads of get_recommended_questions that cause PostgREST PGRST203
-- ambiguity when p_enrolled_course_ids is omitted (empty enrollment).
--
-- History of signatures added via CREATE OR REPLACE FUNCTION (which creates
-- new overloads when parameter types change instead of replacing the old one):
--
--   v1  20260118 — (uuid, int, int, int, int)                              5 params
--   v2  20260120 — (uuid, int, int, int, int, uuid, text, text[], uuid)    9 params, topic_ids text[]
--   v3  20260125 — (uuid, int, int, int, int, uuid, text, uuid[], uuid)    9 params, topic_ids uuid[]
--   v4  20260127 — (uuid, int, int, int, int, uuid, text, uuid[], uuid, bool) 10 params
--   v5  20260130 — (uuid, int, int, int, int, uuid, text, uuid[], uuid, bool, uuid[]) 11 params ← KEEP
--
-- Only v5 (11-param) should remain so PostgREST always routes unambiguously.

DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer);

DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer, uuid, text, text[], uuid);

DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer, uuid, text, uuid[], uuid);

DROP FUNCTION IF EXISTS public.get_recommended_questions(uuid, integer, integer, integer, integer, uuid, text, uuid[], uuid, boolean);

-- Reload PostgREST schema cache so the removed overloads are evicted immediately.
NOTIFY pgrst, 'reload schema';
