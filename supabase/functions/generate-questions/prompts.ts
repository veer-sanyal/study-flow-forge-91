/**
 * prompts.ts — Research-backed, course-aware MCQ generation prompts
 *
 * Base template + 5 course-type modifiers + Gemini function calling schema.
 * V3: DOK 1-5 difficulty, structured distractor feedback, discipline-specific
 *     solution templates, analysis context injection.
 */

// ─── Analysis types (matches analyze-material output v2 + v3) ───────────────

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

// V3 structured construct claim (ECD format)
interface ConstructClaim {
  claim: string;
  conditions: string;
  evidence: string;
}

// V3 test specification
interface TestSpec {
  objective_weights: Array<{ topic: string; weight: number }>;
  target_dok_distribution: {
    dok_1: number;
    dok_2: number;
    dok_3: number;
    dok_4: number;
    dok_5: number;
  };
  misconception_distractor_map?: Array<{
    misconception: string;
    topic: string;
    suggested_distractor_strategy: string;
  }>;
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
  // v2: string[], v3: ConstructClaim[]
  construct_map: string[] | ConstructClaim[];
  // v3 only
  test_spec?: TestSpec;
}

// ─── Helper: format construct map for prompt ────────────────────────────────

function formatConstructMap(constructMap: string[] | ConstructClaim[] | undefined): string {
  if (!constructMap || constructMap.length === 0) return "Infer from material content";

  // v3 structured format
  if (typeof constructMap[0] === "object" && "claim" in constructMap[0]) {
    return (constructMap as ConstructClaim[])
      .map(c => `- Claim: ${c.claim}\n  Conditions: ${c.conditions}\n  Evidence: ${c.evidence}`)
      .join("\n");
  }

  // v2 string format
  return (constructMap as string[]).map(c => `- ${c}`).join("\n");
}

// ─── Helper: format DOK distribution for prompt ─────────────────────────────

function formatDokDistribution(testSpec: TestSpec | undefined): string {
  if (testSpec?.target_dok_distribution) {
    const d = testSpec.target_dok_distribution;
    return `Target DOK distribution from analysis:
- DOK 1 (Recall): ${Math.round(d.dok_1 * 100)}%
- DOK 2 (Routine application): ${Math.round(d.dok_2 * 100)}%
- DOK 3 (Multi-step reasoning): ${Math.round(d.dok_3 * 100)}%
- DOK 4 (Strategic reasoning): ${Math.round(d.dok_4 * 100)}%
- DOK 5 (Extended reasoning): ${Math.round(d.dok_5 * 100)}%
Follow this distribution as closely as possible.`;
  }
  // Fallback for v2 analysis
  return `Default DOK distribution (no test_spec available):
- DOK 1 (Recall): ~20%
- DOK 2 (Routine application): ~35%
- DOK 3 (Multi-step reasoning): ~25%
- DOK 4 (Strategic reasoning): ~15%
- DOK 5 (Extended reasoning): ~5%`;
}

// ─── Helper: build evidence context chunks per topic ────────────────────────

