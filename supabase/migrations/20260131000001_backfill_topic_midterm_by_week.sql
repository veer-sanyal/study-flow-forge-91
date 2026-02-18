-- Backfill topics.midterm_coverage using scheduled_date comparison against
-- exam week_number from calendar_events.
-- Topics with scheduled_date <= exam.week_number get assigned to that midterm.
-- Topics after all midterms stay NULL (finals).

DO $$
DECLARE
  r_course RECORD;
  r_exam   RECORD;
  prev_week INT;
BEGIN
  -- Iterate over every course that has topics
  FOR r_course IN
    SELECT DISTINCT course_pack_id FROM topics
  LOOP
    prev_week := 0;

    -- For each midterm/exam event in this course, ordered by week
    FOR r_exam IN
      SELECT
        ce.week_number,
        (regexp_match(ce.title, '(?:midterm|exam)\s*(\d)', 'i'))[1]::int AS midterm_num
      FROM calendar_events ce
      WHERE ce.course_pack_id = r_course.course_pack_id
        AND ce.event_type = 'exam'
        AND ce.title ~* '(?:midterm|exam)\s*\d'
      ORDER BY ce.week_number ASC
    LOOP
      -- Assign topics whose scheduled_date falls up to and including this exam's week
      UPDATE topics
      SET midterm_coverage = r_exam.midterm_num
      WHERE course_pack_id = r_course.course_pack_id
        AND scheduled_date IS NOT NULL
        AND scheduled_date > prev_week
        AND scheduled_date <= r_exam.week_number
        AND (midterm_coverage IS NULL OR midterm_coverage != r_exam.midterm_num);

      prev_week := r_exam.week_number;
    END LOOP;

    -- Topics after all midterms stay NULL (finals) - no action needed
  END LOOP;
END;
$$;
