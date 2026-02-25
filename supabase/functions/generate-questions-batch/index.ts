/**
 * generate-questions-batch — Parallel batch question generation edge function
 *
 * Fixes all 5 gaps in the single-question pipeline:
 *   Gap 1: Full schema (explanation, sourcePages, misconceptions, correctChoiceId)
 *   Gap 2: Uses cached QuestionReadyChunk data instead of raw PDF scan
 *   Gap 3: Auto-computes per-chunk question targets from question_potential + content_density
 *   Gap 4: Progressive retry with temperature tightening (3 attempts per question)
 *   Gap 5: Semantic dedup via Gemini text-embedding-004
 *
 * HTTP: POST { materialId: string }
 * Returns immediately with { success, jobId, totalChunks, totalQuestionsTarget }
 * Background processing tracked in generation_jobs table
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  getExternalServiceRoleKey,
  getExternalAnonKey,
} from "../_shared/external-db.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SimplifiedChoice {
  id: "A" | "B" | "C" | "D";
  text: string;
  isCorrect: boolean;
}

interface EnhancedQuestion {
  stem: string;
  choices: SimplifiedChoice[];
  difficulty: 1 | 2 | 3;
  topic: string;
  explanation: string;
  sourcePages: number[];
  misconceptions: Record<"A" | "B" | "C" | "D", string>;
  correctChoiceId: "A" | "B" | "C" | "D";
}

interface AtomicFact {
  fact_id: string;
  statement: string;
  fact_type: string;
  evidence_span_id: string;
}

interface ChunkFormula {
  name: string;
  expression: string;
  variables: { symbol: string; meaning: string; domain: string | null }[];
  conditions: string[];
  evidence_span_id: string;
}

interface WorkedExample {
  problem_statement: string;
  given: { quantity: string; value: string; unit: string | null }[];
  asked: string;
  steps: { step_number: number; action: string; formula_used: string | null; intermediate_result: string | null }[];
  final_answer: string;
  evidence_span_id: string;
}

interface ChunkMisconception {
  misconception_id: string;
  description: string;
  correct_concept: string;
  evidence_span_id: string;
}

interface EvidenceSpan {
  span_id: string;
  text: string;
}

interface QuestionReadyChunk {
  chunk_index: number;
  chunk_type: "page" | "slide";
  summary: string;
  atomic_facts: AtomicFact[];
  definitions: { term: string; definition: string; evidence_span_id: string }[];
  formulas: ChunkFormula[];
  constraints: { constraint: string; context: string; evidence_span_id: string }[];
  worked_examples: WorkedExample[];
  common_misconceptions: ChunkMisconception[];
  evidence_spans: EvidenceSpan[];
  key_terms: string[];
  content_density: "sparse" | "normal" | "dense";
  question_potential: "low" | "medium" | "high";
}

interface MaterialAnalysisV4 {
  schema_version: 4;
  question_ready_chunks: QuestionReadyChunk[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CONFIG = {
  CONCURRENCY: 4,
  STAGGER_MS: 1500,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  REQUEST_TIMEOUT_MS: 60_000,
  MAX_QUESTIONS_PER_MATERIAL: 50,
  EMBEDDING_SIMILARITY_THRESHOLD: 0.85,
} as const;

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  "https://study-flow-forge-91.lovable.app",
  "https://study-flow-forge-91.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const getCorsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
});

// ─── Utilities ────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function potentialRank(chunk: QuestionReadyChunk): number {
  return chunk.question_potential === "high" ? 3 : chunk.question_potential === "medium" ? 2 : 1;
}

// ─── Gap 3: Auto-count per chunk ──────────────────────────────────────────────

/**
 * Compute how many questions to target for a single chunk based on its potential,
 * example count, and content density.
 */
function computeTargetCount(chunk: QuestionReadyChunk): number {
  const base = chunk.question_potential === "high" ? 6 : chunk.question_potential === "medium" ? 4 : 2;
  const exampleBonus = Math.min(chunk.worked_examples.length, 2);
  const densityMult =
    chunk.content_density === "dense" ? 1.2 : chunk.content_density === "sparse" ? 0.8 : 1.0;
  return Math.min(Math.round((base + exampleBonus) * densityMult), 8);
}

