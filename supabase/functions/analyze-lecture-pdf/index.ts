/**
 * analyze-lecture-pdf — V4 Question-Ready Facts extraction for lecture materials
 *
 * Implements Phase A + B of the V4 analysis pipeline (blueprint: 01-ingest-material.md):
 *
 *   Phase A: Send PDF base64 to Gemini → extract QuestionReadyChunk[] with
 *     atomic_facts, evidence_spans, formulas, worked_examples, misconceptions
 *     (temperature 0.1, maxOutputTokens 65536)
 *
 *   Phase B: Text-only outline call using Phase A summaries → OutlineSection[] + course_guess
 *     (temperature 0.1, maxOutputTokens 4096)
 *
 * Stores result in course_materials.analysis_json_v4 (schema_version: 4)
 * Updates material status: analyzing → analyzed
 *
 * HTTP: POST { materialId: string }
 * Returns: { success, chunksExtracted, outline } on completion (synchronous — not background)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  getExternalServiceRoleKey,
  getExternalAnonKey,
} from "../_shared/external-db.ts";

// EdgeRuntime is a global provided by the Supabase Edge Runtime host
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

// ─── Types (mirrors src/types/materials.ts — duplicated for edge isolation) ──

interface EvidenceSpan { span_id: string; text: string; }
interface AtomicFact { fact_id: string; statement: string; fact_type: string; evidence_span_id: string; }
interface ChunkDefinition { term: string; definition: string; evidence_span_id: string; }
interface ChunkFormula {
  name: string; expression: string;
  variables: { symbol: string; meaning: string; domain: string | null }[];
  conditions: string[];
  evidence_span_id: string;
}
interface ChunkConstraint { constraint: string; context: string; evidence_span_id: string; }
interface WorkedExample {
  problem_statement: string;
  given: { quantity: string; value: string; unit: string | null }[];
  asked: string;
  steps: { step_number: number; action: string; formula_used: string | null; intermediate_result: string | null }[];
  final_answer: string;
  evidence_span_id: string;
}
interface ChunkMisconception {
  misconception_id: string; description: string; correct_concept: string; evidence_span_id: string;
}

interface QuestionReadyChunk {
  chunk_index: number;
  chunk_type: "page" | "slide";
  summary: string;
  atomic_facts: AtomicFact[];
  definitions: ChunkDefinition[];
  formulas: ChunkFormula[];
  constraints: ChunkConstraint[];
  worked_examples: WorkedExample[];
  common_misconceptions: ChunkMisconception[];
  evidence_spans: EvidenceSpan[];
  key_terms: string[];
  content_density: "sparse" | "normal" | "dense";
  question_potential: "low" | "medium" | "high";
}

interface OutlineSection {
  section_title: string;
  page_range: [number, number];
  subtopics: string[];
}

interface MaterialAnalysisV4 {
  schema_version: 4;
  course_guess?: { course_code: string; confidence: number; signals: string[] };
  lecture_date_guess?: { date: string; confidence: number; reasoning: string };
  question_ready_chunks: QuestionReadyChunk[];
  outline: OutlineSection[];
  topics: unknown[];
}

// ─── Gemini function schema for Phase A ──────────────────────────────────────

const CHUNK_SCHEMA = {
  name: "extract_lecture_chunks",
  description: "Extract question-ready facts from each page/slide of a lecture PDF",
  parameters: {
    type: "object",
    required: ["chunks"],
    properties: {
      chunks: {
        type: "array",
        description: "One entry per page or slide",
        items: {
          type: "object",
          required: ["chunk_index", "chunk_type", "summary", "atomic_facts", "definitions", "formulas", "constraints", "worked_examples", "common_misconceptions", "evidence_spans", "key_terms", "content_density", "question_potential"],
          properties: {
            chunk_index:   { type: "integer" },
            chunk_type:    { type: "string", enum: ["page", "slide"] },
            summary:       { type: "string", description: "2-3 sentence summary of this page/slide" },
            content_density:   { type: "string", enum: ["sparse", "normal", "dense"] },
            question_potential:{ type: "string", enum: ["low", "medium", "high"] },
            key_terms: { type: "array", items: { type: "string" } },

            evidence_spans: {
              type: "array",
              description: "Exact text excerpts (<= 50 words) with unique span IDs",
              items: {
                type: "object", required: ["span_id", "text"],
                properties: {
                  span_id: { type: "string", description: "e_{chunk_index}_{seq}" },
                  text:    { type: "string" },
                },
              },
            },

            atomic_facts: {
              type: "array",
              description: "Single testable statements grounded in evidence spans",
              items: {
                type: "object", required: ["fact_id", "statement", "fact_type", "evidence_span_id"],
                properties: {
                  fact_id:         { type: "string", description: "f_{chunk_index}_{seq}" },
                  statement:       { type: "string" },
                  fact_type:       { type: "string", enum: ["definition", "property", "relationship", "procedure", "example", "constraint"] },
                  evidence_span_id:{ type: "string" },
                },
              },
            },

            definitions: {
              type: "array",
              items: {
                type: "object", required: ["term", "definition", "evidence_span_id"],
                properties: {
                  term:            { type: "string" },
                  definition:      { type: "string" },
                  evidence_span_id:{ type: "string" },
                },
              },
            },

            formulas: {
              type: "array",
              items: {
                type: "object", required: ["name", "expression", "variables", "conditions", "evidence_span_id"],
                properties: {
                  name:       { type: "string" },
                  expression: { type: "string", description: "LaTeX expression" },
                  variables: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        symbol:  { type: "string" },
                        meaning: { type: "string" },
                        domain:  { type: "string" },
                      },
                    },
                  },
                  conditions:      { type: "array", items: { type: "string" } },
                  evidence_span_id:{ type: "string" },
                },
              },
            },

            constraints: {
              type: "array",
              items: {
                type: "object", required: ["constraint", "context", "evidence_span_id"],
                properties: {
                  constraint:      { type: "string" },
                  context:         { type: "string" },
                  evidence_span_id:{ type: "string" },
                },
              },
            },

            worked_examples: {
              type: "array",
              items: {
                type: "object", required: ["problem_statement", "given", "asked", "steps", "final_answer", "evidence_span_id"],
                properties: {
                  problem_statement: { type: "string" },
                  given: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        quantity: { type: "string" },
                        value:    { type: "string" },
                        unit:     { type: "string" },
                      },
                    },
                  },
                  asked: { type: "string" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step_number:         { type: "integer" },
                        action:              { type: "string" },
                        formula_used:        { type: "string" },
                        intermediate_result: { type: "string" },
                      },
                    },
                  },
                  final_answer:    { type: "string" },
                  evidence_span_id:{ type: "string" },
                },
              },
            },

            common_misconceptions: {
              type: "array",
              items: {
                type: "object", required: ["misconception_id", "description", "correct_concept", "evidence_span_id"],
                properties: {
                  misconception_id:{ type: "string", description: "m_{chunk_index}_{seq}" },
                  description:     { type: "string" },
                  correct_concept: { type: "string" },
                  evidence_span_id:{ type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
};

const OUTLINE_SCHEMA = {
  name: "extract_outline",
  description: "Extract course outline and course guess from chunk summaries",
  parameters: {
    type: "object",
    required: ["outline"],
    properties: {
      course_guess: {
        type: "object",
        properties: {
          course_code: { type: "string" },
          confidence:  { type: "number" },
          signals:     { type: "array", items: { type: "string" } },
        },
      },
      lecture_date_guess: {
        type: "object",
        properties: {
          date:      { type: "string", description: "ISO date or semester week reference" },
          confidence:{ type: "number" },
          reasoning: { type: "string" },
        },
      },
      outline: {
        type: "array",
        items: {
          type: "object", required: ["section_title", "page_range", "subtopics"],
          properties: {
            section_title: { type: "string" },
            page_range:    { type: "array", items: { type: "integer" }, minItems: 2, maxItems: 2 },
            subtopics:     { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};

// ─── Phase A: Extract QuestionReadyChunks ─────────────────────────────────────

async function phaseA(pdfBase64: string, geminiApiKey: string): Promise<QuestionReadyChunk[]> {
  const prompt = `You are an expert educational content analyst extracting question-ready facts from a lecture PDF.

For EVERY page or slide in this document:
1. Extract evidence spans: exact text excerpts (≤ 50 words) that contain testable content. Assign span IDs: e_{page}_{seq}
2. Extract atomic facts: single testable statements grounded in evidence spans. Assign fact IDs: f_{page}_{seq}
3. Extract all definitions, formulas (with full variable bindings in LaTeX), constraints, and worked examples
4. Extract common misconceptions students make about this content — these will be used for MCQ distractor design
5. Rate content_density: sparse (mostly intro/review), normal, dense (new concepts, derivations, examples)
6. Rate question_potential: low (admin/logistics), medium (concepts), high (derivations, formulas, examples)
7. List 3-8 key_terms for the page

EVIDENCE LINKING: Every atomic_fact, definition, formula, constraint, worked_example, and misconception MUST cite an evidence_span_id from this chunk.

Call extract_lecture_chunks with ALL pages/slides.`;

  // Use gemini-3-flash-preview for Phase A — supports PDF + function calling, significantly
  // faster than gemini-3.1-pro-preview (which has thinking enabled and exceeds the 150s limit).
  // 110s timeout — leaves ~40s for Phase B + DB write within Supabase's 150s wall-clock limit.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 110_000);

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
            parts: [
              { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
              { text: prompt },
            ],
          }],
          tools: [{ functionDeclarations: [CHUNK_SCHEMA] }],
          toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["extract_lecture_chunks"] } },
          generationConfig: { temperature: 0.1, maxOutputTokens: 65536 },
        }),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Phase A Gemini error ${response.status}: ${err.slice(0, 300)}`);
  }

  const result = await response.json();
  const call = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;

  if (call?.name !== "extract_lecture_chunks" || !call.args?.chunks) {
    throw new Error("Phase A: no function call returned");
  }

  return call.args.chunks as QuestionReadyChunk[];
}

// ─── Phase B: Extract outline (text-only, no PDF) ────────────────────────────

async function phaseB(
  chunks: QuestionReadyChunk[],
  geminiApiKey: string
): Promise<{ outline: OutlineSection[]; course_guess?: MaterialAnalysisV4["course_guess"]; lecture_date_guess?: MaterialAnalysisV4["lecture_date_guess"] }> {
  const summaries = chunks
    .map((c) => `Page ${c.chunk_index}: ${c.summary} | key_terms: ${c.key_terms.join(", ")}`)
    .join("\n");

  const prompt = `You are extracting a coarse outline and course metadata from lecture chunk summaries.

CHUNK SUMMARIES:
${summaries}

Identify:
1. Course code/name (guess from content and key_terms)
2. Lecture date or week (if mentioned)
3. High-level sections with page ranges and subtopics

Call extract_outline.`;

  // 25s timeout for Phase B — text-only, should be fast
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ functionDeclarations: [OUTLINE_SCHEMA] }],
          toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["extract_outline"] } },
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
        signal: controller.signal,
      }
    );
  } catch {
    console.warn("Phase B timed out or failed — using empty outline");
    return { outline: [] };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    console.warn("Phase B failed, using empty outline:", response.status);
    return { outline: [] };
  }

  const result = await response.json();
  const call = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;

  if (!call?.args) return { outline: [] };

  return {
    outline: (call.args.outline ?? []) as OutlineSection[],
    course_guess: call.args.course_guess as MaterialAnalysisV4["course_guess"],
    lecture_date_guess: call.args.lecture_date_guess as MaterialAnalysisV4["lecture_date_guess"],
  };
}

// ─── Background analysis task ─────────────────────────────────────────────────

async function runAnalysis(
  supabase: ReturnType<typeof createClient>,
  materialId: string,
  geminiApiKey: string,
  material: { storage_path: string; title: string; status: string },
): Promise<void> {
  try {
    // Download PDF
    const { data: blob, error: dlErr } = await supabase.storage
      .from("course-materials")
      .download(material.storage_path);

    if (dlErr || !blob) {
      await supabase.from("course_materials")
        .update({ status: "failed", error_message: "PDF download failed" })
        .eq("id", materialId);
      return;
    }

    const arrayBuffer = await blob.arrayBuffer();
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      await supabase.from("course_materials")
        .update({ status: "failed", error_message: "PDF too large (>15MB)" })
        .eq("id", materialId);
      return;
    }

    // PDF → base64
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i += 32768) {
      binary += String.fromCharCode(...uint8.slice(i, i + 32768));
    }
    const pdfBase64 = btoa(binary);

    console.log(`[analyze-lecture-pdf] ${material.title} — Phase A starting (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);

    // Phase A: extract chunks
    let chunks: QuestionReadyChunk[];
    try {
      chunks = await phaseA(pdfBase64, geminiApiKey);
      console.log(`[analyze-lecture-pdf] Phase A done: ${chunks.length} chunks extracted`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      await supabase.from("course_materials")
        .update({ status: "failed", error_message: `Phase A: ${msg}` })
        .eq("id", materialId);
      return;
    }

    // Phase B: outline
    const { outline, course_guess, lecture_date_guess } = await phaseB(chunks, geminiApiKey);
    console.log(`[analyze-lecture-pdf] Phase B done: ${outline.length} sections`);

    // Assemble V4 analysis
    const analysisV4: MaterialAnalysisV4 = {
      schema_version: 4,
      question_ready_chunks: chunks,
      outline,
      topics: [],
      ...(course_guess && { course_guess }),
      ...(lecture_date_guess && { lecture_date_guess }),
    };

    // Persist
    const { error: updateErr } = await supabase
      .from("course_materials")
      .update({
        analysis_json_v4: analysisV4 as unknown as Record<string, unknown>,
        status: "analyzed",
        error_message: null,
      })
      .eq("id", materialId);

    if (updateErr) {
      await supabase.from("course_materials")
        .update({ status: "failed", error_message: `Save failed: ${updateErr.message}` })
        .eq("id", materialId);
      return;
    }

    console.log(`[analyze-lecture-pdf] ${material.title} — analysis complete`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    console.error("[analyze-lecture-pdf] runAnalysis error:", msg);
    const { error: dbErr } = await supabase.from("course_materials")
      .update({ status: "failed", error_message: msg })
      .eq("id", materialId);
    if (dbErr) {
      console.error("[analyze-lecture-pdf] Failed to persist error status:", dbErr.message);
    }
  }
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
    const SERVICE_KEY = getExternalServiceRoleKey();
    const ANON_KEY = getExternalAnonKey();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Admin check
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { materialId } = (await req.json()) as { materialId?: string };
    if (!materialId) {
      return new Response(
        JSON.stringify({ success: false, error: "materialId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load material
    const { data: material, error: matErr } = await supabase
      .from("course_materials")
      .select("storage_path, title, status")
      .eq("id", materialId)
      .single();

    if (matErr || !material) {
      return new Response(
        JSON.stringify({ success: false, error: `Material not found: ${matErr?.message ?? "unknown"}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!material.storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: "Material has no storage path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as analyzing then immediately return 202 — analysis runs in background
    await supabase.from("course_materials").update({ status: "analyzing" }).eq("id", materialId);

    EdgeRuntime.waitUntil(runAnalysis(supabase, materialId, GEMINI_API_KEY, material));

    return new Response(
      JSON.stringify({ queued: true }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-lecture-pdf error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
