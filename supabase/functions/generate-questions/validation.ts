/**
 * validation.ts — Structural validation and quality scoring for generated MCQs
 *
 * validateStructure: gate — reject malformed questions before insertion
 * scoreQuality: score — flag weak questions for admin review (doesn't reject)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedOption {
  id: string;
  text: string;
  is_correct: boolean;
  misconception?: string;
}

export interface GeneratedQuestion {
  construct_claim: string;
  cognitive_level: string;
  stem: string;
  options: GeneratedOption[];
  explanation: string;
  topic: string;
  source_pages: number[];
  difficulty: number;
}

export interface QualityResult {
  score: number;
  flags: string[];
}

// ─── Structural Validation ────────────────────────────────────────────────────

export function validateStructure(q: unknown): q is GeneratedQuestion {
  if (!q || typeof q !== "object") return false;
  const obj = q as Record<string, unknown>;

  const stem = obj.stem;
  if (typeof stem !== "string" || stem.length < 15) return false;

  const options = obj.options;
  if (!Array.isArray(options) || options.length < 3 || options.length > 4) return false;

  // Exactly 1 correct option
  const correctCount = options.filter(
    (o: unknown) => o && typeof o === "object" && (o as Record<string, unknown>).is_correct === true
  ).length;
  if (correctCount !== 1) return false;

  // Each option must have id and text
  for (const opt of options) {
    if (!opt || typeof opt !== "object") return false;
    const o = opt as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.text !== "string") return false;
  }

  const difficulty = obj.difficulty;
  if (typeof difficulty !== "number" || difficulty < 1 || difficulty > 3) return false;

  const explanation = obj.explanation;
  if (typeof explanation !== "string" || explanation.length < 50) return false;

  const topic = obj.topic;
  if (typeof topic !== "string" || topic.length === 0) return false;

  const sourcePages = obj.source_pages;
  if (!Array.isArray(sourcePages) || sourcePages.length === 0) return false;

  const constructClaim = obj.construct_claim;
  if (typeof constructClaim !== "string" || constructClaim.length === 0) return false;

  return true;
}

// ─── Quality Scoring ──────────────────────────────────────────────────────────

export function scoreQuality(q: GeneratedQuestion): QualityResult {
  const flags: string[] = [];
  let score = 100;

  const correctOption = q.options.find(o => o.is_correct);
  const incorrectOptions = q.options.filter(o => !o.is_correct);

  if (!correctOption) return { score: 0, flags: ["no_correct_answer"] };

  // --- Testwiseness cues ---

  // Length cue: correct answer significantly longer than distractors
  const correctLen = correctOption.text.length;
  const avgDistractorLen = incorrectOptions.reduce((s, o) => s + o.text.length, 0) / incorrectOptions.length;
  if (avgDistractorLen > 0 && correctLen > avgDistractorLen * 1.5) {
    flags.push("length_cue: correct answer is much longer than distractors");
    score -= 15;
  }

  // Absolute terms in distractors (giveaway)
  const absoluteTerms = /\b(always|never|all|none|every|only|must)\b/i;
  for (const opt of incorrectOptions) {
    if (absoluteTerms.test(opt.text) && !absoluteTerms.test(correctOption.text)) {
      flags.push(`absolute_term_cue: distractor "${opt.id}" uses absolute language`);
      score -= 10;
    }
  }

  // "All of the above" / "None of the above"
  for (const opt of q.options) {
    if (/\b(all|none) of the above\b/i.test(opt.text)) {
      flags.push('aota_nota: uses "all/none of the above"');
      score -= 20;
    }
  }

  // --- Stem quality ---

  // Negative lead-in
  if (/\b(NOT|EXCEPT|LEAST)\b/.test(q.stem)) {
    flags.push("negative_stem: uses NOT/EXCEPT/LEAST phrasing");
    score -= 10;
  }

  // Vague lead-in
  if (/which (of the following )?(is|are) (true|correct|false)/i.test(q.stem)) {
    flags.push('vague_leadin: "which is true/correct" is unfocused');
    score -= 10;
  }

  // Stem too short (likely missing context)
  if (q.stem.length < 40) {
    flags.push("short_stem: may lack sufficient context");
    score -= 10;
  }

  // --- Distractor quality ---
  for (const opt of incorrectOptions) {
    if (!opt.misconception || opt.misconception.length < 10) {
      flags.push(`weak_distractor: "${opt.id}" has no documented misconception`);
      score -= 15;
    }
  }

  // --- Option homogeneity ---
  const lengths = q.options.map(o => o.text.length);
  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);
  if (minLen > 0 && maxLen > minLen * 3) {
    flags.push("option_length_variance: options vary dramatically in length");
    score -= 10;
  }

  // --- Explanation quality ---
  const mentionsAllOptions = incorrectOptions.every(opt =>
    q.explanation.includes(opt.id) ||
    q.explanation.toLowerCase().includes(opt.text.substring(0, 20).toLowerCase())
  );
  if (!mentionsAllOptions) {
    flags.push("incomplete_explanation: does not address all distractors");
    score -= 15;
  }

  return { score: Math.max(0, score), flags };
}
