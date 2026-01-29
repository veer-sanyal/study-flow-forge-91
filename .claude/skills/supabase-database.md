# Supabase Database Skill

This skill guides all Supabase database operations for Study Flow Forge.

---

## Client Setup

Always use the typed client from `src/integrations/supabase/client.ts`:

```typescript
import { supabase } from '@/integrations/supabase/client';
```

The client is configured with:
- `Database` type from auto-generated types
- localStorage for session persistence
- Auto token refresh enabled

**Anti-pattern:** Never create ad-hoc clients. Always use the shared instance.

---

## Row Level Security (RLS) Patterns

### Pattern 1: User-Owned Data
Tables where each row belongs to one user:

```sql
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attempts" ON public.attempts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attempts" ON public.attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own attempts" ON public.attempts
  FOR UPDATE USING (auth.uid() = user_id);
```

### Pattern 2: Public Read, Admin Write
Content tables (questions, topics, courses):

```sql
CREATE POLICY "Authenticated users can read questions" ON public.questions
  FOR SELECT TO authenticated USING (true);

-- Admin insert/update via service role key only (edge functions)
```

### Pattern 3: Admin-Only Access
Sensitive admin tables:

```sql
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );
```

**Anti-pattern:** Never expose service_role key to the client. Admin operations must go through edge functions.

---

## Table Design Patterns

### Immutable Event Tables (Append-Only)
For audit trails and attempts:

```sql
CREATE TABLE public.attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  question_id UUID REFERENCES questions NOT NULL,
  is_correct BOOLEAN NOT NULL,
  selected_answer TEXT,
  confidence TEXT,
  time_spent_ms INTEGER,
  hint_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
  -- No updated_at: immutable records
);

CREATE INDEX idx_attempts_user_created ON attempts(user_id, created_at DESC);
```

### Mutable State Tables
For user progress and preferences:

```sql
CREATE TABLE public.topic_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  topic_id UUID REFERENCES topics NOT NULL,
  mastery_0_1 NUMERIC(4,3) DEFAULT 0.5,
  retention_0_1 NUMERIC(4,3) DEFAULT 0.5,
  last_practiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);
```

### Audit Columns
Always include:
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()` (for mutable tables)

---

## Trigger Patterns

### Auto-Update Timestamp

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON topic_mastery
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Auto-Create Profile on Signup

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## PostgreSQL Function Patterns

### Complex Recommendation Query (RPC)
See `get_recommended_questions` function in migrations:

```sql
CREATE OR REPLACE FUNCTION public.get_recommended_questions(
  p_user_id UUID,
  p_limit INT DEFAULT 10,
  p_current_week INT DEFAULT 1,
  p_pace_offset INT DEFAULT 1,
  p_target_difficulty INT DEFAULT 3,
  p_course_id UUID DEFAULT NULL,
  p_exam_name TEXT DEFAULT NULL,
  p_topic_ids UUID[] DEFAULT NULL,
  p_question_type_id UUID DEFAULT NULL,
  p_ignore_constraints BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  question_id UUID,
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
  WITH scored AS (
    -- Multi-factor scoring logic
  )
  SELECT * FROM scored ORDER BY score DESC LIMIT p_limit;
END;
$function$;
```

**Key patterns:**
- Use `SECURITY DEFINER` when function needs elevated access
- Always set `search_path` explicitly
- Return explicit table type for TypeScript inference

---

## Migration Best Practices

### File Naming
Format: `YYYYMMDDHHMMSS_<uuid>.sql`
Example: `20260118003818_4b4aea32-6f85-468d-acf7-9c3b4e60858c.sql`

### Structure
```sql
-- Description of what this migration does
-- ================================================

-- 1. Create or alter tables
CREATE TABLE IF NOT EXISTS ...;

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS ...;

-- 3. Create or replace functions
CREATE OR REPLACE FUNCTION ...;

-- 4. Create or replace triggers
DROP TRIGGER IF EXISTS ... ON ...;
CREATE TRIGGER ...;

-- 5. Enable RLS and create policies
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
CREATE POLICY ... ON ...;
```

---

## Type Generation Workflow

1. Make schema changes in Supabase dashboard or via migrations
2. Run: `npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`
3. Types auto-update in client usage

**Usage in code:**
```typescript
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type Question = Tables<'questions'>;
type NewAttempt = TablesInsert<'attempts'>;
type UpdateMastery = TablesUpdate<'topic_mastery'>;
```

---

## Anti-Patterns

1. **Never disable RLS** on user data tables
2. **Never use service_role key** in client code
3. **Never store secrets** in database columns
4. **Never use raw SQL** in client - use typed queries
5. **Never skip type generation** after schema changes
6. **Avoid N+1 queries** - use joins or RPC functions
7. **Avoid wide SELECT *** - specify needed columns

---

## Query Patterns

### Select with Type Safety
```typescript
const { data, error } = await supabase
  .from('questions')
  .select('id, prompt, difficulty, topic_ids')
  .eq('needs_review', false)
  .limit(10);

if (error) throw error;
// data is typed as Pick<Question, 'id' | 'prompt' | 'difficulty' | 'topic_ids'>[]
```

### Insert with Return
```typescript
const { data, error } = await supabase
  .from('attempts')
  .insert({
    user_id: user.id,
    question_id: questionId,
    is_correct: true,
    confidence: 'high',
  })
  .select()
  .single();
```

### RPC Call
```typescript
const { data, error } = await supabase
  .rpc('get_recommended_questions', {
    p_user_id: user.id,
    p_limit: 10,
    p_target_difficulty: 3,
  });
```