/**
 * Distribute targets across all chunks respecting global cap and existing question count.
 */
function computeAllTargets(
  chunks: QuestionReadyChunk[],
  existingCount: number,
  globalCap: number
): Map<number, number> {
  const rawTargets = new Map<number, number>(
    chunks.map((c) => [c.chunk_index, computeTargetCount(c)])
  );
  const rawTotal = [...rawTargets.values()].reduce((s, v) => s + v, 0);
  const available = Math.max(0, globalCap - existingCount);

  if (rawTotal <= available) {
    return rawTargets;
  }

  // Scale down proportionally
  const scale = available / rawTotal;
  return new Map(
    [...rawTargets.entries()].map(([idx, t]) => [idx, Math.max(0, Math.floor(t * scale))])
  );
}

// ─── Gap 2: Topic block serializer ────────────────────────────────────────────

function buildTopicBlock(chunk: QuestionReadyChunk): string {
  return JSON.stringify(
    {
      chunk_index: chunk.chunk_index,
      summary: chunk.summary,
      key_terms: chunk.key_terms,
      atomic_facts: chunk.atomic_facts.map((f) => ({
        fact_id: f.fact_id,
        statement: f.statement,
        type: f.fact_type,
      })),
      formulas: chunk.formulas.map((f) => ({
        name: f.name,
        expression: f.expression,
        variables: f.variables,
        conditions: f.conditions,
      })),
      worked_examples: chunk.worked_examples.map((e) => ({
        problem: e.problem_statement,
        steps: e.steps,
        answer: e.final_answer,
      })),
      misconceptions: chunk.common_misconceptions.map((m) => ({
        id: m.misconception_id,
        error: m.description,
        correct: m.correct_concept,
      })),
      evidence_spans: chunk.evidence_spans,
    },
    null,
    2
  );
}

// ─── Gap 2 + Gap 1: Enhanced prompt builder ───────────────────────────────────

interface RetryOpts {
  styleConstraint?: string;
  formulaOnly?: string;
}

function buildEnhancedPrompt(
  topicBlock: string,
  existingStems: string[],
  retryOpts: RetryOpts = {}
): string {
  const stemsSection =
    existingStems.length > 0
      ? `RECENT STEMS TO AVOID (do not generate questions with similar meaning):\n${existingStems
          .slice(-10)
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}\n`
      : "";

  const styleBlock = retryOpts.styleConstraint
    ? `\nSTYLE CONSTRAINT: ${retryOpts.styleConstraint}`
    : "";
  const formulaBlock = retryOpts.formulaOnly
    ? `\nFORMULA CONSTRAINT: ${retryOpts.formulaOnly}`
    : "";

  return `You are a university exam writer creating questions for a Probability/Statistics midterm.

SELECTED TOPIC BLOCK — test ONLY content from this block:
${topicBlock}

HARD CONSTRAINTS:
1. Every factual claim in your question must trace to an evidence_span or atomic_fact in the block above.
2. sourcePages must match the chunk page references found in the block.
3. Exactly 4 choices (A, B, C, D), exactly ONE correct answer.
4. Do NOT use "all of the above" or "none of the above".
5. correctChoiceId must match the choice where isCorrect === true.
6. For each wrong choice, set misconceptions[id] to a one-phrase label describing the specific error
   (e.g., 'forgot overlap in inclusion-exclusion', 'swapped P(B|A) with P(A|B)').
   If the misconception matches an ID in the block, use that label.
7. Set misconceptions[correctChoiceId] to 'correct reasoning'.
${styleBlock}${formulaBlock}

${stemsSection}
SILENT SELF-CHECK before calling the tool:
- [ ] Exactly one correct answer
- [ ] Answerable from the topic block only
- [ ] All distractor misconceptions named
- [ ] correctChoiceId set and consistent with isCorrect
- [ ] sourcePages populated

OUTPUT: Call the generate_question function with the full schema including
explanation, sourcePages, correctChoiceId, and misconceptions.`;
}

