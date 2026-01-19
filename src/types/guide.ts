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
export function generateGuideStepsFromSolution(
  solutionSteps: string[] | null,
  questionPrompt: string
): GuideStep[] {
  if (!solutionSteps || solutionSteps.length === 0) {
    return [];
  }

  // Fallback: Create simple guide steps from solution steps
  // In production: Gemini generates proper structured guide steps
  return solutionSteps.slice(0, 5).map((step, index) => ({
    id: `guide-step-${index + 1}`,
    stepNumber: index + 1,
    stepTitle: `Step ${index + 1}`,
    microGoal: 'Understand this step',
    prompt: index === 0 
      ? `Let's break this down. What's the first thing we should identify?`
      : `Good! Now, what's the next step?`,
    choices: [
      { id: 'a', text: step, isCorrect: true },
      { id: 'b', text: 'Skip this step', isCorrect: false },
      { id: 'c', text: 'I need more help', isCorrect: false },
      { id: 'd', text: 'Not sure', isCorrect: false },
    ],
    hints: [
      { tier: 1, text: 'Think about what information we have.' },
      { tier: 2, text: 'Consider the key concepts involved.' },
      { tier: 3, text: `The answer involves: ${step.substring(0, 50)}...` },
    ],
    choiceFeedback: [
      { choiceId: 'a', feedback: 'Correct!' },
      { choiceId: 'b', feedback: 'Each step builds understanding.' },
      { choiceId: 'c', feedback: 'Try using the hints first.' },
      { choiceId: 'd', feedback: 'Review the hints for guidance.' },
    ],
    explanation: step,
    keyTakeaway: 'Each step builds toward the solution.',
  }));
}
