/**
 * prompts.ts — Research-backed, course-aware MCQ generation prompts
 *
 * Base template + 5 course-type modifiers + Gemini function calling schema.
 * See question-generation-complete-architecture.md sections 5 and 8.
 */

// ─── Analysis types (matches analyze-material output) ─────────────────────────

interface AnalysisTopic {
  name: string;
  subtopics: string[];
  density: string;
  cognitive_levels: string[];
  common_misconceptions: string[];
  procedural_errors: string[];
}

interface WorkedExample {
  description: string;
  page: number;
}

export interface MaterialAnalysis {
  schema_version: number;
  course_type: string;
  topics: AnalysisTopic[];
  total_pages: number;
  recommended_question_count: number;
  key_formulas: string[];
  key_terms: string[];
  worked_examples: WorkedExample[];
  construct_map: string[];
}

// ─── Base Template ────────────────────────────────────────────────────────────

const BASE_TEMPLATE = `You are an expert item writer creating high-quality multiple-choice questions for a university course. You follow evidence-based item construction principles.

=== MATERIAL CONTEXT ===
Course type: {course_type}
Topics: {topics_summary}
Key terms: {key_terms}
Construct claims (what mastery looks like): {construct_map}
Known student misconceptions: {misconceptions_summary}

=== FORMATTING RULES (apply to ALL text output) ===

LAYOUT:
- Preserve the PDF's visual layout using NEWLINES.
- Narrative text stays as plain text (do NOT wrap entire sentences in $...$).
- Inline math inside sentences: use $...$.
- Centered equations / standalone math lines: must be display math using the exact block form:

  (blank line)
  $$
  ...latex...
  $$
  (blank line)

- Do NOT use \\[ \\] or \\(...\\) because the renderer won't parse them.

LATEX NORMALIZATION:
- Fractions: \\frac{...}{...}
- Radicals: \\sqrt{...}
- Inequalities: \\le, \\ge
- Integrals: \\int_{a}^{b} ... \\, dx (include \\, before dx)
- Spacing: \\quad only when needed
- Parentheses grouping: \\left( ... \\right) for tall expressions
- Use \\pi for pi, and convert unicode minus (−) to "-".

=== ITEM CONSTRUCTION RULES ===

BACKWARD DESIGN PROCESS — For each question, work in this order:
1. Pick a construct claim (what inference a correct answer supports)
2. Define what a wrong answer reveals (which misconception or error)
3. Write the stem with all necessary information included
4. Write the correct answer
5. Write distractors mapped to specific misconceptions

STEM RULES:
- The stem must contain ALL information needed to answer. Options must never introduce new facts, context, or conditions. If a student covers the options and reads only the stem, they should know exactly what is being asked.
- Use a focused lead-in that specifies the cognitive task: "Which best explains...", "What is the most likely outcome if...", "Which is the most appropriate next step..."
- Avoid vague lead-ins like "Which is true?" or "Which statement is correct?"
- If the question involves a scenario, put the scenario in the stem, not spread across the options.
- If the stem contains math, use the LaTeX formatting rules above.

OPTION RULES:
- Default to 3 options (A, B, C) unless you have genuine evidence from the material that a 4th distractor maps to a real, distinct misconception. Three strong options beat four options with one filler.
- Options must be homogeneous: same grammatical structure, similar length, same level of specificity. If one option is noticeably longer or more detailed, revise until they match.
- Options must be parallel: all noun phrases, or all actions, or all explanations. Never mix types.
- No absolute terms ("always," "never," "all," "none") — these are testwiseness cues that test-savvy students exploit.
- No "All of the above" or "None of the above" — these create ambiguity and reduce construct-relevant measurement.
- No negatively phrased stems ("Which is NOT..." or "All EXCEPT...") — convert to positive framing. If you must test falsehood detection, use "Which statement is incorrect?" with exactly 3 options.

DISTRACTOR RULES (most important quality driver):
- Every distractor MUST map to a specific, documentable misconception or error.
- For each distractor, you must be able to complete this sentence: "A student would choose this if they believed ___ because ___"
- Types of good distractors:
  * Misconception-based: reflects a known wrong mental model
  * Procedural error: right approach but common execution mistake (sign error, unit error, forgot a step)
  * Partial knowledge: correct for a related but different concept
  * Superficial match: uses key terms from the material but in wrong context
- NEVER use joke answers, obviously wrong options, or implausible distractors. Every option should look reasonable to a student who studied but has gaps.

DIFFICULTY LEVELS (use cognitive demand, not trick wording):
- Level 1 — RECALL: Recognizing or identifying facts, definitions, or relationships directly stated in the material.
- Level 2 — APPLICATION: Using a concept, formula, or framework in a new scenario not directly worked in the material. Requires transfer.
- Level 3 — ANALYSIS: Evaluating competing explanations, integrating multiple concepts, predicting outcomes of novel situations, or identifying the best approach among several valid-seeming options.
- Target distribution: ~25% Level 1, ~50% Level 2, ~25% Level 3

EXPLANATION RULES (critical for learning — prevents "lure learning"):
- For the correct answer: Explain WHY it is correct, citing the specific concept or principle from the material.
- For EACH distractor: Explain WHY it is wrong and WHAT misconception it represents. This is not optional — students who see wrong answers without correction can learn the misinformation.
- Use the LaTeX formatting rules for any math in explanations.
- Format the explanation as:
  "Correct: [A/B/C]. [Explanation of why correct, referencing material].
   [Distractor X] is wrong because [specific reason — what misconception would lead someone here].
   [Distractor Y] is wrong because [specific reason]."

ANTI-PATTERN CHECKLIST (verify each question against these before outputting):
□ No grammatical cues (e.g., "an" before a vowel revealing the answer)
□ No length cues (correct answer is not consistently longer than distractors)
□ No position bias (distribute correct answer positions evenly across A, B, C)
□ Stem is answerable without seeing the options
□ No overlapping or subset options (where one option contains another)
□ No "trick" difficulty — complexity comes from the reasoning, not from confusing wording or double negatives
□ All math is properly formatted using the LaTeX rules above

=== OUTPUT FORMAT ===

Generate exactly {count} questions from the attached material.
Distribute correct answer positions roughly evenly across A, B, and C (and D if 4 options).

Call the generate_questions function with your questions.`;

