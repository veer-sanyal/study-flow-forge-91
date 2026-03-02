/**
 * generate-questions-batch — Client-driven chunk processing
 *
 * Three modes dispatched by request body shape:
 *   1. Init:     { materialId }               → upload PDF, create job, return chunk list
 *   2. Chunk:    { jobId, fileUri, chunkIndex } → generate one chunk, save immediately
 *   3. Finalize: { jobId, finalize: true }    → dedup saved questions, mark job complete
 *
 * No EdgeRuntime.waitUntil — client drives the loop with concurrency=2.
 * Each invocation runs ≤15s. Questions are saved after every chunk call.
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
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 5000,
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

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function potentialRank(chunk: QuestionReadyChunk): number {
  return chunk.question_potential === "high" ? 3 : chunk.question_potential === "medium" ? 2 : 1;
}

// ─── Gap 3: Auto-count per chunk ──────────────────────────────────────────────

function computeTargetCount(chunk: QuestionReadyChunk): number {
  const base = chunk.question_potential === "high" ? 6 : chunk.question_potential === "medium" ? 4 : 2;
  const exampleBonus = Math.min(chunk.worked_examples.length, 2);
  const densityMult =
    chunk.content_density === "dense" ? 1.2 : chunk.content_density === "sparse" ? 0.8 : 1.0;
  return Math.min(Math.round((base + exampleBonus) * densityMult), 8);
}

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

  if (rawTotal <= available) return rawTargets;

  const scale = available / rawTotal;
  return new Map(
    [...rawTargets.entries()].map(([idx, t]) => [idx, Math.max(0, Math.floor(t * scale))])
  );
}

// ─── Topic block serializer ───────────────────────────────────────────────────

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

// ─── Batch prompt builder ─────────────────────────────────────────────────────

function buildBatchPrompt(topicBlock: string, existingStems: string[], count: number): string {
  const stemsSection =
    existingStems.length > 0
      ? `STEMS TO AVOID (do not generate questions with similar meaning to these):\n${existingStems
          .slice(-20)
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}\n\n`
      : "";

  return `You are a university exam writer creating questions for a Probability/Statistics course.

SELECTED TOPIC BLOCK — test ONLY content from this block:
${topicBlock}

${stemsSection}Generate exactly ${count} DISTINCT multiple-choice questions from the topic block above.

HARD CONSTRAINTS for EACH question:
1. Every factual claim must trace to an evidence_span or atomic_fact in the block.
2. sourcePages must match chunk page references from the block.
3. Exactly 4 choices (A, B, C, D), exactly ONE correct answer.
4. Do NOT use "all of the above" or "none of the above".
5. correctChoiceId must match the choice where isCorrect === true.
6. misconceptions[id]: one-phrase label per wrong choice describing the specific error.
   Set misconceptions[correctChoiceId] to 'correct reasoning'.
7. Questions must cover DIFFERENT aspects — no near-duplicate stems.
8. Mix difficulty levels: some 1 (recall), some 2 (application), some 3 (analysis).

Call generate_questions with ALL ${count} questions in the questions array.`;
}

// ─── Gemini Files API upload ──────────────────────────────────────────────────

async function uploadPdfToGemini(pdfBytes: Uint8Array, geminiApiKey: string): Promise<string> {
  const boundary = `boundary${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const part1 = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `{"file":{"display_name":"lecture.pdf"}}\r\n` +
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const part2 = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(part1.byteLength + pdfBytes.byteLength + part2.byteLength);
  body.set(part1, 0);
  body.set(pdfBytes, part1.byteLength);
  body.set(part2, part1.byteLength + pdfBytes.byteLength);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini file upload failed: ${response.status} ${errText}`);
  }

  const result = await response.json();
  const uri = result?.file?.uri as string | undefined;
  if (!uri) throw new Error("Gemini file upload: no URI in response");
  return uri;
}

// ─── Gemini batch API call ────────────────────────────────────────────────────

const QUESTION_SCHEMA = {
  type: "object",
  required: ["stem", "choices", "difficulty", "topic", "explanation", "correctChoiceId", "misconceptions", "sourcePages"],
  properties: {
    stem: { type: "string" },
    choices: {
      type: "array",
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
    difficulty: { type: "string", enum: ["1", "2", "3"] },
    topic: { type: "string" },
    explanation: { type: "string" },
    sourcePages: { type: "array", items: { type: "integer" } },
    correctChoiceId: { type: "string", enum: ["A", "B", "C", "D"] },
    misconceptions: {
      type: "object",
      required: ["A", "B", "C", "D"],
      properties: { A: { type: "string" }, B: { type: "string" }, C: { type: "string" }, D: { type: "string" } },
    },
  },
};

async function callGeminiGenerateBatch(
  fileUri: string,
  prompt: string,
  count: number,
  temperature: number,
  geminiApiKey: string
): Promise<EnhancedQuestion[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { fileData: { mimeType: "application/pdf", fileUri } },
            { text: prompt },
          ]}],
          tools: [{
            functionDeclarations: [{
              name: "generate_questions",
              description: `Generate exactly ${count} distinct MCQ questions`,
              parameters: {
                type: "object",
                required: ["questions"],
                properties: {
                  questions: { type: "array", items: QUESTION_SCHEMA },
                },
              },
            }],
          }],
          toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["generate_questions"] } },
          generationConfig: { temperature },
        }),
        signal: controller.signal,
      }
    );

    if (response.status === 429) {
      clearTimeout(timeoutId);
      throw new Error("RATE_LIMITED");
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errText = await response.text().catch(() => "");
      throw new Error(`Gemini API error: ${response.status}${errText ? ` — ${errText.slice(0, 200)}` : ""}`);
    }

    const result = await response.json();
    clearTimeout(timeoutId);

    const functionCall = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (functionCall?.name !== "generate_questions" || !Array.isArray(functionCall.args?.questions)) {
      return [];
    }

    return (functionCall.args.questions as unknown[])
      .map((q) => {
        if (q && typeof q === "object") {
          const qq = q as Record<string, unknown>;
          if (typeof qq.difficulty === "string") qq.difficulty = parseInt(qq.difficulty, 10) as 1 | 2 | 3;
        }
        return q;
      })
      .filter((q) => validateEnhancedQuestion(q)) as EnhancedQuestion[];
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.message === "RATE_LIMITED") throw err;
    console.error("Gemini batch call failed:", err instanceof Error ? err.message : "unknown");
    return [];
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

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

// ─── Per-chunk generation with retry ─────────────────────────────────────────

async function generateQuestionsForChunk(
  chunk: QuestionReadyChunk,
  target: number,
  fileUri: string,
  geminiApiKey: string,
  existingStems: string[]
): Promise<EnhancedQuestion[]> {
  const topicBlock = buildTopicBlock(chunk);
  const prompt = buildBatchPrompt(topicBlock, existingStems, target);

  let questions: EnhancedQuestion[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const temp = attempt === 1 ? 0.5 : 0.3;
      questions = await callGeminiGenerateBatch(fileUri, prompt, target, temp, geminiApiKey);
      if (questions.length > 0) break;
    } catch (err) {
      if (err instanceof Error && err.message === "RATE_LIMITED") {
        console.warn(`Chunk ${chunk.chunk_index}: rate limited, waiting 30s...`);
        await sleep(30_000);
      } else {
        // Non-rate-limit errors (e.g. invalid model, API auth) surface immediately
        throw err;
      }
    }
    if (attempt < 2) await sleep(CONFIG.RETRY_DELAY_MS);
  }

  console.log(`Chunk ${chunk.chunk_index}: generated ${questions.length}/${target} questions`);
  return questions;
}

// ─── Embeddings + dedup ───────────────────────────────────────────────────────

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

  if (!response.ok) throw new Error(`Embedding API error: ${response.status}`);
  const result = await response.json();
  return (result.embeddings as { values: number[] }[]).map((e) => e.values);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Returns the set of indices to keep (first-seen wins for duplicates).
 */
