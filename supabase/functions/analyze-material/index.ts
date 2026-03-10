/**
 * analyze-material — V3 two-call analysis pipeline for course materials
 *
 * Replaces single-call V2. Two sequential Gemini calls:
 *   Call 1 (Structural Extraction): course_type, topics, pages, terms, formulas, examples
 *   Call 2 (Pedagogical Inference): construct_map (ECD), test_spec, misconceptions, cognitive levels
 *
 * HTTP: POST { materialId: string }
 * Returns: 202 { queued: true } — analysis runs in background via EdgeRuntime.waitUntil
 *
 * Stores result in course_materials.analysis_json (schema_version: 3)
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

// ─── Call 1 Schema: Structural Extraction ───────────────────────────────────

const STRUCTURAL_RESPONSE_SCHEMA = {
  type: "object",
  required: ["course_type", "topics", "total_pages", "key_formulas", "key_terms", "worked_examples"],
  properties: {
    course_type: {
      type: "string",
      enum: ["stem_quantitative", "stem_conceptual", "humanities", "social_science", "applied_professional"],
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "subtopics", "density"],
        properties: {
          name: { type: "string" },
          subtopics: { type: "array", items: { type: "string" } },
          density: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    total_pages: { type: "integer" },
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
  },
};

const STRUCTURAL_PROMPT = `You are an expert educational measurement specialist analyzing course material.

Analyze the attached PDF and extract its STRUCTURAL content. Return a JSON object with:

1. course_type: One of "stem_quantitative", "stem_conceptual", "humanities", "social_science", "applied_professional"

2. topics: Array of topic objects, each containing:
   - name: Topic name
   - subtopics: Array of subtopic strings
   - density: "high" | "medium" | "low" (how much content covers this topic)

3. total_pages: Number of pages
4. key_formulas: Array of formulas/equations found (empty for non-STEM)
5. key_terms: Array of important vocabulary/concepts
6. worked_examples: Array of { description, page } for any worked problems

Focus on ACCURATE structural extraction. Do not infer pedagogy or misconceptions yet.
Return ONLY valid JSON matching the schema. No markdown, no commentary.`;

// ─── Call 2 Schema: Pedagogical Inference ───────────────────────────────────

const PEDAGOGICAL_RESPONSE_SCHEMA = {
  type: "object",
  required: ["topics_pedagogy", "construct_map", "test_spec", "recommended_question_count"],
  properties: {
    topics_pedagogy: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "cognitive_levels", "common_misconceptions", "procedural_errors"],
        properties: {
          name: { type: "string" },
          cognitive_levels: {
            type: "array",
            items: { type: "string", enum: ["recall", "comprehension", "application", "analysis", "synthesis"] },
          },
          common_misconceptions: { type: "array", items: { type: "string" } },
          procedural_errors: { type: "array", items: { type: "string" } },
        },
      },
    },
    construct_map: {
      type: "array",
      items: {
        type: "object",
        required: ["claim", "conditions", "evidence"],
        properties: {
          claim: { type: "string", description: "What a student who masters this can do" },
          conditions: { type: "string", description: "Under what conditions (given what info, tools, time)" },
          evidence: { type: "string", description: "What observable response demonstrates this" },
        },
      },
    },
    test_spec: {
      type: "object",
      required: ["objective_weights", "target_dok_distribution"],
      properties: {
        objective_weights: {
          type: "array",
          items: {
            type: "object",
            required: ["topic", "weight"],
            properties: {
              topic: { type: "string" },
              weight: { type: "number", description: "Proportion 0-1, all weights should sum to ~1.0" },
            },
          },
        },
        target_dok_distribution: {
          type: "object",
          required: ["dok_1", "dok_2", "dok_3", "dok_4", "dok_5"],
          properties: {
            dok_1: { type: "number", description: "Proportion for recall/identify" },
            dok_2: { type: "number", description: "Proportion for routine application" },
            dok_3: { type: "number", description: "Proportion for multi-step reasoning" },
            dok_4: { type: "number", description: "Proportion for strategic reasoning" },
            dok_5: { type: "number", description: "Proportion for extended reasoning" },
          },
        },
        misconception_distractor_map: {
          type: "array",
          items: {
            type: "object",
            required: ["misconception", "topic", "suggested_distractor_strategy"],
            properties: {
              misconception: { type: "string" },
              topic: { type: "string" },
              suggested_distractor_strategy: { type: "string" },
            },
          },
        },
      },
    },
    recommended_question_count: { type: "integer" },
  },
};

// ─── Analysis Quality Validator (rule-based, no LLM call) ──────────────────

interface AnalysisWarning {
  code: string;
  message: string;
}

function validateAnalysisQuality(
  structural: Record<string, unknown>,
  pedagogical: Record<string, unknown>,
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  const topics = structural.topics as Array<Record<string, unknown>> | undefined;
  const totalPages = structural.total_pages as number | undefined;

  // Topic count plausibility
  if (topics && totalPages) {
    if (topics.length > totalPages) {
      warnings.push({
        code: "too_many_topics",
        message: `${topics.length} topics for ${totalPages} pages (> 1 topic/page)`,
      });
    }
    if (totalPages > 10 && topics.length < Math.floor(totalPages / 10)) {
      warnings.push({
        code: "too_few_topics",
        message: `${topics.length} topics for ${totalPages} pages (< 1 topic per 10 pages)`,
      });
    }
  }

  // Construct claims quality: check for claim+conditions+evidence format
  const constructMap = pedagogical.construct_map as Array<Record<string, unknown>> | undefined;
  if (constructMap) {
    for (const claim of constructMap) {
      const claimText = claim.claim as string | undefined;
      if (claimText && claimText.length < 20) {
        warnings.push({
          code: "vague_construct_claim",
          message: `Construct claim too short: "${claimText}"`,
        });
      }
      if (!claim.conditions || (claim.conditions as string).length < 10) {
        warnings.push({
          code: "missing_construct_conditions",
          message: `Construct claim missing meaningful conditions: "${claimText?.slice(0, 50)}"`,
        });
      }
      if (!claim.evidence || (claim.evidence as string).length < 10) {
        warnings.push({
          code: "missing_construct_evidence",
          message: `Construct claim missing meaningful evidence: "${claimText?.slice(0, 50)}"`,
        });
      }
    }
  }

  // Misconception specificity
  const vaguePatterns = [
    /^students?\s+(mis)?understand/i,
    /^confuse\s+concepts?/i,
    /^get\s+(it|this|that)\s+wrong/i,
    /^make\s+mistakes?\s+(with|on|in)/i,
  ];

  const topicsPedagogy = pedagogical.topics_pedagogy as Array<Record<string, unknown>> | undefined;
  if (topicsPedagogy) {
    for (const topic of topicsPedagogy) {
      const misconceptions = topic.common_misconceptions as string[] | undefined;
      const density = (topics?.find(t => t.name === topic.name) as Record<string, unknown> | undefined)?.density;

      // High/medium density topics should have at least one misconception
      if ((density === "high" || density === "medium") && (!misconceptions || misconceptions.length === 0)) {
        warnings.push({
          code: "missing_misconceptions",
          message: `Topic "${topic.name}" (${density} density) has no misconceptions`,
        });
      }

      if (misconceptions) {
        for (const m of misconceptions) {
          if (m.length < 15) {
            warnings.push({
              code: "vague_misconception",
              message: `Misconception too short for "${topic.name}": "${m}"`,
            });
          }
          for (const pattern of vaguePatterns) {
            if (pattern.test(m)) {
              warnings.push({
                code: "vague_misconception",
                message: `Vague misconception for "${topic.name}": "${m}" — needs specific error description`,
              });
              break;
            }
          }
        }
      }
    }
  }

  return warnings;
}

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

    console.log(`[analyze-material] ${material.title} — starting 2-call analysis (${Math.round(arrayBuffer.byteLength / 1024)}KB)`);

    // ─── Call 1: Structural Extraction (temp 0.1) ───────────────────────
    const controller1 = new AbortController();
    const timeoutId1 = setTimeout(() => controller1.abort(), 120_000);

    let response1: Response;
    try {
      response1 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
                { text: STRUCTURAL_PROMPT },
              ],
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 16384,
              responseMimeType: "application/json",
              responseSchema: STRUCTURAL_RESPONSE_SCHEMA,
            },
          }),
          signal: controller1.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId1);
    }

    if (!response1.ok) {
      const err = await response1.text();
      throw new Error(`Gemini structural call error ${response1.status}: ${err.slice(0, 300)}`);
    }

    const result1 = await response1.json();
    const text1 = result1.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text1) {
      throw new Error("Gemini Call 1 returned no text content");
    }

    const structural = JSON.parse(text1);
    console.log(`[analyze-material] ${material.title} — Call 1 done: ${structural.topics?.length ?? 0} topics, ${structural.total_pages ?? "?"} pages`);

    // ─── Call 2: Pedagogical Inference (temp 0.15) ──────────────────────
    // Feed Call 1 output as context for focused pedagogical analysis
    const pedagogicalPrompt = `You are an expert educational measurement specialist performing PEDAGOGICAL analysis of course material.

You have already extracted the structural content of this material:
${JSON.stringify(structural, null, 2)}

Now perform deeper PEDAGOGICAL inference. Return a JSON object with:

1. topics_pedagogy: For EACH topic from the structural analysis, provide:
   - name: Must match the topic name from the structural extraction exactly
   - cognitive_levels: Which Bloom's levels this topic supports: ["recall", "comprehension", "application", "analysis", "synthesis"]
   - common_misconceptions: Array of SPECIFIC misconceptions students commonly hold (THIS IS CRITICAL — these become distractors in questions).
     * Each misconception must describe the specific wrong belief, not just "students misunderstand X"
     * Good example: "Confuses population standard deviation σ with sample standard deviation s, using n instead of n-1 in the denominator"
     * Bad example: "Students misunderstand standard deviation"
   - procedural_errors: Array of specific calculation or process mistakes (for quantitative topics)

2. construct_map: Array of Evidence-Centered Design (ECD) construct claims. Each must have:
   - claim: What a student who masters this material can do (specific, measurable)
   - conditions: Under what conditions (given what info, tools, time constraints)
   - evidence: What observable response demonstrates this mastery
   Good example: { claim: "Apply the chain rule to composite functions", conditions: "Given a composition of 2-3 differentiable functions", evidence: "Correctly identifies inner/outer functions and multiplies derivatives" }

3. test_spec: Assessment specification containing:
   - objective_weights: Array of { topic, weight } where weights sum to ~1.0, proportional to topic importance and density
   - target_dok_distribution: Target difficulty distribution using DOK levels:
     * dok_1: Proportion for recall/identify (single cue, no reasoning)
     * dok_2: Proportion for routine application (one principle)
     * dok_3: Proportion for multi-step reasoning (integrate 2+ ideas)
     * dok_4: Proportion for strategic reasoning (select approach, justify)
     * dok_5: Proportion for extended reasoning (novel context, justify limitations)
     All proportions should sum to ~1.0
   - misconception_distractor_map: Array of { misconception, topic, suggested_distractor_strategy }

4. recommended_question_count: Suggested number of questions (roughly 1 per page for dense material, 1 per 2 pages for lighter material, cap at 30)

Return ONLY valid JSON matching the schema. No markdown, no commentary.`;

    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 120_000);

    let response2: Response;
    try {
      response2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
                { text: pedagogicalPrompt },
              ],
            }],
            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: 16384,
              responseMimeType: "application/json",
              responseSchema: PEDAGOGICAL_RESPONSE_SCHEMA,
            },
          }),
          signal: controller2.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId2);
    }

    if (!response2.ok) {
      const err = await response2.text();
      throw new Error(`Gemini pedagogical call error ${response2.status}: ${err.slice(0, 300)}`);
    }

    const result2 = await response2.json();
    const text2 = result2.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text2) {
      throw new Error("Gemini Call 2 returned no text content");
    }

    const pedagogical = JSON.parse(text2);
    console.log(`[analyze-material] ${material.title} — Call 2 done: ${pedagogical.construct_map?.length ?? 0} construct claims`);

    // ─── Merge results ──────────────────────────────────────────────────
    // Merge pedagogical per-topic data back into structural topics
    const pedagogyByName = new Map<string, Record<string, unknown>>();
    for (const tp of pedagogical.topics_pedagogy || []) {
      pedagogyByName.set((tp.name as string).toLowerCase().trim(), tp);
    }

    const mergedTopics = structural.topics.map((topic: Record<string, unknown>) => {
      const pedagogy = pedagogyByName.get((topic.name as string).toLowerCase().trim());
      return {
        ...topic,
        cognitive_levels: pedagogy?.cognitive_levels || ["recall", "comprehension"],
        common_misconceptions: pedagogy?.common_misconceptions || [],
        procedural_errors: pedagogy?.procedural_errors || [],
      };
    });

    // ─── Quality validation (rule-based, logs warnings) ─────────────────
    const qualityWarnings = validateAnalysisQuality(structural, pedagogical);
    if (qualityWarnings.length > 0) {
      console.warn(`[analyze-material] ${material.title} — ${qualityWarnings.length} quality warnings:`);
      for (const w of qualityWarnings) {
        console.warn(`  [${w.code}] ${w.message}`);
      }
    }

    // ─── Assemble final analysis_json ───────────────────────────────────
    const analysisJson = {
      schema_version: 3,
      course_type: structural.course_type,
      topics: mergedTopics,
      total_pages: structural.total_pages,
      recommended_question_count: pedagogical.recommended_question_count,
      key_formulas: structural.key_formulas,
      key_terms: structural.key_terms,
      worked_examples: structural.worked_examples,
      construct_map: pedagogical.construct_map,
      test_spec: pedagogical.test_spec,
      quality_warnings: qualityWarnings.length > 0 ? qualityWarnings : undefined,
    };

    const { error: updateErr } = await supabase
      .from("course_materials")
      .update({
        analysis_json: analysisJson,
        course_type: structural.course_type || "stem_quantitative",
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

    console.log(`[analyze-material] ${material.title} — analysis complete (v3)`);
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