function buildEvidenceContext(analysis: MaterialAnalysis): string {
  const chunks: string[] = [];

  for (const topic of analysis.topics) {
    const parts: string[] = [`Topic: ${topic.name}`];

    // Key terms relevant to this topic (include all — they're lightweight)
    const topicTerms = (analysis.key_terms || []).slice(0, 15);
    if (topicTerms.length > 0) {
      parts.push(`Key terms: ${topicTerms.join(", ")}`);
    }

    // Misconceptions for this topic
    if (topic.common_misconceptions?.length > 0) {
      parts.push(`Known misconceptions:\n${topic.common_misconceptions.map(m => `  - ${m}`).join("\n")}`);
    }

    // Procedural errors
    if (topic.procedural_errors?.length > 0) {
      parts.push(`Procedural errors:\n${topic.procedural_errors.map(e => `  - ${e}`).join("\n")}`);
    }

    // Relevant worked examples
    const relevantExamples = (analysis.worked_examples || [])
      .filter(ex => {
        const desc = ex.description.toLowerCase();
        return topic.name.toLowerCase().split(/\s+/).some(word =>
          word.length > 3 && desc.includes(word)
        );
      })
      .slice(0, 3);
    if (relevantExamples.length > 0) {
      parts.push(`Worked examples:\n${relevantExamples.map(ex => `  - ${ex.description} (p.${ex.page})`).join("\n")}`);
    }

    // Misconception-distractor mappings from test_spec (v3)
    if (analysis.test_spec?.misconception_distractor_map) {
      const relevant = analysis.test_spec.misconception_distractor_map
        .filter(m => m.topic.toLowerCase() === topic.name.toLowerCase())
        .slice(0, 5);
      if (relevant.length > 0) {
        parts.push(`Distractor strategies:\n${relevant.map(m => `  - "${m.misconception}" → ${m.suggested_distractor_strategy}`).join("\n")}`);
      }
    }

    chunks.push(parts.join("\n"));
  }

  return chunks.join("\n\n");
}

// ─── Helper: build exam exemplar context ─────────────────────────────────────

export interface ExamExemplar {
  prompt: string;
  choices: Array<{ text: string; id: string; isCorrect: boolean }>;
  correct_answer: string;
  difficulty: number;
  topic: string;  // resolved topic name
}

export function buildExemplarContext(exemplars: ExamExemplar[]): string {
  if (exemplars.length === 0) return "";

  // Group by topic
  const byTopic = new Map<string, ExamExemplar[]>();
  for (const ex of exemplars) {
    const list = byTopic.get(ex.topic) || [];
    list.push(ex);
    byTopic.set(ex.topic, list);
  }

  const sections: string[] = [];
  for (const [topic, exs] of byTopic) {
    const qStrs = exs.map(ex => {
      const optStr = ex.choices.map(c => `${c.id}) ${c.text}`).join("  ");
      return `[Exam Q — Difficulty ${ex.difficulty}]\nStem: ${ex.prompt}\nOptions: ${optStr}\nCorrect: ${ex.correct_answer}`;
    });
    sections.push(`Topic: ${topic}\n${qStrs.join("\n\n")}`);
  }

  return `\n=== REAL EXAM QUESTIONS FROM THIS COURSE (match this style) ===
These are actual exam questions written by this course's professor.
Use them as STYLE, DIFFICULTY, and FORMAT references.
Generate NEW questions that match this style but cover DIFFERENT
specific scenarios and values. Do NOT copy or paraphrase these stems.

${sections.join("\n\n")}`;
}

// ─── Base Template ────────────────────────────────────────────────────────────

