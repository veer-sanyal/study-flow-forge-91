export interface Question {
  id: string;
  prompt_md: string;
  has_choices: boolean;
  choices?: { key: string; text: string }[];
  answer_final: string;
  solution_steps_md: string;
  hint_text: string;
  difficulty_1_5: number;
  topic_name: string;
  question_type: string;
}

export const mockQuestions: Question[] = [
  {
    id: "q1",
    prompt_md: "Find the derivative of $f(x) = x^2 \\sin(x)$.",
    has_choices: true,
    choices: [
      { key: "A", text: "$2x\\sin(x)$" },
      { key: "B", text: "$x^2\\cos(x)$" },
      { key: "C", text: "$2x\\sin(x) + x^2\\cos(x)$" },
      { key: "D", text: "$2x\\cos(x) - x^2\\sin(x)$" },
    ],
    answer_final: "C",
    solution_steps_md: `**Using the Product Rule:**

1. Let $u = x^2$ and $v = \\sin(x)$
2. Then $u' = 2x$ and $v' = \\cos(x)$
3. Product rule: $(uv)' = u'v + uv'$
4. $f'(x) = 2x\\sin(x) + x^2\\cos(x)$`,
    hint_text: "Think about which differentiation rule applies when you have two functions multiplied together.",
    difficulty_1_5: 3,
    topic_name: "Product Rule",
    question_type: "Differentiation",
  },
  {
    id: "q2",
    prompt_md: "Evaluate the integral $\\int_0^1 2x \\, dx$.",
    has_choices: true,
    choices: [
      { key: "A", text: "$0$" },
      { key: "B", text: "$1$" },
      { key: "C", text: "$2$" },
      { key: "D", text: "$\\frac{1}{2}$" },
    ],
    answer_final: "B",
    solution_steps_md: `**Evaluating the definite integral:**

1. Find the antiderivative: $\\int 2x \\, dx = x^2 + C$
2. Apply the bounds: $[x^2]_0^1 = 1^2 - 0^2 = 1$`,
    hint_text: "First find the antiderivative, then evaluate at the bounds.",
    difficulty_1_5: 2,
    topic_name: "Definite Integrals",
    question_type: "Integration",
  },
  {
    id: "q3",
    prompt_md: "Find the limit: $\\lim_{x \\to 0} \\frac{\\sin(x)}{x}$",
    has_choices: true,
    choices: [
      { key: "A", text: "$0$" },
      { key: "B", text: "$1$" },
      { key: "C", text: "$\\infty$" },
      { key: "D", text: "Does not exist" },
    ],
    answer_final: "B",
    solution_steps_md: `**This is a fundamental limit:**

This is one of the most important limits in calculus. It can be proven using the squeeze theorem or L'Hôpital's rule.

Using L'Hôpital's rule (since we get $\\frac{0}{0}$):
$$\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = \\lim_{x \\to 0} \\frac{\\cos(x)}{1} = \\cos(0) = 1$$`,
    hint_text: "This is a famous limit. Consider using L'Hôpital's rule or recall this fundamental result.",
    difficulty_1_5: 2,
    topic_name: "Limits",
    question_type: "Limit Evaluation",
  },
  {
    id: "q4",
    prompt_md: "If $f(x) = e^{2x}$, find $f''(x)$.",
    has_choices: true,
    choices: [
      { key: "A", text: "$2e^{2x}$" },
      { key: "B", text: "$4e^{2x}$" },
      { key: "C", text: "$e^{2x}$" },
      { key: "D", text: "$2e^{x}$" },
    ],
    answer_final: "B",
    solution_steps_md: `**Finding the second derivative:**

1. First derivative: $f'(x) = 2e^{2x}$ (chain rule)
2. Second derivative: $f''(x) = 2 \\cdot 2e^{2x} = 4e^{2x}$`,
    hint_text: "Remember to apply the chain rule when differentiating exponentials with a coefficient in the exponent.",
    difficulty_1_5: 2,
    topic_name: "Chain Rule",
    question_type: "Differentiation",
  },
  {
    id: "q5",
    prompt_md: "Find the critical points of $f(x) = x^3 - 3x^2 + 2$.",
    has_choices: true,
    choices: [
      { key: "A", text: "$x = 0$ only" },
      { key: "B", text: "$x = 2$ only" },
      { key: "C", text: "$x = 0$ and $x = 2$" },
      { key: "D", text: "$x = 1$ and $x = 2$" },
    ],
    answer_final: "C",
    solution_steps_md: `**Finding critical points:**

1. Find $f'(x) = 3x^2 - 6x$
2. Set $f'(x) = 0$: $3x^2 - 6x = 0$
3. Factor: $3x(x - 2) = 0$
4. Solutions: $x = 0$ or $x = 2$`,
    hint_text: "Critical points occur where the derivative equals zero. Find f'(x) and solve f'(x) = 0.",
    difficulty_1_5: 3,
    topic_name: "Critical Points",
    question_type: "Optimization",
  },
];