// ─── Gemini API call ──────────────────────────────────────────────────────────

async function callGeminiGenerate(
  pdfBase64: string,
  prompt: string,
  temperature: number,
  geminiApiKey: string
): Promise<EnhancedQuestion | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
                { text: prompt },
              ],
            },
          ],
          tools: [
            {
              functionDeclarations: [
                {
                  name: "generate_question",
                  description: "Generate a single MCQ with full enriched schema",
                  parameters: {
                    type: "object",
                    required: ["stem", "choices", "difficulty", "topic", "explanation", "correctChoiceId", "misconceptions", "sourcePages"],
                    properties: {
                      stem: { type: "string", description: "The question stem (at least 10 characters)" },
                      choices: {
                        type: "array",
                        minItems: 4,
                        maxItems: 4,
                        description: "Exactly 4 choices with IDs A, B, C, D",
                        items: {
                          type: "object",
                          required: ["id", "text", "isCorrect"],
                          properties: {
                            id: { type: "string", enum: ["A", "B", "C", "D"] },
                            text: { type: "string" },
                            isCorrect: { type: "boolean" },
                          },
                        },
                      },
                      difficulty: { type: "string", enum: ["1", "2", "3"], description: "1=Basic 2=Intermediate 3=Advanced" },
                      topic: { type: "string" },
                      explanation: {
                        type: "string",
                        description: "2-4 sentences: why correct is correct and why the most tempting distractor is wrong.",
                      },
                      sourcePages: {
                        type: "array",
                        items: { type: "integer" },
                        minItems: 1,
                        description: "Page or slide numbers in the PDF where this content appears.",
                      },
                      correctChoiceId: {
                        type: "string",
                        enum: ["A", "B", "C", "D"],
                        description: "Must match the choice with isCorrect: true.",
                      },
                      misconceptions: {
                        type: "object",
                        required: ["A", "B", "C", "D"],
                        properties: {
                          A: { type: "string" },
                          B: { type: "string" },
                          C: { type: "string" },
                          D: { type: "string" },
                        },
                        description: "One-phrase misconception label per choice. 'correct reasoning' for the right answer.",
                      },
                    },
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["generate_question"] },
          },
          generationConfig: { temperature },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      clearTimeout(timeoutId);
      console.error(`Gemini API error: ${response.status}`);
      return null;
    }

    const result = await response.json();
    clearTimeout(timeoutId);
    const functionCall = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;

    if (functionCall?.name !== "generate_question" || !functionCall.args) {
      return null;
    }

    const args = functionCall.args as Record<string, unknown>;

    // Coerce difficulty from string to number (Gemini returns enum as string)
    if (typeof args.difficulty === "string") {
      args.difficulty = parseInt(args.difficulty, 10) as 1 | 2 | 3;
    }

    return args as unknown as EnhancedQuestion;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("Gemini call failed:", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

// ─── Gap 1: Validation ────────────────────────────────────────────────────────

function validateEnhancedQuestion(q: unknown): q is EnhancedQuestion {
  if (!q || typeof q !== "object") return false;
  const question = q as Record<string, unknown>;

  if (typeof question.stem !== "string" || question.stem.length < 10) return false;
  if (!Array.isArray(question.choices) || question.choices.length !== 4) return false;

  const validIds = new Set(["A", "B", "C", "D"]);
  let correctCount = 0;
  for (const c of question.choices) {
    if (!c || typeof c !== "object") return false;
    const choice = c as Record<string, unknown>;
    if (typeof choice.id !== "string" || !validIds.has(choice.id)) return false;
    if (typeof choice.text !== "string" || choice.text.length === 0) return false;
    if (typeof choice.isCorrect !== "boolean") return false;
    if (choice.isCorrect) correctCount++;
  }
  if (correctCount !== 1) return false;

  if (![1, 2, 3].includes(question.difficulty as number)) return false;
  if (typeof question.topic !== "string" || question.topic.length === 0) return false;
  if (typeof question.explanation !== "string" || question.explanation.length === 0) return false;
  if (!Array.isArray(question.sourcePages) || question.sourcePages.length === 0) return false;
  if (
    typeof question.correctChoiceId !== "string" ||
    !validIds.has(question.correctChoiceId as string)
  )
    return false;

  // Verify correctChoiceId matches isCorrect
  const markedCorrect = (question.choices as { id: string; isCorrect: boolean }[]).find(
    (c) => c.isCorrect
  );
  if (!markedCorrect || markedCorrect.id !== question.correctChoiceId) return false;

  if (!question.misconceptions || typeof question.misconceptions !== "object") return false;
  const m = question.misconceptions as Record<string, unknown>;
  for (const id of ["A", "B", "C", "D"]) {
    if (typeof m[id] !== "string") return false;
  }

  return true;
}

// ─── Gap 4: Per-chunk generation with progressive retry ────────────────────────

async function generateQuestionsForChunk(
  chunk: QuestionReadyChunk,
  target: number,
  pdfBase64: string,
  geminiApiKey: string,
  existingStems: string[]
): Promise<EnhancedQuestion[]> {
  const topicBlock = buildTopicBlock(chunk);
  const generated: EnhancedQuestion[] = [];
  const localStems = [...existingStems];

  for (let i = 0; i < target; i++) {
    let question: EnhancedQuestion | null = null;

    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      const temp = attempt === 1 ? 0.5 : attempt === 2 ? 0.3 : 0.2;
      const styleConstraint =
        attempt >= 2
          ? "MUST be computation or rule-application style. Do NOT ask for a definition."
          : undefined;
      const formulaOnly =
        attempt === 3
          ? "MUST use a specific formula from the topic block with concrete numeric values."
          : undefined;

      const prompt = buildEnhancedPrompt(topicBlock, localStems, { styleConstraint, formulaOnly });
      const raw = await callGeminiGenerate(pdfBase64, prompt, temp, geminiApiKey);

      if (raw && validateEnhancedQuestion(raw)) {
        question = raw;
        break;
      }

      console.warn(
        `Chunk ${chunk.chunk_index} question ${i + 1}: attempt ${attempt} failed, retrying...`
      );
      await sleep(CONFIG.RETRY_DELAY_MS * attempt);
    }

    if (question) {
      generated.push(question);
      localStems.push(question.stem);
    } else {
      console.warn(`Chunk ${chunk.chunk_index}: question ${i + 1} skipped after ${CONFIG.MAX_RETRIES} attempts`);
    }
  }

  return generated;
}

// ─── Gap 5: Semantic dedup via Gemini embeddings ──────────────────────────────

async function fetchEmbeddings(texts: string[], geminiApiKey: string): Promise<number[][]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
        })),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const result = await response.json();
  return (result.embeddings as { values: number[] }[]).map((e) => e.values);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function filterBySimilarity(
  questions: EnhancedQuestion[],
  embeddings: number[][],
  threshold: number
): EnhancedQuestion[] {
  const kept: number[] = [];

  for (let i = 0; i < questions.length; i++) {
    let isDuplicate = false;
    for (const j of kept) {
      if (cosineSimilarity(embeddings[i], embeddings[j]) >= threshold) {
        // Drop the one with fewer populated fields
        const scoreI = (questions[i].explanation ? 1 : 0) + (questions[i].sourcePages.length > 0 ? 1 : 0);
        const scoreJ = (questions[j].explanation ? 1 : 0) + (questions[j].sourcePages.length > 0 ? 1 : 0);
        if (scoreI <= scoreJ) {
          isDuplicate = true;
          break;
        } else {
          // Replace j with i
          kept.splice(kept.indexOf(j), 1, i);
          isDuplicate = true;
          break;
        }
      }
    }
    if (!isDuplicate) {
      kept.push(i);
    }
  }

  return kept.map((i) => questions[i]);
}

