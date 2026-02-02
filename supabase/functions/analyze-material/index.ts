import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Schemas ----------

const CHUNK_SUMMARY_SCHEMA = `{
  "chunk_summaries": [
    {
      "chunk_index": 0,
      "chunk_type": "page|slide",
      "summary": "2-3 sentence summary of this page/slide",
      "key_terms": ["term1", "term2"]
    }
  ]
}`;

const OUTLINE_SCHEMA = `{
  "course_guess": {
    "course_code": "string or null",
    "confidence": 0-1,
    "signals": ["signal1"]
  },
  "outline": [
    {
      "section_title": "Major section/topic title",
      "page_range": [0, 5],
      "subtopics": ["subtopic1", "subtopic2"]
    }
  ]
}`;

const TOPIC_EXTRACTION_SCHEMA = `{
  "topic_code": "string like '2.1' if present, else null",
  "title": "topic title",
  "description": "short description",
  "difficulty_estimate": 1-5,
  "difficulty_rationale": "One sentence explaining why this difficulty rating",
  "difficulty_signals": ["signal1", "signal2"],
  "recommended_question_types": ["conceptual", "computation", "mcq", "short_answer"],
  "question_type_distribution": [
    {"type": "conceptual", "proportion": 0.3},
    {"type": "computation", "proportion": 0.4},
    {"type": "mcq", "proportion": 0.2},
    {"type": "short_answer", "proportion": 0.1}
  ],
  "objectives": ["Students will be able to calculate ...", "Students will be able to explain ..."],
  "prerequisites": ["topic title or code"],
  "supporting_chunks": [0, 1, 2],
  "key_terms": [
    {"term": "term name", "definition": "brief definition", "page_ref": 3}
  ],
  "formulas": [
    {"name": "formula name", "expression": "LaTeX or text expression", "context": "when/how it's used"}
  ],
  "canonical_formulas": [
    {"name": "formula name", "expression": "exact LaTeX expression with symbols", "page_ref": 3}
  ],
  "common_misconceptions": [
    {"description": "what students get wrong", "correct_concept": "what is actually true"}
  ],
  "worked_examples": [
    {
      "prompt": "textbook-style example description",
      "given": ["given value 1", "given value 2"],
      "steps": ["step 1", "step 2", "step 3"],
      "answer": "final answer",
      "page_ref": 31
    }
  ],
  "tables": [
    {
      "title": "Table title",
      "columns": ["column1", "column2", "column3"],
      "rows": [["value1", "value2", "value3"], ["value4", "value5", "value6"]],
      "page_ref": 41
    }
  ],
  "example_questions": [
    {
      "type": "conceptual|computation|mcq|short_answer",
      "stem": "question text",
      "choices": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
      "correct_choice_index": 1,
      "final_answer": "string",
      "solution_steps": ["step 1", "step 2"],
      "objective_index": 0,
      "misconception_index": 0,
      "page_ref": 29,
      "difficulty": 3
    }
  ]
}`;

const MEASURABLE_VERBS = [
  "calculate", "compute", "derive", "solve", "evaluate", "simplify", "prove",
  "explain", "describe", "summarize", "compare", "contrast", "differentiate",
  "classify", "apply", "demonstrate", "predict", "estimate", "analyze",
  "diagnose", "interpret", "critique", "design", "construct", "synthesize",
  "formulate", "identify", "list", "define", "label", "recall", "state", "recognize",
];

const BANNED_VERBS = ["understand", "know", "learn", "appreciate", "be aware of", "grasp", "comprehend"];

// ---------- Helpers ----------

interface ChunkSummary {
  chunk_index: number;
  chunk_type: "page" | "slide";
  summary: string;
  key_terms: string[];
}

interface OutlineSection {
  section_title: string;
  page_range: [number, number];
  subtopics: string[];
}

interface ValidationIssue {
  field: string;
  message: string;
}

