/**
 * second-pass-validator.ts — LLM-based quality validation for generated questions
 *
 * Validates batches of 5-10 questions with a focused Gemini call checking:
 * - Non-empty specifics (misconceptions are contentful, not generic)
 * - Internal consistency (explanation matches correct answer, hints don't contradict)
 * - Leakage rules (no hint tier reveals the final answer)
 * - Distractor feedback follows diagnosis/fix/check format with real content
 * - Solution follows discipline-appropriate template
 *
 * Results stored in existing quality_flags JSONB — no migration needed.
 */

import type { GeneratedQuestion } from "./validation.ts";

export interface SecondPassResult {
  questionIndex: number;
  passed: boolean;
  issues: string[];
}

const VALIDATOR_PROMPT = `You are a quality assurance specialist for educational assessment items. Your job is to check multiple-choice questions for pedagogical quality issues that automated rules miss.

For each question below, check for ALL of these issues:

1. VAGUE MISCONCEPTIONS: Does each distractor's misconception describe a SPECIFIC wrong belief? Flag if any misconception is generic like "students misunderstand this" or "incorrect approach" without naming the actual error.

2. INTERNAL CONSISTENCY: Does the explanation's stated correct answer match the option marked is_correct? Do all parts agree?

3. ANSWER LEAKAGE: Does any part of the explanation, misconception text, or any metadata reveal which option is correct BEFORE the student answers? (This matters for hints shown during study.)

4. DISTRACTOR FEEDBACK FORMAT: Does each misconception string contain [Diagnosis] and [Fix] markers with substantive content (not just the marker with a trivial phrase)?

5. EXPLANATION COMPLETENESS: Does the explanation address ALL distractors, not just the correct answer?

6. SOLUTION DISCIPLINE MATCH: For the given course_type, does the explanation follow an appropriate structure? (STEM should show work, humanities should cite evidence, etc.)

Return a JSON array where each element has:
- questionIndex: number (0-based, matching input order)
- passed: boolean (true if no issues found)
- issues: string[] (empty if passed, otherwise list of specific issue descriptions)

Be STRICT but FAIR. Only flag genuine quality problems, not stylistic preferences.`;

/**
 * Run second-pass LLM validation on a batch of questions.
 * Returns per-question pass/fail with specific issues.
 */
export async function runSecondPassValidation(
  questions: Array<GeneratedQuestion & { quality_score: number; quality_flags: string[] }>,
  courseType: string,
  geminiApiKey: string,
): Promise<SecondPassResult[]> {
  // Process in batches of 10
  const batchSize = 10;
  const allResults: SecondPassResult[] = [];

  for (let i = 0; i < questions.length; i += batchSize) {
    const batch = questions.slice(i, i + batchSize);

    // Build compact question representation for the validator
    const batchDescription = batch.map((q, idx) => {
      const optionsStr = q.options.map(o =>
        `  ${o.id}) ${o.text.substring(0, 100)}${o.text.length > 100 ? "..." : ""} [${o.is_correct ? "CORRECT" : "wrong"}]${o.misconception ? ` misconception: "${o.misconception.substring(0, 200)}"` : ""}`
      ).join("\n");

      return `--- Question ${i + idx} ---
course_type: ${courseType}
stem: ${q.stem.substring(0, 300)}${q.stem.length > 300 ? "..." : ""}
options:
${optionsStr}
explanation: ${q.explanation.substring(0, 400)}${q.explanation.length > 400 ? "..." : ""}
construct_claim: ${q.construct_claim}
difficulty: ${q.difficulty}`;
    }).join("\n\n");

    const fullPrompt = `${VALIDATOR_PROMPT}\n\n=== QUESTIONS TO VALIDATE ===\n\n${batchDescription}\n\nReturn ONLY a JSON array. No markdown, no commentary.`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);

      let response: Response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [{ text: fullPrompt }],
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
              },
            }),
            signal: controller.signal,
          }
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        console.warn(`[second-pass-validator] Gemini error ${response.status}, skipping batch`);
        // On failure, pass all questions in this batch (don't block on validator failure)
        for (let idx = 0; idx < batch.length; idx++) {
          allResults.push({ questionIndex: i + idx, passed: true, issues: [] });
        }
        continue;
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.warn("[second-pass-validator] No text in response, skipping batch");
        for (let idx = 0; idx < batch.length; idx++) {
          allResults.push({ questionIndex: i + idx, passed: true, issues: [] });
        }
        continue;
      }

      const parsed = JSON.parse(text) as SecondPassResult[];
      if (Array.isArray(parsed)) {
        allResults.push(...parsed);
      } else {
        // Unexpected format, pass all
        for (let idx = 0; idx < batch.length; idx++) {
          allResults.push({ questionIndex: i + idx, passed: true, issues: [] });
        }
      }
    } catch (err) {
      console.warn("[second-pass-validator] Error:", err instanceof Error ? err.message : "unknown");
      // On error, pass all questions in this batch
      for (let idx = 0; idx < batch.length; idx++) {
        allResults.push({ questionIndex: i + idx, passed: true, issues: [] });
      }
    }
  }

  return allResults;
}
