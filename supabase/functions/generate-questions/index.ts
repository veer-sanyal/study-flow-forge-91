/**
 * generate-questions — V2 server-side question generation
 *
 * Replaces generate-questions-batch. Single edge function, no client loop.
 * Uses EdgeRuntime.waitUntil() so generation completes even if browser closes.
 *
 * HTTP: POST { materialId: string, count?: number }
 * Returns: 202 { jobId: string }
 *
 * Background flow:
 *   1. Download PDF + build prompt from analysis
 *   2. 1-3 sequential Gemini calls (based on page count)
 *   3. Validate structure + score quality
 *   4. Simple string dedup
 *   5. Batch insert questions
 *   6. Update generation_jobs + course_materials
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  getExternalServiceRoleKey,
  getExternalAnonKey,
} from "../_shared/external-db.ts";
import { buildPrompt, GENERATE_QUESTIONS_SCHEMA, type MaterialAnalysis } from "./prompts.ts";
import { validateStructure, scoreQuality, detectDuplicates, rebalanceAnswerPositions, parseMisconceptionFeedback, type GeneratedQuestion } from "./validation.ts";
import { validateAnalysisSchema } from "./analysis-schema.ts";
import { runSecondPassValidation } from "./second-pass-validator.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  "https://study-flow-forge-91.lovable.app",
  "https://study-flow-forge-91.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const getCorsHeaders = (origin: string): Record<string, string> => ({
  "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveTopicId(
  topicName: string,
  topicMap: Map<string, string>,
): string | null {
  const normalized = topicName.toLowerCase().trim();
  // Exact match
  if (topicMap.has(normalized)) return topicMap.get(normalized)!;
  // Substring match: topic name contains or is contained by existing topic
  for (const [title, id] of topicMap) {
    if (title.includes(normalized) || normalized.includes(title)) return id;
  }
  return null;
}

async function callGemini(
  geminiApiKey: string,
  pdfBase64: string,
  promptText: string,
  retryOn429 = true,
): Promise<GeneratedQuestion[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

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
              { text: promptText },
            ],
          }],
          tools: [{ functionDeclarations: [GENERATE_QUESTIONS_SCHEMA] }],
          toolConfig: {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: ["generate_questions"],
            },
          },
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Retry on 429 rate limit (once, after 30s wait)
  if (response.status === 429 && retryOn429) {
    console.warn("[generate-questions] Rate limited, retrying in 30s...");
    await new Promise(r => setTimeout(r, 30_000));
    return callGemini(geminiApiKey, pdfBase64, promptText, false);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini error ${response.status}: ${err.slice(0, 300)}`);
  }

  const result = await response.json();
  const call = result.candidates?.[0]?.content?.parts?.[0]?.functionCall;

  if (call?.name !== "generate_questions" || !Array.isArray(call.args?.questions)) {
    console.warn("[generate-questions] No function call returned, attempting text parse");
    // Try parsing text response as JSON fallback
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.questions)) return parsed.questions;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through
      }
    }
    return [];
  }

  return call.args.questions;
}

// ─── Background generation task ───────────────────────────────────────────────

async function runGeneration(
  supabase: ReturnType<typeof createClient>,
  materialId: string,
  jobId: string,
  geminiApiKey: string,
  material: {
    storage_path: string;
    title: string;
    analysis_json: MaterialAnalysis;
    course_pack_id: string;
  },
  targetCount: number,
  preRunCount: number,
): Promise<void> {
  try {
    // Download PDF
    const { data: blob, error: dlErr } = await supabase.storage
      .from("course-materials")
      .download(material.storage_path);

    if (dlErr || !blob) {
      throw new Error("PDF download failed");
    }

    const arrayBuffer = await blob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < uint8.length; i += 32768) {
      binary += String.fromCharCode(...uint8.slice(i, i + 32768));
    }
    const pdfBase64 = btoa(binary);

    console.log(`[generate-questions] ${material.title} — starting (${Math.round(arrayBuffer.byteLength / 1024)}KB, target: ${targetCount})`);

    // Build prompt
    const analysis = material.analysis_json;
    const basePrompt = buildPrompt(analysis, targetCount);

    // Load existing stems for dedup context
    const { data: existingRows } = await supabase
      .from("questions")
      .select("prompt")
      .eq("source_material_id", materialId)
      .limit(50);

    const existingStems = existingRows?.map(q => q.prompt) || [];
    let dedupContext = existingStems.length > 0
      ? `\n\nAVOID generating questions similar to these existing ones:\n${existingStems.map(s => `- ${s}`).join("\n")}`
      : "";

    // Determine call count: 1 for ≤40 pages, split for longer
    const pageCount = analysis.total_pages || 20;
    const callCount = pageCount > 40 ? Math.ceil(pageCount / 20) : 1;
    const questionsPerCall = Math.ceil(targetCount / callCount);

    let allQuestions: GeneratedQuestion[] = [];

    for (let i = 0; i < callCount; i++) {
      const pageRange = callCount > 1
        ? `\nFocus on pages ${i * 20 + 1} to ${Math.min((i + 1) * 20, pageCount)}.`
        : "";

      const fullPrompt = basePrompt + dedupContext + pageRange +
        `\n\nGenerate exactly ${questionsPerCall} questions.`;

      console.log(`[generate-questions] Call ${i + 1}/${callCount} — requesting ${questionsPerCall} questions`);
      const questions = await callGemini(geminiApiKey, pdfBase64, fullPrompt);
      console.log(`[generate-questions] Call ${i + 1}/${callCount} — received ${questions.length} questions`);

      allQuestions.push(...questions);

      // Update progress after each Gemini call so the UI progress bar advances
      await supabase
        .from("generation_jobs")
        .update({ total_questions_generated: preRunCount + allQuestions.length })
        .eq("id", jobId);

      // Append generated stems to dedup context for next call
      if (callCount > 1 && questions.length > 0) {
        dedupContext += "\n" + questions.map(q => `- ${q.stem}`).join("\n");
      }
    }

    // Validate structure
    const valid = allQuestions.filter(q => validateStructure(q));
    console.log(`[generate-questions] Validated: ${valid.length}/${allQuestions.length} passed structure check`);

    // Score quality
    const scored = valid.map(q => {
      const { score, flags } = scoreQuality(q);
      return { ...q, quality_score: score, quality_flags: flags };
    });

    // Simple string dedup against existing + within batch
    const seen = new Set(existingStems.map(s => normalize(s)));
    const deduped = scored.filter(q => {
      const key = normalize(q.stem);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`[generate-questions] After dedup: ${deduped.length} unique questions`);

    // Semantic duplicate detection (word-overlap Jaccard ≥ 0.6)
    const dupPairs = detectDuplicates(deduped);
    const dropIndices = new Set<number>();
    for (const [idxA, idxB] of dupPairs) {
      // Keep the higher-scored question
      const drop = deduped[idxA].quality_score >= deduped[idxB].quality_score ? idxB : idxA;
      dropIndices.add(drop);
    }
    const afterDupRemoval = deduped.filter((_, i) => !dropIndices.has(i));
    if (dupPairs.length > 0) {
      console.log(`[generate-questions] Removed ${dropIndices.size} near-duplicate questions`);
    }

    // Filter out rejected questions (score < 70)
    const qualityFiltered = afterDupRemoval.filter(q => q.quality_score >= 70);
    if (afterDupRemoval.length !== qualityFiltered.length) {
      console.log(`[generate-questions] Rejected ${afterDupRemoval.length - qualityFiltered.length} low-quality questions (score < 70)`);
    }

    // Second-pass LLM validation (Phase 4)
    let secondPassResults: Awaited<ReturnType<typeof runSecondPassValidation>> = [];
    try {
      secondPassResults = await runSecondPassValidation(
        qualityFiltered,
        analysis.course_type,
        geminiApiKey,
      );
      const failCount = secondPassResults.filter(r => !r.passed).length;
      if (failCount > 0) {
        console.log(`[generate-questions] Second-pass flagged ${failCount}/${qualityFiltered.length} questions`);
      }
    } catch (err) {
      console.warn("[generate-questions] Second-pass validation failed, continuing:", err instanceof Error ? err.message : "unknown");
    }

    // Update progress with validated count (after dedup/quality filtering)
    await supabase
      .from("generation_jobs")
      .update({ total_questions_generated: preRunCount + qualityFiltered.length })
      .eq("id", jobId);

    // Answer position rebalancing
    rebalanceAnswerPositions(qualityFiltered);

    // Load existing topics for topic mapping
    const { data: existingTopics } = await supabase
      .from("topics")
      .select("id, title")
      .eq("course_pack_id", material.course_pack_id);

    const topicMap = new Map<string, string>();
    for (const t of existingTopics ?? []) {
      topicMap.set(t.title.toLowerCase().trim(), t.id);
    }
    console.log(`[generate-questions] Loaded ${topicMap.size} existing topics for mapping`);

    // Batch insert
    if (qualityFiltered.length > 0) {
      const sourceExam = `Generated — ${material.title.trim()}`;
      // Build a map of second-pass results by question index
      const secondPassMap = new Map<number, { passed: boolean; issues: string[] }>();
      for (const r of secondPassResults) {
        secondPassMap.set(r.questionIndex, { passed: r.passed, issues: r.issues });
      }

      const rows = qualityFiltered.map((q, idx) => {
        const matchedTopicId = resolveTopicId(q.topic, topicMap);
        const spResult = secondPassMap.get(idx);
        const spFlags = spResult && !spResult.passed
          ? spResult.issues.map(issue => `second_pass: ${issue}`)
          : [];
        const allFlags = [...q.quality_flags, ...spFlags];
        const needsReviewFromSP = spResult ? !spResult.passed : false;
        return {
        prompt: q.stem,
        choices: q.options.map(o => ({ text: o.text, id: o.id, isCorrect: o.is_correct })),
        correct_answer: q.options.find(o => o.is_correct)?.id || "A",
        full_solution: q.explanation,
        difficulty: q.difficulty,
        cognitive_level: q.cognitive_level,
        construct_claim: q.construct_claim,
        quality_score: q.quality_score,
        quality_flags: allFlags,
        distractor_rationales: q.options
          .filter(o => !o.is_correct)
          .map(o => {
            const raw = o.misconception || "";
            const parsed = parseMisconceptionFeedback(raw);
            return {
              id: o.id,
              misconception: raw,
              diagnosis: parsed.diagnosis,
              fix: parsed.fix,
              check: parsed.check,
            };
          }),
        unmapped_topic_suggestions: matchedTopicId ? [] : [q.topic],
        source_pages: q.source_pages,
        source_exam: sourceExam,
        source_material_id: materialId,
        course_pack_id: material.course_pack_id,
        source: "generated",
        status: "approved",
        is_published: q.quality_score >= 90 && !!matchedTopicId && !needsReviewFromSP,
        needs_review: q.quality_score < 90 || !matchedTopicId || needsReviewFromSP,
        needs_review_reason: q.quality_score < 90 || !matchedTopicId || needsReviewFromSP
          ? `quality_score:${q.quality_score}; flags:${allFlags.join(", ")}${!matchedTopicId ? "; unmapped_topic" : ""}${needsReviewFromSP ? "; second_pass_failed" : ""}`
          : null,
        topic_ids: matchedTopicId ? [matchedTopicId] : [],
      };
      });

      const { error: insertErr } = await supabase.from("questions").insert(rows);
      if (insertErr) {
        throw new Error(`Insert failed: ${insertErr.message}`);
      }
    }

    // Finalize job
    await supabase
      .from("generation_jobs")
      .update({
        status: "completed",
        total_questions_generated: preRunCount + qualityFiltered.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await supabase
      .from("course_materials")
      .update({
        status: "ready",
      })
      .eq("id", materialId);

    console.log(`[generate-questions] ${material.title} — done: ${qualityFiltered.length} new questions inserted`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    console.error("[generate-questions] runGeneration error:", msg);
    await supabase
      .from("generation_jobs")
      .update({
        status: "failed",
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
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

    const { materialId, count } = (await req.json()) as { materialId?: string; count?: number };
    if (!materialId) {
      return new Response(
        JSON.stringify({ success: false, error: "materialId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load material + analysis
    const { data: material, error: matErr } = await supabase
      .from("course_materials")
      .select("storage_path, title, status, analysis_json, course_pack_id")
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

    // Validate analysis_json schema at boundary between Phase 2 → Phase 3
    const analysisResult = validateAnalysisSchema(material.analysis_json);
    if (!analysisResult.valid) {
      const errorSummary = analysisResult.errors.map(e => `${e.path}: ${e.message}`).join("; ");
      console.error("[generate-questions] Analysis schema validation failed:", errorSummary);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid analysis data: ${errorSummary}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const analysis = analysisResult.data;

    const targetCount = count || analysis.recommended_question_count || 25;

    // Count existing questions
    const { count: existingCount } = await supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .eq("source_material_id", materialId);
    const preRunCount = existingCount || 0;

    // Supersede stuck running jobs for this material
    await supabase
      .from("generation_jobs")
      .update({ status: "failed", error_message: "Superseded by new run" })
      .eq("material_id", materialId)
      .eq("status", "running");

    // Create job record
    const { data: job, error: jobErr } = await supabase
      .from("generation_jobs")
      .insert({
        material_id: materialId,
        status: "running",
        total_questions_target: targetCount,
        pre_run_count: preRunCount,
        created_by: user.id,
      })
      .select()
      .single();

    if (jobErr || !job) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create job: ${jobErr?.message ?? "unknown"}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return 202 immediately — generation runs in background
    EdgeRuntime.waitUntil(
      runGeneration(supabase, materialId, job.id, GEMINI_API_KEY, material as {
        storage_path: string;
        title: string;
        analysis_json: MaterialAnalysis;
        course_pack_id: string;
      }, targetCount, preRunCount)
    );

    return new Response(
      JSON.stringify({ jobId: job.id }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-questions error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