function filterKeptIndices(embeddings: number[][], threshold: number): Set<number> {
  const kept: number[] = [];
  for (let i = 0; i < embeddings.length; i++) {
    let isDuplicate = false;
    for (const j of kept) {
      if (cosineSimilarity(embeddings[i], embeddings[j]) >= threshold) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) kept.push(i);
  }
  return new Set(kept);
}

/**
 * Deduplicates DB question records by prompt embedding.
 * Returns the IDs of questions to delete.
 */
async function deduplicateDbQuestions(
  questions: { id: string; prompt: string }[],
  geminiApiKey: string
): Promise<string[]> {
  if (questions.length <= 1) return [];

  try {
    const stems = questions.map((q) => q.prompt);
    const embeddings = await fetchEmbeddings(stems, geminiApiKey);
    const keptSet = filterKeptIndices(embeddings, CONFIG.EMBEDDING_SIMILARITY_THRESHOLD);
    return questions.filter((_, i) => !keptSet.has(i)).map((q) => q.id);
  } catch (err) {
    console.warn("Embedding dedup failed, using string dedup:", err instanceof Error ? err.message : "unknown");
    const seen = new Set<string>();
    const toDelete: string[] = [];
    for (const q of questions) {
      const normalized = q.prompt.toLowerCase().replace(/\s+/g, " ").trim();
      if (seen.has(normalized)) {
        toDelete.push(q.id);
      } else {
        seen.add(normalized);
      }
    }
    return toDelete;
  }
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

async function saveQuestions(
  supabase: SupabaseClient,
  materialId: string,
  coursePackId: string,
  materialTitle: string,
  questions: EnhancedQuestion[]
): Promise<void> {
  const sourceExam = `Generated — ${materialTitle.trim()}`;
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
      course_pack_id: coursePackId,
      source_exam: sourceExam,
      status: "approved",
      is_published: true,
    } as Record<string, unknown>);

    if (error) console.error("Failed to save question:", error.message);
  }
}