async function callGemini(
  apiKey: string,
  parts: Array<Record<string, unknown>>,
  config: { temperature: number; maxOutputTokens: number },
): Promise<string> {
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        response_mime_type: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

function validateChunkSummaries(summaries: ChunkSummary[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [i, cs] of summaries.entries()) {
    if (!cs.summary || cs.summary.length < 10) {
      issues.push({ field: `chunk_summaries[${i}].summary`, message: "Summary too short (min 10 chars)" });
    }
    if (!Array.isArray(cs.key_terms)) {
      issues.push({ field: `chunk_summaries[${i}].key_terms`, message: "key_terms must be an array" });
    }
  }
  return issues;
}

function validateOutline(outline: OutlineSection[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (outline.length < 1) {
    issues.push({ field: "outline", message: "At least 1 section required" });
  }
  for (const [i, section] of outline.entries()) {
    if (!section.section_title) {
      issues.push({ field: `outline[${i}].section_title`, message: "Missing section_title" });
    }
    if (!Array.isArray(section.page_range) || section.page_range.length !== 2) {
      issues.push({ field: `outline[${i}].page_range`, message: "page_range must be [start, end]" });
    }
  }
  return issues;
}

function validateTopic(topic: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!topic.title) issues.push({ field: "title", message: "Missing title" });
  if (!topic.description) issues.push({ field: "description", message: "Missing description" });

  // Verb compliance on objectives
  const objectives = (topic.objectives as string[]) || [];
  for (const [i, obj] of objectives.entries()) {
    const lower = obj.toLowerCase();
    for (const banned of BANNED_VERBS) {
      if (lower.startsWith(banned) || lower.includes(`to ${banned} `)) {
        issues.push({
          field: `objectives[${i}]`,
          message: `Uses banned verb "${banned}". Replace with measurable verb (e.g., ${MEASURABLE_VERBS.slice(0, 3).join(", ")})`,
        });
      }
    }
  }

  // Proportion sum
  const dist = (topic.question_type_distribution as Array<{ proportion: number }>) || [];
  if (dist.length > 0) {
    const sum = dist.reduce((acc, d) => acc + d.proportion, 0);
    if (Math.abs(sum - 1.0) > 0.05) {
      issues.push({ field: "question_type_distribution", message: `Proportions sum to ${sum}, must be ~1.0` });
    }
  }

  // Example questions validation - require at least 4
  const exampleQuestions = (topic.example_questions as Array<Record<string, unknown>>) || [];
  if (exampleQuestions.length < 4) {
    issues.push({ field: "example_questions", message: `Must have at least 4 example questions, found ${exampleQuestions.length}` });
  }

  return issues;
}

async function withRepair<T>(
  apiKey: string,
  initialRaw: string,
  parse: (raw: string) => T,
  validate: (data: T) => ValidationIssue[],
  repairPrompt: (issues: ValidationIssue[]) => string,
): Promise<{ data: T; warnings: string[] }> {
  let data = parse(initialRaw);
  let issues = validate(data);

  if (issues.length === 0) return { data, warnings: [] };

  console.log(`Validation found ${issues.length} issues, attempting repair...`);

  try {
    const repairRaw = await callGemini(apiKey, [{ text: repairPrompt(issues) }], {
      temperature: 0.1,
      maxOutputTokens: 8192,
    });
    const repaired = parse(repairRaw);
    const newIssues = validate(repaired);
    if (newIssues.length < issues.length) {
      return { data: repaired, warnings: newIssues.map((i) => `${i.field}: ${i.message}`) };
    }
  } catch (e) {
    console.warn("Repair call failed:", e);
  }

  // Accept best-effort with warnings
  return { data, warnings: issues.map((i) => `${i.field}: ${i.message}`) };
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let materialId: string | null = null;

  try {
    ({ materialId } = await req.json());

    if (!materialId) {
      return new Response(JSON.stringify({ error: "materialId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate admin auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin role
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get material record
    const { data: material, error: materialError } = await supabase
      .from("course_materials")
      .select("*")
      .eq("id", materialId)
      .single();

    if (materialError || !material) {
      return new Response(JSON.stringify({ error: "Material not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to analyzing
    await supabase.from("course_materials").update({ status: "analyzing", error_message: null }).eq("id", materialId);

    // Create job record for progress tracking
    const { data: job, error: jobError } = await supabase
      .from("material_jobs")
      .insert({
        material_id: materialId,
        job_type: "analysis",
        status: "pending",
        created_by: user.id,
      })
      .select()
      .single();

    if (jobError) {
      console.warn("Failed to create job record:", jobError);
    }

    const jobId = job?.id;

    // Update job to running
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          analysis_phase: "chunk_summarization",
          progress_message: "Starting analysis...",
        })
        .eq("id", jobId);
    }

    console.log(`Starting analysis for material: ${material.title}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("course-materials")
      .download(material.storage_path);

    if (downloadError || !fileData) {
      await supabase
        .from("course_materials")
        .update({ status: "failed", error_message: "Failed to download file" })
        .eq("id", materialId);

      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 using chunked approach to avoid stack overflow
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const CHUNK_SIZE = 32768;
    let base64 = "";
    for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
      const chunk = uint8Array.slice(i, i + CHUNK_SIZE);
      base64 += String.fromCharCode.apply(null, Array.from(chunk));
    }
    base64 = btoa(base64);

    // Determine MIME type
    const mimeType =
      material.material_type === "lecture_pdf" || material.material_type === "exam_pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    console.log(`File loaded, size: ${arrayBuffer.byteLength} bytes, type: ${mimeType}`);

    const allWarnings: string[] = [];

    // ==========================================
    // PHASE A: Chunk Summarization (sends base64)
    // ==========================================
    console.log("Phase A: Chunk summarization...");
    
    // Update job progress
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          analysis_phase: "chunk_summarization",
          progress_message: "Analyzing document pages/slides...",
        })
        .eq("id", jobId);
    }

    const chunkPrompt = `You are analyzing course lecture material. For each page or slide in this document, produce a summary.

Output ONLY valid JSON matching this schema:
${CHUNK_SUMMARY_SCHEMA}

Rules:
- Each chunk_index is 0-based (first page = 0)
- chunk_type: "page" for PDFs, "slide" for PPTX
- summary: 2-3 sentences capturing the key content
- key_terms: list important terms, concepts, formulas mentioned

Analyze the document now:`;

    const phaseARaw = await callGemini(
      geminiApiKey,
      [
        { text: chunkPrompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
      { temperature: 0.1, maxOutputTokens: 16384 },
    );

    const { data: phaseAData, warnings: phaseAWarnings } = await withRepair(
      geminiApiKey,
      phaseARaw,
      (raw) => parseJson<{ chunk_summaries: ChunkSummary[] }>(raw),
      (d) => validateChunkSummaries(d.chunk_summaries || []),
      (issues) =>
        `Fix ONLY these issues in the JSON and return the corrected full JSON:\n${issues.map((i) => `- ${i.field}: ${i.message}`).join("\n")}\n\nOriginal JSON:\n${phaseARaw}`,
    );

    const chunkSummaries = phaseAData.chunk_summaries || [];
    allWarnings.push(...phaseAWarnings);
    console.log(`Phase A complete: ${chunkSummaries.length} chunk summaries`);
    
    // Update job progress
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          total_chunks: chunkSummaries.length,
          completed_chunks: chunkSummaries.length,
          analysis_phase: "outline",
          progress_message: `Analyzed ${chunkSummaries.length} pages/slides. Creating outline...`,
        })
        .eq("id", jobId);
    }

    // ==========================================
    // PHASE B: Coarse Outline (text-only, uses summaries)
    // ==========================================
    console.log("Phase B: Coarse outline...");

    const summariesText = chunkSummaries
      .map((cs) => `[${cs.chunk_type} ${cs.chunk_index}] ${cs.summary} (terms: ${cs.key_terms.join(", ")})`)
      .join("\n");

    const outlinePrompt = `From these page/slide summaries, identify 3-8 major sections/topics in the material.

PAGE SUMMARIES:
${summariesText}

Output ONLY valid JSON matching this schema:
${OUTLINE_SCHEMA}

Rules:
- Identify the course code if possible from the content
- page_range is [start_index, end_index] (inclusive, 0-based)
- Focus on substantive academic topics, not meta-content like "syllabus" or "title page"
- subtopics should list specific concepts covered in that section`;

    const phaseBRaw = await callGemini(geminiApiKey, [{ text: outlinePrompt }], {
      temperature: 0.1,
      maxOutputTokens: 4096,
    });

    const { data: phaseBData, warnings: phaseBWarnings } = await withRepair(
      geminiApiKey,
      phaseBRaw,
      (raw) => parseJson<{ course_guess?: { course_code: string; confidence: number; signals: string[] }; outline: OutlineSection[] }>(raw),
      (d) => validateOutline(d.outline || []),
      (issues) =>
        `Fix ONLY these issues in the JSON and return the corrected full JSON:\n${issues.map((i) => `- ${i.field}: ${i.message}`).join("\n")}\n\nOriginal JSON:\n${phaseBRaw}`,
    );

    const outline = phaseBData.outline || [];
    const courseGuess = phaseBData.course_guess;
    allWarnings.push(...phaseBWarnings);
    console.log(`Phase B complete: ${outline.length} sections identified`);
    
    // Update job progress
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          analysis_phase: "topic_extraction",
          progress_message: `Identified ${outline.length} sections. Extracting topics...`,
        })
        .eq("id", jobId);
    }

    // ==========================================
    // PHASE C: Per-Section Fine-Grained Extraction (parallel)
    // ==========================================
    console.log(`Phase C: Extracting ${outline.length} sections in parallel...`);

    // Update job with total sections
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          total_topics: outline.length,
          completed_topics: 0,
        })
        .eq("id", jobId);
    }

    const sectionPromises = outline.map((section, idx) => {
      // Gather chunk summaries for this section's page range
      const sectionChunks = chunkSummaries.filter(
        (cs) => cs.chunk_index >= section.page_range[0] && cs.chunk_index <= section.page_range[1],
      );

      const chunksText = sectionChunks
        .map((cs) => `[${cs.chunk_type} ${cs.chunk_index}] ${cs.summary}\nKey terms: ${cs.key_terms.join(", ")}`)
        .join("\n\n");

      const extractionPrompt = `You are extracting detailed topic information for ONE section of a course material.

SECTION: "${section.section_title}"
SUBTOPICS: ${section.subtopics.join(", ")}
PAGE RANGE: ${section.page_range[0]}-${section.page_range[1]}

RELEVANT PAGE SUMMARIES:
${chunksText}

Output ONLY valid JSON matching this exact schema:
${TOPIC_EXTRACTION_SCHEMA}

CRITICAL RULES:
1. Learning objectives MUST start with measurable action verbs from this list:
   ${MEASURABLE_VERBS.join(", ")}
2. DO NOT use these verbs in objectives: ${BANNED_VERBS.join(", ")}
3. difficulty_estimate: 1=introductory, 3=intermediate, 5=advanced. Justify in difficulty_rationale.
4. question_type_distribution proportions MUST sum to 1.0
5. Include at least 2 key_terms, 2 objectives, and 4 example_questions
6. supporting_chunks: list the chunk_index values from the page summaries above
7. formulas: include any mathematical formulas, equations, or key expressions. Empty array if none.
8. common_misconceptions: what students typically get wrong about this topic. At least 1.

QUESTION-READY FACTS EXTRACTION:
9. worked_examples: Extract any worked examples from the material showing givens → steps → final answer. Include concrete numbers, formulas used, and step-by-step reasoning. Empty array if none.
10. tables: Extract any structured tables with columns and rows. Preserve exact values (percentages, numbers, etc.). Empty array if none.
11. canonical_formulas: Extract exact mathematical formulas with precise symbols and notation (e.g., union formula, Bayes form). Use LaTeX. Empty array if none.

QUALITY RUBRIC FOR EXAMPLE_QUESTIONS:
12. example_questions MUST be at least 4 questions (not 1), and MUST follow these rules:
    - Include: 1 conceptual, 1 computation/numeric, 2 MCQ (4 options each).
    - Each question must explicitly target ONE objective from objectives[]:
        include "objective_index" pointing to the objective it tests (0-based index).
    - Every question must include:
        (a) "final_answer" (the correct answer)
        (b) "solution_steps" (3-8 bullet steps showing how to solve)
        (c) "difficulty" (1-5) consistent with difficulty_estimate
        (d) "page_ref" using a chunk_index from supporting_chunks
    - MCQ rules:
        * exactly 4 choices
        * exactly one correct choice
        * include "correct_choice_index" (0-3)
        * include "misconception_index" mapping to a common_misconceptions[] index for distractor rationale
    - Use the lecture's concrete numbers/examples whenever present in RELEVANT PAGE SUMMARIES.
    - Avoid definition-only questions unless the objective is explicitly "define" or "identify".
    - No ambiguous stems; define all symbols; specify rounding if numeric.
    - Each question must be solvable from the provided material (no outside facts required).

DIFFICULTY OPERATIONALIZATION:
13. Difficulty levels mean:
    - 1: Single-step recall or definition. No computation. Direct application of a single concept.
    - 2: Two-step process. Simple substitution into formula. Basic algebraic manipulation.
    - 3: Multi-step reasoning. Requires combining 2-3 concepts. Moderate algebraic work.
    - 4: Complex multi-step. Conditional reasoning. Requires synthesis of multiple concepts. Advanced algebra.
    - 5: Novel problem-solving. Requires creative application. Proof or derivation. Multiple solution paths.

ANTI-BAD-QUESTION RULES:
14. BAN these failure modes:
    - Vague stems ("Which is correct?" with missing context)
    - Trick wording or gotcha questions
    - Questions that can't be answered without the slide image (must be solvable from text)
    - Multi-skill mashups (one question testing multiple unrelated objectives)
    - MCQ with multiple correct choices (unless explicitly multi_select)
    - Questions requiring outside knowledge not in the material`;

      // Stagger calls by 500ms * index
      return new Promise<{ section: string; topic: Record<string, unknown>; warnings: string[] }>((resolve) => {
        setTimeout(async () => {
          try {
            const raw = await callGemini(geminiApiKey, [{ text: extractionPrompt }], {
              temperature: 0.2,
              maxOutputTokens: 8192,
            });

            const { data: topic, warnings } = await withRepair(
              geminiApiKey,
              raw,
              (r) => parseJson<Record<string, unknown>>(r),
              (d) => validateTopic(d),
              (issues) =>
                `Fix ONLY these issues in the JSON and return the corrected full JSON:\n${issues.map((i) => `- ${i.field}: ${i.message}`).join("\n")}\n\nOriginal JSON:\n${raw}`,
            );

            // Update job progress for each completed section
            if (jobId) {
              const { data: currentJob } = await supabase
                .from("material_jobs")
                .select("completed_topics")
                .eq("id", jobId)
                .single();
              
              if (currentJob) {
                await supabase
                  .from("material_jobs")
                  .update({
                    completed_topics: ((currentJob as any).completed_topics || 0) + 1,
                    current_item: section.section_title,
                    progress_message: `Extracted topic ${idx + 1} of ${outline.length}: ${section.section_title}`,
                  })
                  .eq("id", jobId);
              }
            }
            
            resolve({ section: section.section_title, topic, warnings });
          } catch (e) {
            console.error(`Phase C failed for section "${section.section_title}":`, e);
            
            // Still increment on failure
            if (jobId) {
              const { data: currentJob } = await supabase
                .from("material_jobs")
                .select("completed_topics")
                .eq("id", jobId)
                .single();
              
              if (currentJob) {
                await supabase
                  .from("material_jobs")
                  .update({
                    completed_topics: ((currentJob as any).completed_topics || 0) + 1,
                  })
                  .eq("id", jobId);
              }
            }
            resolve({
              section: section.section_title,
              topic: {
                topic_code: null,
                title: section.section_title,
                description: section.subtopics.join(", "),
                difficulty_estimate: 3,
                difficulty_rationale: "Default (extraction failed)",
                difficulty_signals: [],
                recommended_question_types: ["conceptual", "short_answer"],
                question_type_distribution: [
                  { type: "conceptual", proportion: 0.5 },
                  { type: "short_answer", proportion: 0.5 },
                ],
                objectives: section.subtopics.map((st) => `Identify ${st}`),
                prerequisites: [],
                supporting_chunks: Array.from(
                  { length: section.page_range[1] - section.page_range[0] + 1 },
                  (_, i) => section.page_range[0] + i,
                ),
                key_terms: [],
                formulas: [],
                common_misconceptions: [],
                example_questions: [],
              },
              warnings: [`Extraction failed for "${section.section_title}": ${String(e)}`],
            });
          }
        }, idx * 500);
      });
    });

    const sectionResults = await Promise.all(sectionPromises);

    const topics = sectionResults.map((r) => r.topic);
    for (const r of sectionResults) {
      allWarnings.push(...r.warnings);
    }

    console.log(`Phase C complete: ${topics.length} topics extracted`);

    // Derive recommended_question_types from distribution for each topic (backward compat)
    for (const topic of topics) {
      const dist = (topic.question_type_distribution as Array<{ type: string; proportion: number }>) || [];
      if (dist.length > 0 && (!topic.recommended_question_types || (topic.recommended_question_types as string[]).length === 0)) {
        topic.recommended_question_types = dist.map((d) => d.type);
      }
    }

    // ==========================================
    // Build final analysis object
    // ==========================================
    const analysis = {
      schema_version: 2 as const,
      course_guess: courseGuess || undefined,
      chunk_summaries: chunkSummaries,
      outline,
      topics,
    };

    if (allWarnings.length > 0) {
      console.warn(`Analysis completed with ${allWarnings.length} warnings:`, allWarnings);
    }

    // Store analysis WITHOUT creating topic/objective records
    // Topics will be matched to existing calendar/manually created topics during question generation
    await supabase
      .from("course_materials")
      .update({
        status: "analyzed",
        analysis_json: analysis,
        topics_extracted_count: 0, // Not creating topics in DB
        error_message: allWarnings.length > 0 ? `Completed with ${allWarnings.length} warnings` : null,
      })
      .eq("id", materialId);

    // Update job to completed
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_topics: topics.length,
          progress_message: `Analysis complete! Extracted ${topics.length} topics.`,
        })
        .eq("id", jobId);
    }

    console.log(`Stored v2 analysis with ${topics.length} topics (not created in DB)`);

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        topicsAnalyzed: topics.length,
        warnings: allWarnings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in analyze-material:", error);

    // Try to update status to failed
    if (materialId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);
        await sb
          .from("course_materials")
          .update({ status: "failed", error_message: String(error) })
          .eq("id", materialId);
        
        // Update job to failed
        const { data: failedJob } = await sb
          .from("material_jobs")
          .select("id")
          .eq("material_id", materialId)
          .eq("job_type", "analysis")
          .in("status", ["pending", "running"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        
        if (failedJob) {
          await sb
            .from("material_jobs")
            .update({
              status: "failed",
              error_message: String(error),
              completed_at: new Date().toISOString(),
            })
            .eq("id", failedJob.id);
        }
      } catch {
        // Best-effort status update
      }
    }

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
