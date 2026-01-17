import { Tables } from '@/integrations/supabase/types';

// Database types
export type DbQuestion = Tables<'questions'>;
export type DbTopic = Tables<'topics'>;
export type DbAttempt = Tables<'attempts'>;
export type DbSrsState = Tables<'srs_state'>;
export type DbTopicMastery = Tables<'topic_mastery'>;

// Choice type from JSONB
export interface QuestionChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

// Enriched question for the player (with topic info joined)
export interface StudyQuestion {
  id: string;
  prompt: string;
  choices: QuestionChoice[] | null;
  correctChoiceId: string | null;
  hint: string | null;
  difficulty: number;
  topicIds: string[];
  topicNames: string[];
  sourceExam: string | null;
  solutionSteps: string[] | null;
  questionType: string;
}

// Map database question to study question format
export function mapDbQuestionToStudy(
  dbQuestion: DbQuestion,
  topics: Map<string, DbTopic>,
  questionTypeName: string = 'multiple_choice'
): StudyQuestion {
  // Safely parse choices from JSONB
  const rawChoices = dbQuestion.choices;
  const choices: QuestionChoice[] | null = Array.isArray(rawChoices) 
    ? (rawChoices as unknown as QuestionChoice[])
    : null;
  const correctChoice = choices?.find(c => c.isCorrect);
  
  const topicNames = dbQuestion.topic_ids
    .map(id => topics.get(id)?.title || 'Unknown Topic')
    .filter(Boolean);

  return {
    id: dbQuestion.id,
    prompt: dbQuestion.prompt,
    choices,
    correctChoiceId: correctChoice?.id || null,
    hint: dbQuestion.hint,
    difficulty: dbQuestion.difficulty || 3,
    topicIds: dbQuestion.topic_ids,
    topicNames,
    sourceExam: dbQuestion.source_exam,
    solutionSteps: dbQuestion.solution_steps as string[] | null,
    questionType: questionTypeName,
  };
}

// Confidence mapping
export type ConfidenceLevel = 'guessed' | 'unsure' | 'knew_it';

export function mapConfidenceToDb(confidence: number | null): ConfidenceLevel | null {
  if (confidence === null) return null;
  switch (confidence) {
    case 1: return 'guessed';
    case 2: return 'unsure';
    case 3: return 'knew_it';
    default: return null;
  }
}