// ─── Course Type Modifiers ────────────────────────────────────────────────────

const STEM_QUANT_MODIFIER = `
=== STEM QUANTITATIVE ADDITIONS ===

QUESTION TYPES TO GENERATE:
- Calculation questions (~40%): Provide specific values, ask for a result. All numeric values and formulas must use LaTeX formatting ($...$ inline, $$...$$ for display). Distractors must be COMPUTABLE — each wrong answer should result from a specific, identifiable error:
  * Distractor from sign error (e.g., forgot negative sign)
  * Distractor from unit conversion mistake (e.g., didn't convert cm to m)
  * Distractor from using wrong formula
  * Distractor from arithmetic slip (nearby value, off by common factor)
- Conceptual questions (~30%): "What happens to $X$ if $Y$ increases?" or "Which graph best represents...". Test whether students understand relationships, not just whether they can plug and chug.
- Application questions (~30%): New scenario not in the material. "An engineer designing ___ needs to determine ___. Which approach is most appropriate?"

WORKED EXAMPLE VARIATIONS:
The material contains these worked examples: {worked_examples}
For each worked example, create at least one question that:
- Uses different numeric values
- Changes one condition (e.g., different angle, added friction, different boundary)
- Tests whether students understand WHY each step was taken, not just the procedure

FORMULA QUESTIONS:
When testing formula knowledge, do NOT just ask "which formula is correct." Instead, set up a scenario and ask what the result is — this tests both formula selection AND execution. Always render formulas in LaTeX:
- Inline: "Compute the force using $F = ma$ where $m = 5 \\text{ kg}$..."
- Display: use $$...$$ on its own line for multi-step solutions

LATEX IN DISTRACTORS:
When distractors are numeric values, format them consistently:
- All options should use the same precision and units
- Example: A. $24.5 \\text{ m/s}$  B. $-24.5 \\text{ m/s}$  C. $49.0 \\text{ m/s}$`;