const BASE_TEMPLATE = `You are an expert item writer creating high-quality multiple-choice questions for a university course. You follow evidence-based item construction principles.

=== EVIDENCE CONTEXT (from material analysis) ===
{evidence_context}

=== MATERIAL CONTEXT ===
Course type: {course_type}
Topics: {topics_summary}
Key terms: {key_terms}
Construct claims (what mastery looks like):
{construct_map}
{exam_exemplars}

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
- Every question must be FULLY SELF-CONTAINED. Never reference "the previous question," "the scenario above," "continuing from...," or any other question in the batch. Each question may be displayed independently, in any order, or weeks apart in spaced repetition. If two questions share a scenario, REPEAT the full scenario in each stem with all values and definitions restated.
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
- For each wrong option, write feedback in this format:
  [Diagnosis] You likely thought... [Fix] To correct this, notice that... [Check] Ask yourself:...
  This is the REQUIRED format for the misconception field on each incorrect option.
- Types of good distractors:
  * Misconception-based: reflects a known wrong mental model
  * Procedural error: right approach but common execution mistake (sign error, unit error, forgot a step)
  * Partial knowledge: correct for a related but different concept
  * Superficial match: uses key terms from the material but in wrong context
- NEVER use joke answers, obviously wrong options, or implausible distractors. Every option should look reasonable to a student who studied but has gaps.
- NEVER use a distractor that simply restates a number from the problem (e.g., if the problem says "4 books," do not use "4" as a distractor for a permutations question). Every distractor must represent a plausible computational error or conceptual mistake.

DOK-ANCHORED DIFFICULTY LEVELS 1-5 (use cognitive demand, not trick wording):
- Level 1 — RECALL/IDENTIFY: Single cue, no reasoning chain. Recognizing facts, definitions, or relationships directly stated.
- Level 2 — ROUTINE APPLICATION: One principle, straightforward evidence. Using a concept or formula in a new scenario.
- Level 3 — MULTI-STEP REASONING: Integrate 2+ ideas. Requires chaining concepts or evaluating competing explanations.
- Level 4 — STRATEGIC REASONING: Select approach, justify, handle alternatives. Analyzing which method applies and why.
- Level 5 — EXTENDED REASONING: Novel context, multiple sources, justify limitations. Synthesizing across topics with original analysis.

{dok_distribution}

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
□ No duplicate or near-duplicate questions — each question must test a meaningfully different concept, scenario, or skill even if drawn from the same topic

=== COMMON GENERATION MISTAKES (avoid these) ===

BAD stem: "Which of the following is true about probability?"
WHY BAD: Vague lead-in — doesn't specify what cognitive task the student performs.
GOOD stem: "A standard die is rolled twice. Which expression correctly represents the probability that both rolls show an even number?"

BAD options:
  A) The answer is always 0.5 (absolute term)
  B) It depends on the situation (vague filler)
  C) $\\frac{1}{4}$ (specific, computable)
WHY BAD: Options A and B are implausible filler. Only C is a real answer.
GOOD options: All options should be specific computable values that result from different (wrong) approaches to the problem.

BAD: Two questions in a batch sharing the same scenario with "continuing from the previous question..."
WHY BAD: Questions get shuffled in spaced repetition. Each must stand alone.

MISCONCEPTION SPECIFICITY (critical):
Each distractor's misconception must name the SPECIFIC wrong belief, not a generic label. The misconception should complete: "A student who chose this believes ___ because ___."

BAD misconception: "Student doesn't understand the concept"
BAD misconception: "Common error in probability"
GOOD misconception: "Student multiplied probabilities for dependent events without adjusting for the reduced sample space after the first draw"

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
- Example: A. $24.5 \\text{ m/s}$  B. $-24.5 \\text{ m/s}$  C. $49.0 \\text{ m/s}$

SOLUTION FORMAT — Plan → Work → Check:
Write full_solution using this structure:
**Plan**: State the approach in 1 sentence.
**Work**: Step-by-step symbolic work with interpretations.
  Each step: 1 English sentence → $$math$$ → 1 interpretation sentence.
**Check**: Verify reasonableness (sign, units, magnitude).`;

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
Use LaTeX for all scientific notation, chemical formulas, and biological terms with subscripts/superscripts: $CO_2$, $H_2O$, $6.02 \\times 10^{23}$.

SOLUTION FORMAT — Claim → Evidence → Reasoning (CER):
Write full_solution using this structure:
**Claim**: State the correct answer and what it demonstrates.
**Evidence**: Cite the specific biological/scientific principle from the material.
**Reasoning**: Explain the causal chain connecting evidence to claim, addressing why each distractor fails.`;

const HUMANITIES_MODIFIER = `
=== HUMANITIES ADDITIONS ===

QUESTION TYPES TO GENERATE:
- Interpretation questions (~35%): "According to [author/theory/framework], which of the following best characterizes..." Distractors should represent plausible but incorrect readings of the material.
- Application questions (~30%): Present a NEW scenario or text excerpt and ask students to apply a framework from the material. This tests transfer, not recall.
- Argument evaluation (~20%): "Which of the following would MOST weaken the argument that..." or "Which evidence best supports the claim that..."
- Causation/significance (~15%): "What was the primary cause of..." or "Why is [event/concept] significant in the context of..." Distractors should offer secondary causes or related-but-distinct events.

CRITICAL RULE: Avoid any question answerable by memorizing a single isolated fact. Every question should require understanding context, relationships, or arguments.

