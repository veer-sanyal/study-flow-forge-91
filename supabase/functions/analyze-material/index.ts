/**
 * analyze-material — V2 topic-level analysis for course materials
 *
 * Replaces analyze-lecture-pdf. Single Gemini call extracts topic-level
 * analysis with misconceptions, construct map, and course type detection.
 *
 * HTTP: POST { materialId: string }
 * Returns: 202 { queued: true } — analysis runs in background via EdgeRuntime.waitUntil
 *
 * Stores result in course_materials.analysis_json (schema_version: 2)
 * Updates material status: analyzing → analyzed
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EXTERNAL_SUPABASE_URL,
  getExternalServiceRoleKey,
  getExternalAnonKey,
} from "../_shared/external-db.ts";

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

// ─── Analysis JSON Schema (for Gemini structured output) ──────────────────────

const ANALYSIS_RESPONSE_SCHEMA = {
  type: "object",
  required: ["course_type", "topics", "total_pages", "recommended_question_count", "key_formulas", "key_terms", "worked_examples", "construct_map"],
  properties: {
    course_type: {
      type: "string",
      enum: ["stem_quantitative", "stem_conceptual", "humanities", "social_science", "applied_professional"],
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "subtopics", "density", "cognitive_levels", "common_misconceptions", "procedural_errors"],
        properties: {
          name: { type: "string" },
          subtopics: { type: "array", items: { type: "string" } },
          density: { type: "string", enum: ["high", "medium", "low"] },
          cognitive_levels: { type: "array", items: { type: "string", enum: ["recall", "comprehension", "application", "analysis"] } },
          common_misconceptions: { type: "array", items: { type: "string" } },
          procedural_errors: { type: "array", items: { type: "string" } },
        },
      },
    },
    total_pages: { type: "integer" },
    recommended_question_count: { type: "integer" },
    key_formulas: { type: "array", items: { type: "string" } },
    key_terms: { type: "array", items: { type: "string" } },
    worked_examples: {
      type: "array",
      items: {
        type: "object",
        required: ["description", "page"],
        properties: {
          description: { type: "string" },
          page: { type: "integer" },
        },
      },
    },
    construct_map: { type: "array", items: { type: "string" } },
  },
};

const ANALYSIS_PROMPT = `You are an expert educational measurement specialist analyzing course material.

Analyze the attached PDF and return a JSON object with:

1. course_type: One of "stem_quantitative", "stem_conceptual", "humanities", "social_science", "applied_professional"

2. topics: Array of topic objects, each containing:
   - name: Topic name
   - subtopics: Array of subtopic strings
   - density: "high" | "medium" | "low" (how much content covers this topic)
   - cognitive_levels: Which levels this topic supports from: ["recall", "comprehension", "application", "analysis"]
   - common_misconceptions: Array of strings describing mistakes students commonly make with this topic (THIS IS CRITICAL — these become distractors)
   - procedural_errors: Array of common calculation or process mistakes (for quantitative topics)

3. total_pages: Number of pages
4. recommended_question_count: Suggested number of questions (roughly 1 per page for dense material, 1 per 2 pages for lighter material, cap at 30)
5. key_formulas: Array of formulas/equations found (empty for non-STEM)
6. key_terms: Array of important vocabulary/concepts
7. worked_examples: Array of { description, page } for any worked problems
8. construct_map: Array of high-level claims like "A student who masters this material can ___" — these define what questions should measure

Return ONLY valid JSON matching the schema. No markdown, no commentary.`;

// ─── Background analysis task ─────────────────────────────────────────────────

async function runAnalysis(
  supabase: ReturnType<typeof createClient>,
  materialId: string,
  geminiApiKey: string,
  material: { storage_path: string; title: string },
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

    console.log(`[analyze-material] ${material.title} — starting analysis (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);

    // Single Gemini call with structured JSON output
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
                { text: ANALYSIS_PROMPT },
              ],
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 16384,
              responseMimeType: "application/json",
              responseSchema: ANALYSIS_RESPONSE_SCHEMA,
            },
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini error ${response.status}: ${err.slice(0, 300)}`);
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned no text content");
    }

    const analysis = JSON.parse(text);
    console.log(`[analyze-material] ${material.title} — ${analysis.topics?.length ?? 0} topics, ${analysis.total_pages ?? "?"} pages`);

    // Wrap with schema_version and persist
    const analysisJson = {
      schema_version: 2,
      ...analysis,
    };

    const { error: updateErr } = await supabase
      .from("course_materials")
      .update({
        analysis_json: analysisJson,
        course_type: analysis.course_type || "stem_quantitative",
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

    console.log(`[analyze-material] ${material.title} — analysis complete`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown";
    console.error("[analyze-material] runAnalysis error:", msg);
    await supabase.from("course_materials")
      .update({ status: "failed", error_message: msg })
      .eq("id", materialId);
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

    // Mark as analyzing then return 202 — analysis runs in background
    await supabase.from("course_materials").update({ status: "analyzing" }).eq("id", materialId);

    EdgeRuntime.waitUntil(runAnalysis(supabase, materialId, GEMINI_API_KEY, material));

    return new Response(
      JSON.stringify({ queued: true }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-material error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
