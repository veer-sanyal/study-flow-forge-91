// Guide Me step structure per project spec (2-5 MC steps, 3 hint tiers per step)

export interface GuideHint {
  tier: 1 | 2 | 3;
  text: string;
}

export interface GuideStepChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface GuideStep {
  id: string;
  stepNumber: number;
  prompt: string;
  choices: GuideStepChoice[];
  hints: GuideHint[];
  explanation: string;
}

// For now, generate guide steps from solution_steps until Gemini provides structured guide data
export function generateGuideStepsFromSolution(
  solutionSteps: string[] | null,
  questionPrompt: string
): GuideStep[] {
  if (!solutionSteps || solutionSteps.length === 0) {
    return [];
  }

  // For MVP: Create simple guide steps from solution steps
  // In production: Gemini will generate proper MC guide steps
  return solutionSteps.slice(0, 5).map((step, index) => ({
    id: `guide-step-${index + 1}`,
    stepNumber: index + 1,
    prompt: index === 0 
      ? `Let's break this down. What's the first thing we should identify?`
      : `Good! Now, what's the next step?`,
    choices: [
      { id: 'a', text: step, isCorrect: true },
      { id: 'b', text: 'Skip this step', isCorrect: false },
      { id: 'c', text: 'I need more help', isCorrect: false },
    ],
    hints: [
      { tier: 1, text: 'Think about what information we have.' },
      { tier: 2, text: 'Consider the key concepts involved.' },
      { tier: 3, text: `The answer involves: ${step.substring(0, 50)}...` },
    ],
    explanation: step,
  }));
}
