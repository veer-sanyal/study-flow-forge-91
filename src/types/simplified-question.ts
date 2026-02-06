// Simplified Question Types for Single-Question Generation Pipeline

/**
 * A single MCQ choice with ID, text, and correctness indicator.
 */
export interface SimplifiedChoice {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
  isCorrect: boolean;
}

/**
 * Simplified question returned from the generate-one-question edge function.
 *
 * NOTE: No explanation or distractorRationales - these are added by the
 * analyze-questions function in a separate enrichment pass.
 */
export interface SimplifiedQuestion {
  stem: string;
  choices: SimplifiedChoice[];
  difficulty: 1 | 2 | 3;  // 1 = Basic, 2 = Intermediate, 3 = Advanced
  topic: string;
}

/**
 * Request payload for generate-one-question edge function.
 */
export interface GenerateOneQuestionRequest {
  lectureContent: string;
  existingQuestions?: string[];  // Stems to avoid duplicating
}

/**
 * Response from generate-one-question edge function on success.
 */
export interface GenerateOneQuestionResponse {
  success: true;
  question: SimplifiedQuestion;
}

/**
 * Response from generate-one-question edge function on error.
 */
export interface GenerateOneQuestionError {
  success: false;
  error: string;
  retryable: boolean;
}

/**
 * Union type for all possible responses.
 */
export type GenerateOneQuestionResult = GenerateOneQuestionResponse | GenerateOneQuestionError;

/**
 * Type guard to check if response is successful.
 */
export function isGenerateSuccess(
  result: GenerateOneQuestionResult
): result is GenerateOneQuestionResponse {
  return result.success === true;
}

/**
 * Validation result for a simplified question.
 */
export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a SimplifiedQuestion meets all requirements.
 * - Stem must be >= 10 chars
 * - Exactly 4 choices with IDs A/B/C/D
 * - Exactly 1 choice has isCorrect: true
 * - Difficulty must be 1, 2, or 3
 * - Topic must be present
 */
export function validateSimplifiedQuestion(
  question: unknown
): QuestionValidationResult {
  const errors: string[] = [];

  if (!question || typeof question !== 'object') {
    return { valid: false, errors: ['Question must be an object'] };
  }

  const q = question as Record<string, unknown>;

  // Validate stem
  if (typeof q.stem !== 'string') {
    errors.push('Stem must be a string');
  } else if (q.stem.length < 10) {
    errors.push('Stem must be at least 10 characters');
  }

  // Validate choices
  if (!Array.isArray(q.choices)) {
    errors.push('Choices must be an array');
  } else if (q.choices.length !== 4) {
    errors.push('Must have exactly 4 choices');
  } else {
    const ids = new Set<string>();
    let correctCount = 0;
    const validIds = new Set(['A', 'B', 'C', 'D']);

    for (const choice of q.choices as unknown[]) {
      if (!choice || typeof choice !== 'object') {
        errors.push('Each choice must be an object');
        continue;
      }

      const c = choice as Record<string, unknown>;

      if (typeof c.id !== 'string' || !validIds.has(c.id)) {
        errors.push(`Choice id must be A, B, C, or D, got: ${String(c.id)}`);
      } else {
        if (ids.has(c.id)) {
          errors.push(`Duplicate choice id: ${c.id}`);
        }
        ids.add(c.id);
      }

      if (typeof c.text !== 'string' || c.text.length === 0) {
        errors.push('Choice text must be a non-empty string');
      }

      if (typeof c.isCorrect !== 'boolean') {
        errors.push('Choice isCorrect must be a boolean');
      } else if (c.isCorrect) {
        correctCount++;
      }
    }

    if (ids.size !== 4) {
      errors.push('Must have choices with IDs A, B, C, and D');
    }

    if (correctCount !== 1) {
      errors.push(`Exactly 1 choice must be correct, found ${correctCount}`);
    }
  }

  // Validate difficulty
  if (typeof q.difficulty !== 'number' || ![1, 2, 3].includes(q.difficulty)) {
    errors.push('Difficulty must be 1, 2, or 3');
  }

  // Validate topic
  if (typeof q.topic !== 'string' || q.topic.length === 0) {
    errors.push('Topic must be a non-empty string');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
