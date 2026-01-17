-- =============================================
-- ONE STUDY HUB - Core Schema
-- =============================================

-- 1. PROFILES TABLE (user metadata)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. COURSE PACKS TABLE
CREATE TABLE public.course_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_packs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read course packs
CREATE POLICY "Authenticated users can read course packs" ON public.course_packs
  FOR SELECT TO authenticated USING (true);

-- 3. TOPICS TABLE (canonical topics)
CREATE TABLE public.topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_pack_id UUID REFERENCES public.course_packs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_week INT, -- Calendar-derived scheduling
  prerequisite_topic_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read topics" ON public.topics
  FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_topics_course_pack ON public.topics(course_pack_id);

-- 4. QUESTION TYPES TABLE
CREATE TABLE public.question_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'proposed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read question types" ON public.question_types
  FOR SELECT TO authenticated USING (true);

-- Seed common question types
INSERT INTO public.question_types (name, description, status) VALUES
  ('multiple_choice', 'Multiple choice with single correct answer', 'active'),
  ('multi_select', 'Multiple choice with multiple correct answers', 'active'),
  ('short_answer', 'Short text response', 'active'),
  ('numeric', 'Numeric answer with tolerance', 'active');

-- 5. QUESTIONS TABLE
CREATE TABLE public.questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_type_id UUID REFERENCES public.question_types(id),
  prompt TEXT NOT NULL,
  choices JSONB, -- For MC: [{id, text, isCorrect}]
  correct_answer TEXT, -- For non-MC questions
  solution_steps JSONB, -- Array of solution step strings
  hint TEXT,
  difficulty INT CHECK (difficulty BETWEEN 1 AND 5),
  topic_ids UUID[] NOT NULL DEFAULT '{}', -- Tags to multiple topics
  source_exam TEXT, -- e.g., "Fall 2023 Midterm"
  needs_review BOOLEAN NOT NULL DEFAULT false,
  unmapped_topic_suggestions TEXT[], -- Gemini suggestions if couldn't map
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read questions" ON public.questions
  FOR SELECT TO authenticated USING (needs_review = false);

CREATE INDEX idx_questions_topic_ids ON public.questions USING GIN(topic_ids);
CREATE INDEX idx_questions_difficulty ON public.questions(difficulty);

-- 6. ATTEMPTS TABLE (immutable event log)
CREATE TABLE public.attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_choice_id TEXT, -- For MC questions
  answer_given TEXT, -- For non-MC questions
  is_correct BOOLEAN NOT NULL,
  confidence TEXT CHECK (confidence IN ('guessed', 'unsure', 'knew_it')),
  hint_used BOOLEAN NOT NULL DEFAULT false,
  guide_used BOOLEAN NOT NULL DEFAULT false,
  time_spent_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own attempts" ON public.attempts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own attempts" ON public.attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_attempts_user ON public.attempts(user_id);
CREATE INDEX idx_attempts_question ON public.attempts(question_id);
CREATE INDEX idx_attempts_created ON public.attempts(created_at DESC);

-- 7. SRS STATE TABLE (per user/question - SM-2 variant)
CREATE TABLE public.srs_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  ease NUMERIC(4,2) NOT NULL DEFAULT 2.5 CHECK (ease >= 1.3),
  interval_days NUMERIC(6,2) NOT NULL DEFAULT 1,
  reps INT NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE public.srs_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own srs_state" ON public.srs_state
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own srs_state" ON public.srs_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own srs_state" ON public.srs_state
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_srs_state_user ON public.srs_state(user_id);
CREATE INDEX idx_srs_state_due ON public.srs_state(due_at);

-- 8. TOPIC MASTERY TABLE (derived learner state per topic)
CREATE TABLE public.topic_mastery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  mastery_0_1 NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (mastery_0_1 BETWEEN 0 AND 1),
  retention_0_1 NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (retention_0_1 BETWEEN 0 AND 1),
  questions_attempted INT NOT NULL DEFAULT 0,
  questions_correct INT NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  retention_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, topic_id)
);

ALTER TABLE public.topic_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own topic_mastery" ON public.topic_mastery
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own topic_mastery" ON public.topic_mastery
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own topic_mastery" ON public.topic_mastery
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_topic_mastery_user ON public.topic_mastery(user_id);
CREATE INDEX idx_topic_mastery_topic ON public.topic_mastery(topic_id);

-- 9. Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_course_packs_updated_at BEFORE UPDATE ON public.course_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_srs_state_updated_at BEFORE UPDATE ON public.srs_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_topic_mastery_updated_at BEFORE UPDATE ON public.topic_mastery
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();