SOLUTION FORMAT — Claim → Evidence → Warrant → Counter:
Write full_solution using this structure:
**Identify claim**: State the interpretive claim being tested.
**Locate evidence**: Quote or cite the specific textual/historical evidence.
**Explain warrant**: Connect the evidence to the claim with explicit reasoning.
**Address counter-reading**: Explain why the most tempting distractor represents a misreading.`;

const SOCIAL_SCIENCE_MODIFIER = `
=== SOCIAL SCIENCE ADDITIONS ===

QUESTION TYPES TO GENERATE:
- Study interpretation (~30%): "A researcher finds $X$. Which conclusion is best supported by these results?" Distractors should include common inferential errors (confusing correlation/causation, overgeneralizing from a specific sample, ignoring confounds).
- Methods questions (~20%): "Which study design would best test the hypothesis that...?" or "What is the main threat to internal validity in this study?"
- Concept application (~30%): Present a real-world scenario and ask which theory/concept best explains it. Distractors should be real theories that don't apply here but superficially seem like they might.
- Data interpretation (~20%): "Based on the table/description, which statement is supported?" For economics: use LaTeX for any equations, supply/demand notation, equilibrium expressions.

SPECIAL DISTRACTOR GUIDANCE:
In social science, the most dangerous misconceptions are statistical reasoning errors. Always include at least 2 questions where one distractor represents a correlation-causation confusion or a base rate neglect error.

SOLUTION FORMAT — Design → Variables → Threats → Limitations:
Write full_solution using this structure:
**Identify design**: Name the study design or theoretical framework.
**Variables**: Identify key IV, DV, and confounds.
**Inference threats**: Explain what validity threats the distractors represent.
**Conclusion limitations**: State the boundaries of what can be concluded.`;

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
For code-related questions, use fenced code blocks in the stem. Distractors for output-prediction questions should reflect real bugs: off-by-one errors, wrong operator precedence, scope confusion, null/undefined edge cases.

SOLUTION FORMAT — Prioritize → Assess → Intervene → Evaluate:
Write full_solution using this structure:
**Prioritize**: Identify the most critical concern and why.
**Assess**: Analyze the relevant data points from the scenario.
**Intervene**: Explain why the correct action is appropriate.
**Evaluate**: Describe how to verify the intervention worked, and why alternatives are suboptimal.`;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildPrompt(analysis: MaterialAnalysis, count: number, examExemplars?: ExamExemplar[]): string {
  const misconceptions = analysis.topics
    .flatMap(t => t.common_misconceptions || [])
    .join("; ");

  const proceduralErrors = analysis.topics
    .flatMap(t => t.procedural_errors || [])
    .join("; ");

  const workedExamples = (analysis.worked_examples || [])
    .map(e => `- ${e.description} (page ${e.page})`)
    .join("\n");

  const constructMapStr = formatConstructMap(analysis.construct_map);

  const misconceptionsSummary = [misconceptions, proceduralErrors]
    .filter(Boolean)
    .join("; ");

  // Build evidence context chunks (Phase 2D: inject analysis context)
  const evidenceContext = buildEvidenceContext(analysis);

  // DOK distribution from test_spec or fallback
  const dokDistribution = formatDokDistribution(analysis.test_spec);

  // Fill base template placeholders
  const base = BASE_TEMPLATE
    .replace("{evidence_context}", evidenceContext)
    .replace("{course_type}", analysis.course_type)
    .replace("{topics_summary}", analysis.topics.map(t => t.name).join(", "))
    .replace("{key_terms}", analysis.key_terms?.join(", ") || "See material")
    .replace("{construct_map}", constructMapStr)
    .replace("{exam_exemplars}", buildExemplarContext(examExemplars || []))
    .replace("{dok_distribution}", dokDistribution)
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
                    description: "For wrong options, write feedback in this format: [Diagnosis] You likely thought... [Fix] To correct this, notice that... [Check] Ask yourself:...",
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
              maximum: 5,
            },
          },
        },
      },
    },
  },
};