// ─── Mode 1: Init ─────────────────────────────────────────────────────────────

async function handleInit(
  materialId: string,
  supabase: SupabaseClient,
  userId: string,
  geminiApiKey: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  // Load material + analysis
  const { data: material, error: materialError } = await supabase
    .from("course_materials")
    .select("storage_path, title, analysis_json_v4, course_pack_id")
    .eq("id", materialId)
    .single();

  if (materialError || !material) {
    return jsonResponse(
      { success: false, error: `Material not found: ${materialError?.message ?? "unknown"}` },
      corsHeaders, 404
    );
  }

  const analysisV4 = material.analysis_json_v4 as MaterialAnalysisV4 | null;
  if (
    !analysisV4 ||
    analysisV4.schema_version !== 4 ||
    !Array.isArray(analysisV4.question_ready_chunks) ||
    analysisV4.question_ready_chunks.length === 0
  ) {
    return jsonResponse(
      { success: false, error: "Material has no analysis_json_v4 with question_ready_chunks. Run the V4 analysis pipeline first." },
      corsHeaders, 400
    );
  }

  if (!material.storage_path) {
    return jsonResponse({ success: false, error: "Material has no storage path" }, corsHeaders, 400);
  }

  // Download PDF
  const { data: pdfData, error: downloadError } = await supabase.storage
    .from("course-materials")
    .download(material.storage_path);

  if (downloadError || !pdfData) {
    return jsonResponse(
      { success: false, error: `Failed to download PDF: ${downloadError?.message ?? "unknown"}` },
      corsHeaders, 500
    );
  }

  const arrayBuffer = await pdfData.arrayBuffer();
  if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
    return jsonResponse({ success: false, error: "PDF too large (>15MB). Please upload a smaller file." }, corsHeaders, 400);
  }

  // Upload PDF once to Gemini Files API
  const uint8Array = new Uint8Array(arrayBuffer);
  const fileUri = await uploadPdfToGemini(uint8Array, geminiApiKey);

  // Cancel any pre-existing running/pending jobs (Bug 5 + Bug 6):
  // Abandoned browser sessions leave jobs stuck in "running" forever.
  // Supersede them so the new run starts from a clean state.
  await supabase
    .from("generation_jobs")
    .update({ status: "failed", error_message: "Superseded by new generation run", completed_at: new Date().toISOString() })
    .eq("material_id", materialId)
    .in("status", ["running", "pending"]);

  // Compute chunk targets
  const sorted = [...analysisV4.question_ready_chunks].sort(
    (a, b) => potentialRank(b) - potentialRank(a)
  );

  const { count: existingCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("source_material_id", materialId);

  const chunkTargets = computeAllTargets(sorted, existingCount ?? 0, CONFIG.MAX_QUESTIONS_PER_MATERIAL);
  const totalQuestionsTarget = [...chunkTargets.values()].reduce((s, v) => s + v, 0);

  // Build topic_coverage map (stored in job row so chunk mode can look up targets)
  const topicCoverage: Record<number, { target: number; generated: number }> = {};
  for (const chunk of sorted) {
    topicCoverage[chunk.chunk_index] = {
      target: chunkTargets.get(chunk.chunk_index) ?? 0,
      generated: 0,
    };
  }

  // Non-zero chunks only
  const chunks = sorted
    .filter((c) => (chunkTargets.get(c.chunk_index) ?? 0) > 0)
    .map((c) => ({
      chunkIndex: c.chunk_index,
      target: chunkTargets.get(c.chunk_index)!,
      summary: c.summary.slice(0, 200),
    }));

  // Create job row — status 'running' immediately so UI shows progress
  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .insert({
      material_id: materialId,
      status: "running",
      started_at: new Date().toISOString(),
      total_chunks: chunks.length,
      completed_chunks: 0,
      failed_chunks: 0,
      total_questions_target: totalQuestionsTarget,
      total_questions_generated: 0,
      pre_run_count: existingCount ?? 0,
      created_by: userId,
      topic_coverage: topicCoverage,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error(`Failed to create generation job: ${jobError?.message ?? "unknown"}`);
  }

  const jobId = (job as { id: string }).id;

  return jsonResponse({ success: true, jobId, fileUri, chunks, totalQuestionsTarget }, corsHeaders);
}

// ─── Mode 2: Chunk ────────────────────────────────────────────────────────────

async function handleChunk(
  jobId: string,
  fileUri: string,
  chunkIndex: number,
  supabase: SupabaseClient,
  geminiApiKey: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  // Load job
  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .select("material_id, topic_coverage, completed_chunks")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return jsonResponse({ success: false, error: "Job not found" }, corsHeaders, 404);
  }

  const { material_id: materialId, topic_coverage: topicCoverage, completed_chunks: completedChunks } = job as {
    material_id: string;
    topic_coverage: Record<number, { target: number; generated: number }> | null;
    completed_chunks: number;
  };

  // Look up target from topic_coverage stored during init
  const target = topicCoverage?.[chunkIndex]?.target ?? 0;
  if (target === 0) {
    return jsonResponse({ success: true, questionsGenerated: 0 }, corsHeaders);
  }

  // Load analysis_json_v4, course_pack_id, and title for question saving
  const { data: material, error: materialError } = await supabase
    .from("course_materials")
    .select("analysis_json_v4, course_pack_id, title")
    .eq("id", materialId)
    .single();

  if (materialError || !material?.analysis_json_v4) {
    return jsonResponse({ success: false, error: "Material analysis not found" }, corsHeaders, 404);
  }

  const analysisV4 = material.analysis_json_v4 as MaterialAnalysisV4;
  const coursePackId = (material as unknown as { course_pack_id: string }).course_pack_id ?? "";
  const materialTitle = (material as unknown as { title: string }).title ?? "";
  const chunk = analysisV4.question_ready_chunks.find((c) => c.chunk_index === chunkIndex);

  if (!chunk) {
    return jsonResponse(
      { success: false, error: `Chunk ${chunkIndex} not found in analysis` },
      corsHeaders, 404
    );
  }

  // Load recent stems to guide Gemini away from near-duplicates
  const { data: existingQs } = await supabase
    .from("questions")
    .select("prompt")
    .eq("source_material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(20);

  const existingStems = (existingQs ?? []).map((q: { prompt: string }) => q.prompt);

  // Generate + save immediately
  let questionsGenerated = 0;
  let chunkFailed = false;

  try {
    const questions = await generateQuestionsForChunk(chunk, target, fileUri, geminiApiKey, existingStems);
    await saveQuestions(supabase, materialId, coursePackId, materialTitle, questions);
    questionsGenerated = questions.length;
    console.log(`Chunk ${chunkIndex}: saved ${questionsGenerated}/${target}`);
  } catch (err) {
    console.error(`Chunk ${chunkIndex} failed:`, err instanceof Error ? err.message : "unknown");
    chunkFailed = true;
  }

  // Count total saved questions for this material (accurate even under concurrency)
  const { count: savedCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("source_material_id", materialId)
    .eq("source", "generated");

  // Build update payload
  const updateData: Record<string, unknown> = {
    completed_chunks: (completedChunks ?? 0) + 1,
    total_questions_generated: savedCount ?? 0,
    current_chunk_summary: chunk.summary.slice(0, 200),
  };

  if (chunkFailed) {
    // Read current failed_chunks to safely increment (minor race risk, cosmetic only)
    const { data: currentJob } = await supabase
      .from("generation_jobs")
      .select("failed_chunks")
      .eq("id", jobId)
      .single();
    updateData.failed_chunks = ((currentJob as { failed_chunks: number } | null)?.failed_chunks ?? 0) + 1;
  }

  await supabase.from("generation_jobs").update(updateData).eq("id", jobId);

  return jsonResponse({ success: true, questionsGenerated }, corsHeaders);
}

// ─── Mode 3: Finalize ─────────────────────────────────────────────────────────

async function handleFinalize(
  jobId: string,
  supabase: SupabaseClient,
  geminiApiKey: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  // Load job
  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .select("material_id, failed_chunks, total_chunks, pre_run_count")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return jsonResponse({ success: false, error: "Job not found" }, corsHeaders, 404);
  }

  const { material_id: materialId, failed_chunks: failedChunks, total_chunks: totalChunks, pre_run_count: preRunCount } = job as {
    material_id: string;
    failed_chunks: number;
    total_chunks: number;
    pre_run_count: number;
  };

  // Load all generated questions for this material
  const { data: dbQuestions } = await supabase
    .from("questions")
    .select("id, prompt")
    .eq("source_material_id", materialId)
    .eq("source", "generated");

  const questions = (dbQuestions ?? []) as { id: string; prompt: string }[];

  let finalCount = questions.length;
  let deduped = 0;

  if (questions.length > 1) {
    const toDelete = await deduplicateDbQuestions(questions, geminiApiKey);
    if (toDelete.length > 0) {
      await supabase.from("questions").delete().in("id", toDelete);
      deduped = toDelete.length;
      finalCount = questions.length - deduped;
    }
    console.log(`Finalize: ${questions.length} total → ${deduped} duplicates removed → ${finalCount} kept`);
  }

  // Mark job completed (failed only if every chunk failed)
  const status = failedChunks > 0 && failedChunks >= totalChunks ? "failed" : "completed";

  await supabase
    .from("generation_jobs")
    .update({
      status,
      completed_at: new Date().toISOString(),
      total_questions_generated: finalCount,
      completed_chunks: totalChunks, // ensure 100% progress display
      error_message: failedChunks > 0 ? `${failedChunks} chunk(s) failed to generate questions` : null,
    })
    .eq("id", jobId);

  // Update material
  await supabase
    .from("course_materials")
    .update({ questions_generated_count: finalCount, status: "ready" })
    .eq("id", materialId);

  const newlyGenerated = Math.max(0, finalCount - (preRunCount ?? 0));
  return jsonResponse({ success: true, finalCount, deduped, newlyGenerated }, corsHeaders);
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
      return jsonResponse({ success: false, error: "GEMINI_API_KEY is not configured" }, corsHeaders, 500);
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Missing Authorization header" }, corsHeaders, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, corsHeaders, 401);
    }

    // Admin check
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({ success: false, error: "Admin access required" }, corsHeaders, 403);
    }

    // Dispatch by body shape
    const body = await req.json() as Record<string, unknown>;

    if (typeof body.materialId === "string" && !("jobId" in body)) {
      // ── Mode 1: Init ──
      return await handleInit(body.materialId, supabase, user.id, GEMINI_API_KEY, corsHeaders);

    } else if (typeof body.jobId === "string" && typeof body.chunkIndex === "number") {
      // ── Mode 2: Chunk ──
      if (typeof body.fileUri !== "string") {
        return jsonResponse({ success: false, error: "fileUri is required for chunk mode" }, corsHeaders, 400);
      }
      return await handleChunk(body.jobId, body.fileUri, body.chunkIndex, supabase, GEMINI_API_KEY, corsHeaders);

    } else if (typeof body.jobId === "string" && body.finalize === true) {
      // ── Mode 3: Finalize ──
      return await handleFinalize(body.jobId, supabase, GEMINI_API_KEY, corsHeaders);

    } else {
      return jsonResponse(
        { success: false, error: "Invalid request body. Provide { materialId } | { jobId, fileUri, chunkIndex } | { jobId, finalize: true }" },
        corsHeaders, 400
      );
    }

  } catch (error) {
    console.error("generate-questions-batch error:", error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      corsHeaders, 500
    );
  }
});