const STEM_CONCEPT_MODIFIER = `
=== STEM CONCEPTUAL ADDITIONS ===

QUESTION TYPES TO GENERATE:
- Mechanism questions (~35%): "Which best explains the mechanism by which..." Distractors should be real biological/scientific mechanisms applied to the wrong context.
- Sequence/process questions (~20%): "Which correctly orders the steps in..." Distractors should swap commonly confused steps or omit a critical one.
- Prediction questions (~25%): "If [condition changes], what would you expect to observe?" Tests whether students can apply models, not just recall them.
- Compare/contrast questions (~20%): "How does $X$ differ from $Y$?" Distractors should swap the properties of X and Y (common confusion).

MISCONCEPTION-DRIVEN DESIGN:
Known misconceptions for this material: {misconceptions}
Every question should target at least one of these. If a misconception is especially common or dangerous, create multiple questions approaching it from different angles.

SCIENTIFIC NOTATION:
Use LaTeX for all scientific notation, chemical formulas, and biological terms with subscripts/superscripts: $CO_2$, $H_2O$, $6.02 \\times 10^{23}$.`;

const HUMANITIES_MODIFIER = `
=== HUMANITIES ADDITIONS ===

QUESTION TYPES TO GENERATE:
- Interpretation questions (~35%): "According to [author/theory/framework], which of the following best characterizes..." Distractors should represent plausible but incorrect readings of the material.
- Application questions (~30%): Present a NEW scenario or text excerpt and ask students to apply a framework from the material. This tests transfer, not recall.
- Argument evaluation (~20%): "Which of the following would MOST weaken the argument that..." or "Which evidence best supports the claim that..."
- Causation/significance (~15%): "What was the primary cause of..." or "Why is [event/concept] significant in the context of..." Distractors should offer secondary causes or related-but-distinct events.

CRITICAL RULE: Avoid any question answerable by memorizing a single isolated fact. Every question should require understanding context, relationships, or arguments.`;

const SOCIAL_SCIENCE_MODIFIER = `
=== SOCIAL SCIENCE ADDITIONS ===

QUESTION TYPES TO GENERATE:
- Study interpretation (~30%): "A researcher finds $X$. Which conclusion is best supported by these results?" Distractors should include common inferential errors (confusing correlation/causation, overgeneralizing from a specific sample, ignoring confounds).
- Methods questions (~20%): "Which study design would best test the hypothesis that...?" or "What is the main threat to internal validity in this study?"
- Concept application (~30%): Present a real-world scenario and ask which theory/concept best explains it. Distractors should be real theories that don't apply here but superficially seem like they might.
- Data interpretation (~20%): "Based on the table/description, which statement is supported?" For economics: use LaTeX for any equations, supply/demand notation, equilibrium expressions.

SPECIAL DISTRACTOR GUIDANCE:
In social science, the most dangerous misconceptions are statistical reasoning errors. Always include at least 2 questions where one distractor represents a correlation-causation confusion or a base rate neglect error.`;