function deduplicateByNormalizedStem(questions: EnhancedQuestion[]): EnhancedQuestion[] {
  const seen = new Set<string>();
  return questions.filter((q) => {
    const normalized = q.stem.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

async function deduplicateByEmbedding(
  questions: EnhancedQuestion[],
  geminiApiKey: string
): Promise<EnhancedQuestion[]> {
  if (questions.length <= 1) return questions;

  try {
    const embeddings = await fetchEmbeddings(
      questions.map((q) => q.stem),
      geminiApiKey
    );
    return filterBySimilarity(questions, embeddings, CONFIG.EMBEDDING_SIMILARITY_THRESHOLD);
  } catch (err) {
    console.warn("Embedding dedup failed, falling back to string dedup:", err instanceof Error ? err.message : "unknown");
    return deduplicateByNormalizedStem(questions);
  }
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

async function saveQuestions(
  supabase: SupabaseClient,
  materialId: string,
  questions: EnhancedQuestion[]
): Promise<void> {
  for (const q of questions) {
    const { error } = await supabase.from("questions").insert({
      prompt: q.stem,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text, isCorrect: c.isCorrect })),
      correct_answer: q.correctChoiceId,
      full_solution: q.explanation,
      source_evidence: {
        page_refs: q.sourcePages ?? [],
        evidence_span_ids: [],
        fact_ids: [],
      },
      common_mistakes: q.misconceptions,
      difficulty: q.difficulty,
      source: "generated",
      source_material_id: materialId,
      status: "draft",
      is_published: false,
      needs_review: true,
    } as Record<string, unknown>);

    if (error) {
      console.error("Failed to save question:", error.message);
    }
  }
}

// ─── Background orchestration ─────────────────────────────────────────────────

async function generateInBackground(
  supabase: SupabaseClient,
  jobId: string,
  materialId: string,
  pdfBase64: string,
  analysisV4: MaterialAnalysisV4,
  geminiApiKey: string
): Promise<void> {
  // Mark job as running
  await supabase
    .from("generation_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  // Sort chunks: high potential first, then medium, then low
  const sorted = [...analysisV4.question_ready_chunks].sort(
    (a, b) => potentialRank(b) - potentialRank(a)
  );

  // Get existing question count for this material
  const { count: existingCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("source_material_id", materialId);

  const chunkTargets = computeAllTargets(
    sorted,
    existingCount ?? 0,
    CONFIG.MAX_QUESTIONS_PER_MATERIAL
  );

  // Initialize topic_coverage tracking
  const topicCoverage: Record<number, { target: number; generated: number }> = {};
  for (const chunk of sorted) {
    topicCoverage[chunk.chunk_index] = {
      target: chunkTargets.get(chunk.chunk_index) ?? 0,
      generated: 0,
    };
  }

  const inFlight = new Set<Promise<void>>();
  const allGenerated: EnhancedQuestion[] = [];
  const globalStems: string[] = [];
  let completedChunks = 0;
  let failedChunks = 0;

  for (let i = 0; i < sorted.length; i++) {
    const chunk = sorted[i];
    const target = chunkTargets.get(chunk.chunk_index) ?? 0;
    if (target === 0) {
      completedChunks++;
      continue;
    }

    // Wait if at concurrency limit
    while (inFlight.size >= CONFIG.CONCURRENCY) {
      await Promise.race(inFlight);
    }

    // Update current chunk in job row
    await supabase
      .from("generation_jobs")
      .update({ current_chunk_summary: chunk.summary.slice(0, 200) })
      .eq("id", jobId);

    const task: Promise<void> = (async () => {
      try {
        const questions = await generateQuestionsForChunk(
          chunk,
          target,
          pdfBase64,
          geminiApiKey,
          [...globalStems]
        );

        allGenerated.push(...questions);
        globalStems.push(...questions.map((q) => q.stem));
        topicCoverage[chunk.chunk_index].generated = questions.length;
        completedChunks++;

        await supabase
          .from("generation_jobs")
          .update({
            completed_chunks: completedChunks,
            topic_coverage: topicCoverage,
          })
          .eq("id", jobId);
      } catch (err) {
        failedChunks++;
        console.error(`Chunk ${chunk.chunk_index} generation failed:`, err instanceof Error ? err.message : "unknown");

        await supabase
          .from("generation_jobs")
          .update({ failed_chunks: failedChunks })
          .eq("id", jobId);
      }
    })();

    inFlight.add(task);
    task.finally(() => inFlight.delete(task));

    if (i < sorted.length - 1) {
      await sleep(CONFIG.STAGGER_MS);
    }
  }

  // Wait for all remaining in-flight tasks
  await Promise.all(inFlight);

  // Gap 5: Semantic dedup
  const deduplicated = await deduplicateByEmbedding(allGenerated, geminiApiKey);
  console.log(
    `Generation complete: ${allGenerated.length} generated, ${allGenerated.length - deduplicated.length} duplicates removed`
  );

  // Persist questions
  await saveQuestions(supabase, materialId, deduplicated);

  // Finalize job
  const finalStatus = failedChunks === sorted.length && sorted.length > 0 ? "failed" : "completed";
  await supabase
    .from("generation_jobs")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      total_questions_generated: deduplicated.length,
      topic_coverage: topicCoverage,
      error_message:
        failedChunks > 0 ? `${failedChunks} chunk(s) failed to generate questions` : null,
    })
    .eq("id", jobId);

  // Update material status
  await supabase
    .from("course_materials")
    .update({
      questions_generated_count: deduplicated.length,
      status: "ready",
    })
    .eq("id", materialId);
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = EXTERNAL_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = getExternalServiceRoleKey();
    const SUPABASE_ANON_KEY = getExternalAnonKey();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "GEMINI_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin check (using service role client for backend ops)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse input
    const body = await req.json();
    const { materialId } = body as { materialId?: string };

    if (!materialId) {
      return new Response(
        JSON.stringify({ success: false, error: "materialId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load material + analysis_json_v4
    const { data: material, error: materialError } = await supabase
      .from("course_materials")
      .select("storage_path, title, analysis_json_v4")
      .eq("id", materialId)
      .single();

    if (materialError || !material) {
      return new Response(
        JSON.stringify({ success: false, error: `Material not found: ${materialError?.message ?? "unknown"}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const analysisV4 = material.analysis_json_v4 as MaterialAnalysisV4 | null;

    if (
      !analysisV4 ||
      analysisV4.schema_version !== 4 ||
      !Array.isArray(analysisV4.question_ready_chunks) ||
      analysisV4.question_ready_chunks.length === 0
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Material has no analysis_json_v4 with question_ready_chunks. Run the V4 analysis pipeline first.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!material.storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: "Material has no storage path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download PDF
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("course-materials")
      .download(material.storage_path);

    if (downloadError || !pdfData) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to download PDF: ${downloadError?.message ?? "unknown"}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await pdfData.arrayBuffer();
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ success: false, error: "PDF too large (>15MB). Please upload a smaller file." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert PDF to base64
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const pdfBase64 = btoa(binary);

    // Compute totals for response
    const chunks = analysisV4.question_ready_chunks;
    const { count: existingCount } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("source_material_id", materialId);

    const chunkTargets = computeAllTargets(
      chunks,
      existingCount ?? 0,
      CONFIG.MAX_QUESTIONS_PER_MATERIAL
    );
    const totalQuestionsTarget = [...chunkTargets.values()].reduce((s, v) => s + v, 0);

    // Create generation job row
    const { data: job, error: jobError } = await supabase
      .from("generation_jobs")
      .insert({
        material_id: materialId,
        status: "pending",
        total_chunks: chunks.length,
        completed_chunks: 0,
        failed_chunks: 0,
        total_questions_target: totalQuestionsTarget,
        total_questions_generated: 0,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create generation job: ${jobError?.message ?? "unknown"}`);
    }

    const jobId = (job as { id: string }).id;

    // Fire and forget — EdgeRuntime.waitUntil keeps function alive
    // @ts-ignore EdgeRuntime available in Deno Deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        generateInBackground(supabase, jobId, materialId, pdfBase64, analysisV4, GEMINI_API_KEY)
      );
    } else {
      // Fallback for local dev
      generateInBackground(supabase, jobId, materialId, pdfBase64, analysisV4, GEMINI_API_KEY);
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        totalChunks: chunks.length,
        totalQuestionsTarget,
        message: "Batch generation started. Track progress via the generation_jobs table.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-questions-batch error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
