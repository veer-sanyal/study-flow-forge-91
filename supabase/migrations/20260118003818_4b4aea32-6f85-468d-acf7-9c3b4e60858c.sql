-- Recommendation algorithm function that powers Today Plan + Keep Practicing
-- Returns prioritized questions based on: due_urgency, knowledge_gap, exam_proximity, difficulty_match, diversity

CREATE OR REPLACE FUNCTION public.get_recommended_questions(
  p_user_id UUID,
  p_limit INT DEFAULT 10,
  p_current_week INT DEFAULT 1,
  p_pace_offset INT DEFAULT 1,
  p_target_difficulty INT DEFAULT 3
)
RETURNS TABLE (
  question_id UUID,
  prompt TEXT,
  choices JSONB,
  correct_answer TEXT,
  hint TEXT,
  difficulty INT,
  topic_ids UUID[],
  source_exam TEXT,
  solution_steps JSONB,
  question_type_id UUID,
  score NUMERIC,
  due_urgency NUMERIC,
  knowledge_gap NUMERIC,
  difficulty_match NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH 
  -- Get user's SRS state for each question
  user_srs AS (
    SELECT 
      s.question_id,
      s.due_at,
      s.interval_days,
      s.last_reviewed_at,
      -- Due urgency: how overdue is this question? (0-1 scale, higher = more urgent)
      CASE 
        WHEN s.due_at <= NOW() THEN 
          LEAST(1.0, EXTRACT(EPOCH FROM (NOW() - s.due_at)) / (7 * 86400))::NUMERIC -- Max out at 1 week overdue
        ELSE 0
      END AS due_urgency_score
    FROM srs_state s
    WHERE s.user_id = p_user_id
  ),
  
  -- Get user's topic mastery
  user_mastery AS (
    SELECT 
      tm.topic_id,
      tm.mastery_0_1,
      tm.retention_0_1,
      tm.last_practiced_at,
      -- Compute retention decay (Anki-like formula)
      CASE 
        WHEN tm.last_practiced_at IS NULL THEN 0.5
        ELSE POWER(2, -EXTRACT(EPOCH FROM (NOW() - tm.last_practiced_at)) / (86400 * GREATEST(0.25, COALESCE(
          (SELECT AVG(ss.interval_days) FROM srs_state ss 
           JOIN questions q ON ss.question_id = q.id 
           WHERE ss.user_id = p_user_id AND tm.topic_id = ANY(q.topic_ids)),
          1
        ))))::NUMERIC
      END AS computed_retention
    FROM topic_mastery tm
    WHERE tm.user_id = p_user_id
  ),
  
  -- Get recent attempts for diversity scoring (avoid repeating same topic/type)
  recent_attempts AS (
    SELECT 
      q.topic_ids,
      q.question_type_id,
      a.created_at
    FROM attempts a
    JOIN questions q ON a.question_id = q.id
    WHERE a.user_id = p_user_id
      AND a.created_at > NOW() - INTERVAL '1 hour'
  ),
  
  -- Score each eligible question
  scored_questions AS (
    SELECT 
      q.id AS q_id,
      q.prompt,
      q.choices,
      q.correct_answer,
      q.hint,
      q.difficulty,
      q.topic_ids,
      q.source_exam,
      q.solution_steps,
      q.question_type_id,
      
      -- Due urgency (0-1): prioritize overdue questions
      COALESCE(us.due_urgency_score, 0.5) AS due_urgency_val,
      
      -- Knowledge gap (0-1): prioritize topics with low mastery/retention
      -- Formula: 1 - avg(0.6*mastery + 0.4*retention) across question's topics
      (1.0 - COALESCE(
        (SELECT AVG(0.6 * um.mastery_0_1 + 0.4 * COALESCE(um.computed_retention, um.retention_0_1))
         FROM user_mastery um 
         WHERE um.topic_id = ANY(q.topic_ids)),
        0.5 -- Default for unseen topics
      ))::NUMERIC AS knowledge_gap_val,
      
      -- Difficulty match (0-1): prefer questions matching target difficulty
      (1.0 - ABS(COALESCE(q.difficulty, 3) - p_target_difficulty) / 5.0)::NUMERIC AS difficulty_match_val,
      
      -- Diversity bonus: penalize recently practiced topics/types
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM recent_attempts ra 
          WHERE ra.topic_ids && q.topic_ids
        ) THEN 0.0
        ELSE 0.2
      END AS diversity_bonus,
      
      -- New question bonus: slight boost for never-seen questions
      CASE WHEN us.question_id IS NULL THEN 0.1 ELSE 0.0 END AS new_bonus
      
    FROM questions q
    LEFT JOIN user_srs us ON q.id = us.question_id
    -- Calendar eligibility: only questions from topics scheduled for current week + pace
    LEFT JOIN topics t ON t.id = ANY(q.topic_ids)
    WHERE q.needs_review = FALSE
      AND (t.scheduled_date IS NULL OR t.scheduled_date <= p_current_week + p_pace_offset)
  )
  
  SELECT 
    sq.q_id,
    sq.prompt,
    sq.choices,
    sq.correct_answer,
    sq.hint,
    sq.difficulty,
    sq.topic_ids,
    sq.source_exam,
    sq.solution_steps,
    sq.question_type_id,
    -- Final composite score (weighted blend)
    (
      sq.due_urgency_val * 0.35 +      -- 35% weight on SRS urgency
      sq.knowledge_gap_val * 0.35 +    -- 35% weight on knowledge gaps
      sq.difficulty_match_val * 0.15 + -- 15% weight on difficulty match
      sq.diversity_bonus +              -- Diversity bonus (0 or 0.2)
      sq.new_bonus                      -- New question bonus (0 or 0.1)
    )::NUMERIC AS score,
    sq.due_urgency_val,
    sq.knowledge_gap_val,
    sq.difficulty_match_val
  FROM scored_questions sq
  GROUP BY 
    sq.q_id, sq.prompt, sq.choices, sq.correct_answer, sq.hint, 
    sq.difficulty, sq.topic_ids, sq.source_exam, sq.solution_steps, 
    sq.question_type_id, sq.due_urgency_val, sq.knowledge_gap_val, 
    sq.difficulty_match_val, sq.diversity_bonus, sq.new_bonus
  ORDER BY score DESC, RANDOM()
  LIMIT p_limit;
END;
$function$;