import { Tables } from '@/integrations/supabase/types';
import { GuideMe } from './guide';
import { Rating } from 'ts-fsrs';

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
  imageUrl?: string;
}

// Subpart type for multi-part questions
export interface StudySubpart {
  id: string;               // "a", "b", "c", etc.
  prompt: string;           // Subpart-specific question
  points: number;           // Point value
  correctAnswer?: string;   // For short answer/numeric
  solutionSteps?: string[]; // Solution steps for this subpart
  imageUrl?: string;        // Optional image for subpart
  modelAnswer?: string;     // Model answer for free response
  gradingRubric?: string;   // Grading rubric
  // Per-part guide me, explanation, and key takeaway
  guideMeSteps?: GuideMe | null;
  explanation?: string | null;
  keyTakeaway?: string | null;
}

// Question category from build_daily_plan
export type QuestionCategory = 'review' | 'current' | 'bridge' | 'stretch';

// Question format type
export type QuestionFormat = 'multiple_choice' | 'short_answer' | 'numeric';

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
  imageUrl: string | null;
  guideMeSteps: GuideMe | null;
  // Multi-part question support
  questionFormat: QuestionFormat;
  subparts: StudySubpart[] | null;
  // Course info
  coursePackId: string | null;
  courseName: string | null;
  // Optional fields from daily plan
  category?: QuestionCategory;
  whySelected?: string;
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

  // Parse subparts from JSONB
  const rawSubparts = dbQuestion.subparts;
  const subparts: StudySubpart[] | null = Array.isArray(rawSubparts)
    ? (rawSubparts as unknown as StudySubpart[])
    : null;

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
    imageUrl: dbQuestion.image_url,
    guideMeSteps: dbQuestion.guide_me_steps as unknown as GuideMe | null,
    questionFormat: (dbQuestion.question_format || 'multiple_choice') as QuestionFormat,
    subparts,
    coursePackId: dbQuestion.course_pack_id || null,
    courseName: null,
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

// Result type for subpart completion
export interface SubpartResult {
  subpartId: string;
  isCorrect: boolean;
  confidence: number | null;
  hintsUsed: boolean;
  guideUsed: boolean;
  skipped: boolean;
  answerText?: string;
  selectedChoiceId?: string | null;
  pointsEarned?: number;
  maxPoints?: number;
}

// FSRS rating derivation from correctness + confidence
// Maps existing UX signals to FSRS Rating without any UI change
export function deriveFsrsRating(isCorrect: boolean, confidence: number | null): Rating {
  if (!isCorrect) return Rating.Again;
  switch (confidence) {
    case 1:  return Rating.Hard;   // guessed
    case 2:  return Rating.Good;   // unsure
    case 3:  return Rating.Easy;   // knew_it
    default: return Rating.Good;   // no confidence tap
  }
}
