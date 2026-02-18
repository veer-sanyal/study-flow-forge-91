# Learning Algorithm Skill

This skill guides the spaced repetition and adaptive learning system for Study Flow Forge.

---

## Core Architecture

The recommendation engine powers two modes:
- **Today Plan**: Capped daily practice (e.g., 20 questions)
- **Keep Practicing**: Infinite practice mode

Both use the same multi-factor scoring algorithm via `get_recommended_questions` RPC.

---

## Scoring Formula

Each question receives a composite score (0-1 scale):

```
score = (due_urgency × 0.35) +
        (knowledge_gap × 0.35) +
        (difficulty_match × 0.15) +
        diversity_bonus +
        new_bonus
```

### Factor Weights
| Factor | Weight | Purpose |
|--------|--------|---------|
| Due Urgency | 35% | Prioritize overdue SRS items |
| Knowledge Gap | 35% | Target weak topics |
| Difficulty Match | 15% | Appropriate challenge level |
| Diversity Bonus | 0.2 | Avoid topic repetition |
| New Bonus | 0.1 | Encourage new material |

---

## Due Urgency (SRS Component)

Measures how overdue a question is for review:

```sql
CASE
  WHEN s.due_at <= NOW() THEN
    -- Scale: 0 at due, 1.0 at 1 week overdue
    LEAST(1.0, EXTRACT(EPOCH FROM (NOW() - s.due_at)) / (7 * 86400))::NUMERIC
  ELSE 0
END AS due_urgency_score
```

**Behavior:**
- 0.0 = Not yet due
- 0.5 = 3.5 days overdue
- 1.0 = 7+ days overdue (capped)

For new questions (no SRS state), default = 0.5 (neutral priority).

---

## Knowledge Gap

Identifies topics where the user needs more practice:

```sql
-- Formula: 1 - weighted_average(mastery, retention)
knowledge_gap = 1.0 - AVG(0.6 * mastery_0_1 + 0.4 * retention_0_1)
```

### Mastery Score (0-1)
- Updated after each attempt
- Uses EMA (Exponential Moving Average) with alpha = 0.3:

```
new_mastery = (0.3 × attempt_quality) + (0.7 × old_mastery)
```

### Retention Score (0-1)
Exponential decay based on time since last practice:

```sql
retention = POWER(2, -days_since_practice / interval_days)
```

This follows the Ebbinghaus forgetting curve. Longer intervals = slower decay.

**Behavior:**
- Mastery 0.9, Retention 0.8 → Gap = 0.14 (low priority)
- Mastery 0.5, Retention 0.5 → Gap = 0.50 (medium priority)
- Mastery 0.2, Retention 0.3 → Gap = 0.76 (high priority)
- New topic (no data) → Gap = 0.50 (default)

---

## Difficulty Match

Prefers questions matching the user's target difficulty:

```sql
difficulty_match = 1.0 - ABS(question_difficulty - target_difficulty) / 5.0
```

**Scale (1-5):**
- 1 = Very Easy
- 2 = Easy
- 3 = Medium (default target)
- 4 = Hard
- 5 = Very Hard

**Example with target = 3:**
- Question difficulty 3 → Match = 1.0
- Question difficulty 4 → Match = 0.8
- Question difficulty 1 → Match = 0.6

---

## Diversity Bonus

Prevents topic repetition within a session:

```sql
CASE
  WHEN EXISTS (
    SELECT 1 FROM recent_attempts ra
    WHERE ra.topic_ids && q.topic_ids
      AND ra.created_at > NOW() - INTERVAL '1 hour'
  ) THEN 0.0   -- Recently practiced
  ELSE 0.2    -- Fresh topic bonus
END AS diversity_bonus
```

---

## New Question Bonus

Slight boost for never-seen questions:

```sql
CASE
  WHEN srs_state.question_id IS NULL THEN 0.1  -- New question
  ELSE 0.0
END AS new_bonus
```

---

## FSRS-6 Algorithm Implementation (ts-fsrs)

We use the official ts-fsrs library (v5.2.3) which implements FSRS-6, the latest version of the Free Spaced Repetition Scheduler algorithm.

### Key FSRS Concepts

**Memory State:**
- **Stability (S)**: Interval when retrievability R=90%. Higher = more durable memory.
- **Difficulty (D)**: D∈[1,10]. Higher = harder to remember.
- **Retrievability (R)**: Probability of recall, decays over time.

**Card States:**
- 0 = New (never reviewed)
- 1 = Learning (initial learning steps)
- 2 = Review (graduated, in review cycle)
- 3 = Relearning (forgotten, going through learning steps again)

### Forgetting Curve (FSRS-6)

```
R(t, S) = (1 + factor × t/S)^(-w20)
```

Where `factor = (0.9^(1/w20) - 1)` ensures R(S, S) = 90%.

### Rating to FSRS Mapping

After each attempt, we derive an FSRS rating from correctness + confidence:

```typescript
function deriveFsrsRating(isCorrect: boolean, confidence: number | null): Rating {
  if (!isCorrect) return Rating.Again;
  switch (confidence) {
    case 1:  return Rating.Hard;   // guessed
    case 2:  return Rating.Good;   // unsure
    case 3:  return Rating.Easy;   // knew_it
    default: return Rating.Good;   // no confidence tap
  }
}
```