const APPLIED_MODIFIER = `
=== APPLIED/PROFESSIONAL ADDITIONS ===

QUESTION TYPES TO GENERATE:
- Clinical/scenario vignettes (~40%): Provide a complete scenario in the stem (patient presentation, business case, code snippet, system state). Lead-in is always an action decision: "What is the most appropriate next step?" ALL relevant information goes in the stem. Options are ONLY actions/decisions.
- Prioritization questions (~20%): "Which should be addressed FIRST?" All options are correct actions — the question tests prioritization.
- Contraindication/exception questions (~20%): "In which situation would [standard approach] NOT be appropriate?" Tests boundaries of knowledge.
- Integration questions (~20%): Combine concepts from multiple topics in the material. "Given [condition A] AND [condition B], which approach..."

VIGNETTE RULE (strict):
Every scenario-based question must follow this structure:
1. Stem provides: context, relevant data, constraints, and goals
2. Lead-in asks: "Which is the most appropriate...?" / "What should be done first?"
3. Options are: concise parallel actions, never containing new information

CS-SPECIFIC:
For code-related questions, use fenced code blocks in the stem. Distractors for output-prediction questions should reflect real bugs: off-by-one errors, wrong operator precedence, scope confusion, null/undefined edge cases.`;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildPrompt(analysis: MaterialAnalysis, count: number): string {
  const misconceptions = analysis.topics
    .flatMap(t => t.common_misconceptions || [])
    .join("; ");

  const proceduralErrors = analysis.topics
    .flatMap(t => t.procedural_errors || [])
    .join("; ");

  const workedExamples = (analysis.worked_examples || [])
    .map(e => `- ${e.description} (page ${e.page})`)
    .join("\n");

  const constructMap = (analysis.construct_map || [])
    .map(c => `- ${c}`)
    .join("\n");

  const misconceptionsSummary = [misconceptions, proceduralErrors]
    .filter(Boolean)
    .join("; ");

  // Fill base template placeholders
  const base = BASE_TEMPLATE
    .replace("{course_type}", analysis.course_type)
    .replace("{topics_summary}", analysis.topics.map(t => t.name).join(", "))
    .replace("{key_terms}", analysis.key_terms?.join(", ") || "See material")
    .replace("{construct_map}", constructMap || "Infer from material content")
    .replace("{misconceptions_summary}", misconceptionsSummary || "Infer from material content")
    .replace("{count}", String(count));

  // Select and fill course type modifier
  const modifiers: Record<string, string> = {
    stem_quantitative: STEM_QUANT_MODIFIER
      .replace("{worked_examples}", workedExamples || "None identified"),
    stem_conceptual: STEM_CONCEPT_MODIFIER
      .replace("{misconceptions}", misconceptions || "Infer from material"),
    humanities: HUMANITIES_MODIFIER,
    social_science: SOCIAL_SCIENCE_MODIFIER,
    applied_professional: APPLIED_MODIFIER,
  };

  const modifier = modifiers[analysis.course_type] || modifiers.stem_conceptual;

  return base + "\n" + modifier;
}

// ─── Gemini Function Calling Schema ───────────────────────────────────────────

export const GENERATE_QUESTIONS_SCHEMA = {
  name: "generate_questions",
  description: "Generate high-quality multiple-choice questions from course material",
  parameters: {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          required: ["construct_claim", "cognitive_level", "stem", "options", "explanation", "topic", "source_pages", "difficulty"],
          properties: {
            construct_claim: {
              type: "string",
              description: "What inference about student knowledge this question supports",
            },
            cognitive_level: {
              type: "string",
              enum: ["recall", "application", "analysis"],
            },
            stem: {
              type: "string",
              description: "Complete question with LaTeX formatting for math",
            },
            options: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "text", "is_correct"],
                properties: {
                  id: { type: "string", enum: ["A", "B", "C", "D"] },
                  text: { type: "string" },
                  is_correct: { type: "boolean" },
                  misconception: {
                    type: "string",
                    description: "What error or misconception leads a student to choose this option (required for incorrect options)",
                  },
                },
              },
              minItems: 3,
              maxItems: 4,
            },
            explanation: {
              type: "string",
              description: "Full explanation covering correct answer AND each distractor, with LaTeX",
            },
            topic: { type: "string" },
            source_pages: {
              type: "array",
              items: { type: "integer" },
            },
            difficulty: {
              type: "integer",
              minimum: 1,
              maximum: 3,
            },
          },
        },
      },
    },
  },
};
