// Enhanced Guide Me step structure per project spec
// Teaches transferable reasoning, not just the answer

export interface GuideHint {
  tier: 1 | 2 | 3;
  text: string;
}

export interface ChoiceFeedback {
  choiceId: string;
  feedback: string; // Why right / why tempting but wrong
}

export interface GuideStepChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface GuideStep {
  id: string;
  stepNumber: number;
  stepTitle: string; // Skill name (e.g., "Identify sphere center")
  microGoal: string; // What the student will learn
  prompt: string; // Socratic question
  choices: GuideStepChoice[]; // 4 MC options with misconception-based distractors
  hints: GuideHint[]; // 3 tiers: definition → math setup → one algebra step
  choiceFeedback: ChoiceFeedback[]; // Per-option feedback
  explanation: string; // Full explanation after submission
  keyTakeaway: string; // General rule reusable on similar problems
  isMisconceptionCheck?: boolean; // Step specifically tests common mistake
}

export interface MethodSummary {
  bullets: string[]; // 3 key method steps
  proTip?: string; // Optional conceptual shortcut
}

export interface GuideMe {
  steps: GuideStep[];
  methodSummary: MethodSummary;
}

// Legacy function for backwards compatibility
// This creates minimal placeholder steps when AI-generated guide isn't available
// The steps encourage users to analyze the question rather than using meta-actions
export function generateGuideStepsFromSolution(
  solutionSteps: string[] | null,
  questionPrompt: string
): GuideStep[] {
  if (!solutionSteps || solutionSteps.length === 0) {
    return [];
  }

  // Fallback: Create simple guide steps from solution steps
  // In production: Gemini generates proper structured guide steps with real choices
  return solutionSteps.slice(0, 5).map((step, index) => ({
    id: `guide-step-${index + 1}`,
    stepNumber: index + 1,
    stepTitle: `Step ${index + 1}`,
    microGoal: 'Work through this part of the solution',
    prompt: index === 0 
      ? `Let's break this down. Review the first step:`
      : `Now, review the next step:`,
    choices: [
      { id: 'a', text: step, isCorrect: true },
      { id: 'b', text: 'This step is already covered', isCorrect: false },
      { id: 'c', text: 'This follows from the previous step', isCorrect: false },
      { id: 'd', text: 'Alternative approach needed', isCorrect: false },
    ],
    hints: [
      { tier: 1, text: `Consider what we need to find in this problem.` },
      { tier: 2, text: `Look at the given information and identify key values.` },
      { tier: 3, text: `Apply the relevant formula or method: ${step.substring(0, 80)}...` },
    ],
    choiceFeedback: [
      { choiceId: 'a', feedback: 'This is the correct approach for this step.' },
      { choiceId: 'b', feedback: 'This step introduces new information.' },
      { choiceId: 'c', feedback: 'Review the logical connection between steps.' },
      { choiceId: 'd', feedback: 'The standard approach works well here.' },
    ],
    explanation: step,
    keyTakeaway: 'Understanding each step helps build problem-solving intuition.',
  }));
}