| Correct | Confidence | FSRS Rating |
|---------|------------|-------------|
| No | - | Again |
| Yes | Guessed | Hard |
| Yes | Unsure | Good |
| Yes | Knew It | Easy |

### Scheduling Flow

1. User answers question → derive FSRS Rating
2. Fetch existing Card from `srs_state` (or create new)
3. Call `fsrsInstance.repeat(card, now)` → get scheduling options
4. Select card for the given rating
5. Upsert updated Card back to `srs_state`

### Database Schema (srs_state)

Full FSRS-6 fields stored:
- `stability`: S value (interval when R=90%)
- `difficulty`: D value (1-10 scale)
- `elapsed_days`: Days since last review
- `scheduled_days`: Next interval
- `lapses`: Times forgotten after graduating
- `learning_steps`: Current learning step
- `state`: Card state (0-3)
- `due_at`: Next due date
- `last_reviewed_at`: Last review timestamp
- `reps`: Total review count

### FSRS Maintenance

On app load, `recalculate_fsrs_for_user` updates `elapsed_days` for all cards based on current time. This ensures the forgetting curve calculation uses accurate time data.

---

## Topic Mastery EMA

Update mastery after each attempt:

```typescript
function updateMastery(oldMastery: number, attemptQuality: number): number {
  const alpha = 0.3;
  const normalizedQuality = attemptQuality / 5; // Convert 0-5 to 0-1
  return (alpha * normalizedQuality) + ((1 - alpha) * oldMastery);
}
```

**Properties:**
- Recent attempts have higher weight
- Smooths out individual bad/good attempts
- Converges toward true mastery level

---

## Difficulty Ramping Rules

Adaptive difficulty based on performance:

```typescript
interface DifficultyState {
  consecutiveCorrect: number;
  consecutiveWrong: number;
  currentDifficulty: number;
}

function updateDifficulty(state: DifficultyState, isCorrect: boolean): number {
  if (isCorrect) {
    state.consecutiveCorrect++;
    state.consecutiveWrong = 0;

    // 3 correct in a row = increase difficulty
    if (state.consecutiveCorrect >= 3) {
      state.consecutiveCorrect = 0;
      return Math.min(5, state.currentDifficulty + 1);
    }
  } else {
    state.consecutiveWrong++;
    state.consecutiveCorrect = 0;

    // 2 wrong in a row = decrease difficulty
    if (state.consecutiveWrong >= 2) {
      state.consecutiveWrong = 0;
      return Math.max(1, state.currentDifficulty - 1);
    }
  }

  return state.currentDifficulty;
}
```

---

## Calendar-Aware Prioritization

Filter by scheduled week and upcoming exams:

```sql
-- Only include topics scheduled for current week + pace offset
WHERE (t.scheduled_date IS NULL OR t.scheduled_date <= p_current_week + p_pace_offset)

-- Boost topics with upcoming exams
JOIN calendar_events ce ON ce.topic_id = ANY(q.topic_ids)
WHERE ce.event_date BETWEEN NOW() AND NOW() + INTERVAL '14 days'
```

**Pace Offset:**
- 0 = Strict curriculum (only current week)
- 1 = One week ahead (default)
- 2+ = More flexible

---

## Anti-Repeat and Interleaving Logic

### Anti-Repeat
Avoid showing same question within session:

```sql
WHERE q.id NOT IN (
  SELECT question_id FROM attempts
  WHERE user_id = p_user_id
    AND created_at > NOW() - INTERVAL '30 minutes'
)
```

### Interleaving
Mix topics for better retention:

```sql
-- Add random factor to prevent deterministic ordering
ORDER BY score DESC, RANDOM()
```

The diversity bonus also promotes interleaving by penalizing consecutive same-topic questions.

---

## Data Integrity Rules

### Append-Only Attempts
```sql
-- attempts table has no UPDATE policy
-- All attempts are immutable records
CREATE POLICY "Users can insert own attempts" ON public.attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No UPDATE or DELETE policies
```

### Atomic State Updates
```sql
-- topic_mastery updates in single transaction
UPDATE topic_mastery
SET
  mastery_0_1 = calculate_new_mastery(...),
  retention_0_1 = 1.0,  -- Reset retention on practice
  last_practiced_at = NOW(),
  updated_at = NOW()
WHERE user_id = p_user_id AND topic_id = p_topic_id;
```

### Explainable Recommendations
Store top factors for debugging:

```typescript
interface RecommendationResult {
  questionId: string;
  score: number;
  factors: {
    dueUrgency: number;
    knowledgeGap: number;
    difficultyMatch: number;
    diversityBonus: number;
    newBonus: number;
  };
}
```

---

## Weak Areas Detection

Identify topics needing attention:

```typescript
export function useWeakAreas() {
  return useQuery({
    queryKey: ['weak-areas', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('topic_mastery')
        .select('topic_id, mastery_0_1, retention_0_1, topics(title)')
        .eq('user_id', user.id)
        .lt('mastery_0_1', 0.5)  // Mastery below 50%
        .order('mastery_0_1', { ascending: true })
        .limit(5);

      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

---

## Overdue Reviews Detection

```typescript
export function useOverdueReviews() {
  return useQuery({
    queryKey: ['overdue-reviews', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('srs_state')
        .select('question_id, due_at, interval_days')
        .eq('user_id', user.id)
        .lt('due_at', new Date().toISOString())
        .order('due_at', { ascending: true });

      return data;
    },
    staleTime: 60 * 1000,
  });
}
```
