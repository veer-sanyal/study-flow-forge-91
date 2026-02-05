import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Schemas ----------

// V2 shallow chunk summary (kept for backward compat)
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

// V4 Question-Ready Chunk Schema - extracts atomic facts with evidence grounding
const QUESTION_READY_CHUNK_SCHEMA = `{
  "question_ready_chunks": [
    {
      "chunk_index": 0,
      "chunk_type": "page|slide",
      "summary": "2-3 sentence summary for backward compat",
      "key_terms": ["term1", "term2"],

      "evidence_spans": [
        {
          "span_id": "e_0_1",
          "text": "Exact text excerpt from document (<= 50 words)"
        }
      ],

      "atomic_facts": [
        {
          "fact_id": "f_0_1",
          "statement": "A single testable atomic statement",
          "fact_type": "definition|property|relationship|procedure|example|constraint",
          "evidence_span_id": "e_0_1"
        }
      ],

      "definitions": [
        {
          "term": "Term name",
          "definition": "Clear definition text",
          "evidence_span_id": "e_0_1"
        }
      ],

      "formulas": [
        {
          "name": "Formula name",
          "expression": "LaTeX expression",
          "variables": [
            { "symbol": "x", "meaning": "description", "domain": "R or null" }
          ],
          "conditions": ["condition 1", "condition 2"],
          "evidence_span_id": "e_0_1"
        }
      ],

      "constraints": [
        {
          "constraint": "Rule or constraint text",
          "context": "When this applies",
          "evidence_span_id": "e_0_1"
        }
      ],

      "worked_examples": [
        {
          "problem_statement": "Full problem text",
          "given": [
            { "quantity": "name", "value": "number", "unit": "unit or null" }
          ],
          "asked": "What we need to find",
          "steps": [
            {
              "step_number": 1,
              "action": "What to do",
              "formula_used": "formula name or null",
              "intermediate_result": "result or null"
            }
          ],
          "final_answer": "The answer with units",
          "evidence_span_id": "e_0_1"
        }
      ],

      "common_misconceptions": [
        {
          "misconception_id": "m_0_1",
          "description": "What students incorrectly believe",
          "correct_concept": "What is actually true",
          "evidence_span_id": "e_0_1"
        }
      ],

      "content_density": "sparse|normal|dense",
      "question_potential": "low|medium|high"
    }
  ]
}`;


const OUTLINE_SCHEMA = `{
    "course_guess": {
      "course_code": "string or null",
      "confidence": 0-1,
        "signals": ["signal1"]
  },
"lecture_date_guess": {
  "date": "YYYY-MM-DD or null",
    "confidence": 0 - 1,
      "reasoning": "Found date on title slide"
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
        "difficulty_estimate": 1 - 5,
          "difficulty_rationale": "One sentence explaining why this difficulty rating",
            "difficulty_signals": ["signal1", "signal2"],
              "recommended_question_types": ["conceptual", "computation", "mcq", "short_answer"],
                "question_type_distribution": [
                  { "type": "conceptual", "proportion": 0.3 },
                  { "type": "computation", "proportion": 0.4 },
                  { "type": "mcq", "proportion": 0.2 },
                  { "type": "short_answer", "proportion": 0.1 }
                ],
                  "objectives": ["Students will be able to calculate ...", "Students will be able to explain ..."],
                    "prerequisites": ["topic title or code"],
                      "supporting_chunks": [0, 1, 2],
                        "key_terms": [
                          { "term": "term name", "definition": "brief definition", "page_ref": 3 }
                        ],
                          "formulas": [
                            { "name": "formula name", "expression": "LaTeX or text expression", "context": "when/how it's used" }
                          ],
                            "canonical_formulas": [
                              { "name": "formula name", "expression": "exact LaTeX expression with symbols", "page_ref": 3 }
                            ],
                              "common_misconceptions": [
                                { "description": "what students get wrong", "correct_concept": "what is actually true" }
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
} `;

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

// V4 Question-Ready Types
interface EvidenceSpan {
  span_id: string;
  text: string;
}

interface AtomicFact {
  fact_id: string;
  statement: string;
  fact_type: "definition" | "property" | "relationship" | "procedure" | "example" | "constraint";
  evidence_span_id: string;
}

interface ChunkDefinition {
  term: string;
  definition: string;
  evidence_span_id: string;
}

interface ChunkFormula {
  name: string;
  expression: string;
  variables: { symbol: string; meaning: string; domain: string | null }[];
  conditions: string[];
  evidence_span_id: string;
}

interface ChunkConstraint {
  constraint: string;
  context: string;
  evidence_span_id: string;
}

interface WorkedExampleStep {
  step_number: number;
  action: string;
  formula_used: string | null;
  intermediate_result: string | null;
}

interface WorkedExample {
  problem_statement: string;
  given: { quantity: string; value: string; unit: string | null }[];
  asked: string;
  steps: WorkedExampleStep[];
  final_answer: string;
  evidence_span_id: string;
}

interface ChunkMisconception {
  misconception_id: string;
  description: string;
  correct_concept: string;
  evidence_span_id: string;
}

interface QuestionReadyChunk {
  chunk_index: number;
  chunk_type: "page" | "slide";
  summary: string;
  key_terms: string[];
  evidence_spans: EvidenceSpan[];
  atomic_facts: AtomicFact[];
  definitions: ChunkDefinition[];
  formulas: ChunkFormula[];
  constraints: ChunkConstraint[];
  worked_examples: WorkedExample[];
  common_misconceptions: ChunkMisconception[];
  content_density: "sparse" | "normal" | "dense";
  question_potential: "low" | "medium" | "high";
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

function validateQuestionReadyChunks(chunks: QuestionReadyChunk[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [i, chunk] of chunks.entries()) {
    const prefix = `question_ready_chunks[${i}]`;

    // Basic required fields
    if (!chunk.summary || chunk.summary.length < 10) {
      issues.push({ field: `${prefix}.summary`, message: "Summary too short (min 10 chars)" });
    }
    if (!Array.isArray(chunk.key_terms)) {
      issues.push({ field: `${prefix}.key_terms`, message: "key_terms must be an array" });
    }
    if (!Array.isArray(chunk.evidence_spans)) {
      issues.push({ field: `${prefix}.evidence_spans`, message: "evidence_spans must be an array" });
    }

    // Collect valid evidence span IDs for cross-referencing
    const validSpanIds = new Set<string>();
    for (const span of chunk.evidence_spans || []) {
      if (span.span_id) validSpanIds.add(span.span_id);
      if (!span.text || span.text.length < 5) {
        issues.push({ field: `${prefix}.evidence_spans`, message: `Span ${span.span_id} has empty or too short text` });
      }
    }

    // Validate atomic facts have valid evidence references
    for (const [j, fact] of (chunk.atomic_facts || []).entries()) {
      if (!fact.statement || fact.statement.length < 10) {
        issues.push({ field: `${prefix}.atomic_facts[${j}]`, message: "Fact statement too short" });
      }
      if (fact.evidence_span_id && !validSpanIds.has(fact.evidence_span_id)) {
        issues.push({ field: `${prefix}.atomic_facts[${j}].evidence_span_id`, message: `Invalid evidence span reference: ${fact.evidence_span_id}` });
      }
    }

    // Validate formulas have variable bindings
    for (const [j, formula] of (chunk.formulas || []).entries()) {
      if (!formula.expression) {
        issues.push({ field: `${prefix}.formulas[${j}].expression`, message: "Formula missing expression" });
      }
      if (!Array.isArray(formula.variables) || formula.variables.length === 0) {
        issues.push({ field: `${prefix}.formulas[${j}].variables`, message: "Formula must have variable bindings" });
      }
      if (formula.evidence_span_id && !validSpanIds.has(formula.evidence_span_id)) {
        issues.push({ field: `${prefix}.formulas[${j}].evidence_span_id`, message: `Invalid evidence span reference: ${formula.evidence_span_id}` });
      }
    }

    // Validate worked examples have complete steps
    for (const [j, example] of (chunk.worked_examples || []).entries()) {
      if (!example.problem_statement) {
        issues.push({ field: `${prefix}.worked_examples[${j}].problem_statement`, message: "Missing problem statement" });
      }
      if (!Array.isArray(example.steps) || example.steps.length === 0) {
        issues.push({ field: `${prefix}.worked_examples[${j}].steps`, message: "Worked example must have solution steps" });
      }
      if (!example.final_answer) {
        issues.push({ field: `${prefix}.worked_examples[${j}].final_answer`, message: "Missing final answer" });
      }
      if (example.evidence_span_id && !validSpanIds.has(example.evidence_span_id)) {
        issues.push({ field: `${prefix}.worked_examples[${j}].evidence_span_id`, message: `Invalid evidence span reference: ${example.evidence_span_id}` });
      }
    }

    // Validate content density and question potential
    if (!["sparse", "normal", "dense"].includes(chunk.content_density)) {
      issues.push({ field: `${prefix}.content_density`, message: "Must be sparse, normal, or dense" });
    }
    if (!["low", "medium", "high"].includes(chunk.question_potential)) {
      issues.push({ field: `${prefix}.question_potential`, message: "Must be low, medium, or high" });
    }

    // Warn if high question_potential but no atomic facts
    if (chunk.question_potential === "high" && (!chunk.atomic_facts || chunk.atomic_facts.length === 0)) {
      issues.push({ field: `${prefix}`, message: "High question_potential but no atomic_facts extracted" });
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
  let pipelineVersion: 2 | 4 = 4; // Default to v4

  try {
    const body = await req.json();
    materialId = body.materialId;
    // Allow explicit pipeline version selection (default to v4)
    if (body.pipelineVersion === 2) {
      pipelineVersion = 2;
    }

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
    let chunkSummaries: ChunkSummary[] = [];
    let questionReadyChunks: QuestionReadyChunk[] = [];

    // ==========================================
    // PHASE A: Chunk Extraction (sends base64)
    // V2: Shallow summaries | V4: Question-ready facts
    // ==========================================
    console.log(`Phase A: ${pipelineVersion === 4 ? 'Question-ready extraction' : 'Chunk summarization'} (v${pipelineVersion})...`);

    // Update job progress
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          analysis_phase: pipelineVersion === 4 ? "question_ready_extraction" : "chunk_summarization",
          progress_message: pipelineVersion === 4
            ? "Extracting question-ready facts from document..."
            : "Analyzing document pages/slides...",
        })
        .eq("id", jobId);
    }

    if (pipelineVersion === 4) {
      // V4 Pipeline: Extract question-ready facts with evidence grounding
      const v4ChunkPrompt = `You are extracting QUESTION-READY FACTS from course material. Your goal is to preserve ALL testable content with exact evidence grounding.

CRITICAL RULES:
1. Every extracted item MUST have an evidence_span_id pointing to exact source text
2. Formulas MUST include variable bindings (what each symbol means)
3. Worked examples MUST show intermediate steps (not just final answer)
4. Evidence spans MUST be EXACT text from document (<= 50 words)
5. Atomic facts must be ATOMIC (one testable statement per fact)

For each page/slide, extract:
- evidence_spans: Exact text excerpts that support the extracted items
- atomic_facts: Single testable statements (definitions, properties, relationships, procedures, examples, constraints)
- definitions: Term + definition pairs
- formulas: Complete formulas with variable bindings and conditions
- constraints: Rules, limits, conditions that apply
- worked_examples: Full problem with given values, steps, and final answer
- common_misconceptions: What students typically get wrong

DENSITY RATINGS:
- content_density: "sparse" (mostly visual/filler), "normal" (balanced), "dense" (lots of content)
- question_potential: "low" (title/intro/summary), "medium" (conceptual), "high" (formulas/examples/problems)

Output ONLY valid JSON matching this schema:
${QUESTION_READY_CHUNK_SCHEMA}

Rules:
- chunk_index is 0-based (first page = 0)
- chunk_type: "page" for PDFs, "slide" for PPTX
- span_id format: "e_{chunk_index}_{sequence}" (e.g., "e_0_1", "e_0_2")
- fact_id format: "f_{chunk_index}_{sequence}" (e.g., "f_0_1")
- misconception_id format: "m_{chunk_index}_{sequence}" (e.g., "m_0_1")
- Include summary and key_terms for backward compatibility
- Preserve exact numbers, symbols, and notation from the source

Analyze the document now and extract ALL question-ready content:`;

      const phaseARawV4 = await callGemini(
        geminiApiKey,
        [
          { text: v4ChunkPrompt },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
        { temperature: 0.1, maxOutputTokens: 65536 }, // Larger output for rich extraction
      );

      const { data: phaseADataV4, warnings: phaseAWarningsV4 } = await withRepair(
        geminiApiKey,
        phaseARawV4,
        (raw) => parseJson<{ question_ready_chunks: QuestionReadyChunk[] }>(raw),
        (d) => validateQuestionReadyChunks(d.question_ready_chunks || []),
        (issues) =>
          `Fix ONLY these issues in the JSON and return the corrected full JSON:\n${issues.map((i) => `- ${i.field}: ${i.message}`).join("\n")}\n\nOriginal JSON:\n${phaseARawV4}`,
      );

      questionReadyChunks = phaseADataV4.question_ready_chunks || [];
      allWarnings.push(...phaseAWarningsV4);

      // Also populate chunkSummaries for backward compat with Phase B/C
      chunkSummaries = questionReadyChunks.map((qrc) => ({
        chunk_index: qrc.chunk_index,
        chunk_type: qrc.chunk_type,
        summary: qrc.summary,
        key_terms: qrc.key_terms,
      }));

      // Log extraction stats
      const totalFacts = questionReadyChunks.reduce((sum, c) => sum + (c.atomic_facts?.length || 0), 0);
      const totalFormulas = questionReadyChunks.reduce((sum, c) => sum + (c.formulas?.length || 0), 0);
      const totalExamples = questionReadyChunks.reduce((sum, c) => sum + (c.worked_examples?.length || 0), 0);
      const totalMisconceptions = questionReadyChunks.reduce((sum, c) => sum + (c.common_misconceptions?.length || 0), 0);
      console.log(`Phase A (v4) complete: ${questionReadyChunks.length} chunks, ${totalFacts} facts, ${totalFormulas} formulas, ${totalExamples} examples, ${totalMisconceptions} misconceptions`);

    } else {
      // V2 Pipeline: Shallow chunk summaries
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

      chunkSummaries = phaseAData.chunk_summaries || [];
      allWarnings.push(...phaseAWarnings);
      console.log(`Phase A (v2) complete: ${chunkSummaries.length} chunk summaries`);
    }

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
- Identify the lecture date if possible (often on title slide or footer). Format as YYYY-MM-DD.
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
    const dateGuess = (phaseBData as any).lecture_date_guess;

    allWarnings.push(...phaseBWarnings);
    console.log(`Phase B complete: ${outline.length} sections identified`);

    if (dateGuess?.date && dateGuess.confidence > 0.7) {
      console.log(`Found high-confidence date: ${dateGuess.date}`);
      try {
        await supabase
          .from("course_materials")
          .update({ content_date: dateGuess.date })
          .eq("id", materialId);
      } catch (e) {
        console.warn("Failed to update content_date:", e);
      }
    }

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
    // PHASE C: Per-Section Topic Mapping
    // V4: Uses pre-extracted facts | V2: Extracts from summaries
    // ==========================================
    console.log(`Phase C: ${pipelineVersion === 4 ? 'Mapping topics from extracted facts' : 'Extracting'} ${outline.length} sections...`);

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
      // Gather chunks for this section's page range
      const sectionChunks = chunkSummaries.filter(
        (cs) => cs.chunk_index >= section.page_range[0] && cs.chunk_index <= section.page_range[1],
      );

      let extractionPrompt: string;

      if (pipelineVersion === 4) {
        // V4: Use pre-extracted question-ready facts
        const sectionQRChunks = questionReadyChunks.filter(
          (qrc) => qrc.chunk_index >= section.page_range[0] && qrc.chunk_index <= section.page_range[1],
        );

        // Build rich context from already-extracted facts
        const factsContext = sectionQRChunks.flatMap((qrc) =>
          (qrc.atomic_facts || []).map((f) => `[${f.fact_id}] ${f.statement}`)
        ).join("\n");

        const definitionsContext = sectionQRChunks.flatMap((qrc) =>
          (qrc.definitions || []).map((d) => `- ${d.term}: ${d.definition}`)
        ).join("\n");

        const formulasContext = sectionQRChunks.flatMap((qrc) =>
          (qrc.formulas || []).map((f) => `- ${f.name}: ${f.expression} (vars: ${f.variables.map((v) => `${v.symbol}=${v.meaning}`).join(", ")})`)
        ).join("\n");

        const workedExamplesContext = sectionQRChunks.flatMap((qrc) =>
          (qrc.worked_examples || []).map((we) =>
            `Example: ${we.problem_statement}\nGiven: ${we.given.map((g) => `${g.quantity}=${g.value}${g.unit || ""}`).join(", ")}\nSteps: ${we.steps.map((s) => s.action).join(" → ")}\nAnswer: ${we.final_answer}`
          )
        ).join("\n\n");

        const misconceptionsContext = sectionQRChunks.flatMap((qrc) =>
          (qrc.common_misconceptions || []).map((m) => `[${m.misconception_id}] Wrong: "${m.description}" → Correct: "${m.correct_concept}"`)
        ).join("\n");

        const evidenceContext = sectionQRChunks.flatMap((qrc) =>
          (qrc.evidence_spans || []).map((e) => `[${e.span_id}] "${e.text}"`)
        ).join("\n");

        extractionPrompt = `You are creating a TOPIC MAP from pre-extracted question-ready facts.

SECTION: "${section.section_title}"
SUBTOPICS: ${section.subtopics.join(", ")}
PAGE RANGE: ${section.page_range[0]}-${section.page_range[1]}

ALREADY EXTRACTED CONTENT (DO NOT re-extract, use these directly):

ATOMIC FACTS:
${factsContext || "(none)"}

DEFINITIONS:
${definitionsContext || "(none)"}

FORMULAS:
${formulasContext || "(none)"}

WORKED EXAMPLES:
${workedExamplesContext || "(none)"}

COMMON MISCONCEPTIONS:
${misconceptionsContext || "(none)"}

EVIDENCE SPANS:
${evidenceContext || "(none)"}

Your task is to ORGANIZE these already-extracted facts into a topic structure with learning objectives.

Output ONLY valid JSON matching this exact schema:
${TOPIC_EXTRACTION_SCHEMA}

CRITICAL RULES FOR V4 TOPIC MAPPING:
1. Learning objectives MUST start with measurable action verbs: ${MEASURABLE_VERBS.slice(0, 15).join(", ")}
2. DO NOT use these banned verbs: ${BANNED_VERBS.join(", ")}
3. Use the ALREADY EXTRACTED content above - DO NOT hallucinate new facts
4. key_terms: Collect from the definitions above
5. formulas: Collect from the formulas above (don't re-extract)
6. common_misconceptions: Collect from misconceptions above
7. worked_examples: Collect from worked examples above
8. difficulty_estimate: Based on content complexity (1=intro, 3=intermediate, 5=advanced)
9. question_type_distribution: Proportions must sum to 1.0
10. example_questions: Create 4+ questions that CITE specific fact_ids and evidence_span_ids
    - Each question must include "source_fact_ids" and "source_evidence_ids" arrays
    - MCQ distractors must map to misconception_ids from above
11. supporting_chunks: The chunk indices from ${section.page_range[0]}-${section.page_range[1]}`;

      } else {
        // V2: Extract from shallow summaries (original behavior)
        const chunksText = sectionChunks
          .map((cs) => `[${cs.chunk_type} ${cs.chunk_index}] ${cs.summary}\nKey terms: ${cs.key_terms.join(", ")}`)
          .join("\n\n");

        extractionPrompt = `You are extracting detailed topic information for ONE section of a course material.

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
      }

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
                    progress_message: `${pipelineVersion === 4 ? 'Mapped' : 'Extracted'} topic ${idx + 1} of ${outline.length}: ${section.section_title}`,
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
    let analysisUpdate: Record<string, unknown>;
    let analysisResponse: Record<string, unknown>;

    if (pipelineVersion === 4) {
      // V4: Store in analysis_json_v4 with question-ready chunks
      const analysisV4 = {
        schema_version: 4 as const,
        course_guess: courseGuess || undefined,
        lecture_date_guess: dateGuess || undefined,
        question_ready_chunks: questionReadyChunks,
        outline,
        topics,
      };

      // Also store backward-compat v2 in analysis_json
      const analysisV2Compat = {
        schema_version: 2 as const,
        course_guess: courseGuess || undefined,
        lecture_date_guess: dateGuess || undefined,
        chunk_summaries: chunkSummaries,
        outline,
        topics,
      };

      analysisUpdate = {
        analysis_json: analysisV2Compat,
        analysis_json_v4: analysisV4,
      };
      analysisResponse = analysisV4;
    } else {
      // V2: Store only in analysis_json
      const analysis = {
        schema_version: 2 as const,
        course_guess: courseGuess || undefined,
        lecture_date_guess: dateGuess || undefined,
        chunk_summaries: chunkSummaries,
        outline,
        topics,
      };
      analysisUpdate = { analysis_json: analysis };
      analysisResponse = analysis;
    }

    if (allWarnings.length > 0) {
      console.warn(`Analysis completed with ${allWarnings.length} warnings:`, allWarnings);
    }

    // Store analysis WITHOUT creating topic/objective records
    // Topics will be matched to existing calendar/manually created topics during question generation
    await supabase
      .from("course_materials")
      .update({
        status: "analyzed",
        ...analysisUpdate,
        topics_extracted_count: 0, // Not creating topics in DB
        error_message: allWarnings.length > 0 ? `Completed with ${allWarnings.length} warnings` : null,
      })
      .eq("id", materialId);

    // Cache extracted chunks for incremental re-processing (v4 only)
    if (pipelineVersion === 4 && questionReadyChunks.length > 0) {
      try {
        const docHash = material.sha256 || material.content_fingerprint;
        if (docHash) {
          const cacheInserts = questionReadyChunks.map((chunk) => ({
            doc_hash: docHash,
            chunk_index: chunk.chunk_index,
            data: chunk,
          }));

          // Upsert to handle re-analysis
          await supabase
            .from("chunk_extraction_cache")
            .upsert(cacheInserts, { onConflict: "doc_hash,chunk_index" });
        }
      } catch (cacheError) {
        console.warn("Failed to cache extracted chunks:", cacheError);
        // Non-fatal, continue
      }
    }

    // Update job to completed
    if (jobId) {
      const statsMessage = pipelineVersion === 4
        ? `Analysis complete (v4)! ${questionReadyChunks.length} chunks, ${topics.length} topics.`
        : `Analysis complete! Extracted ${topics.length} topics.`;

      await supabase
        .from("material_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_topics: topics.length,
          progress_message: statsMessage,
        })
        .eq("id", jobId);
    }

    console.log(`Stored v${pipelineVersion} analysis with ${topics.length} topics (not created in DB)`);

    return new Response(
      JSON.stringify({
        success: true,
        pipelineVersion,
        analysis: analysisResponse,
        topicsAnalyzed: topics.length,
        chunksExtracted: pipelineVersion === 4 ? questionReadyChunks.length : chunkSummaries.length,
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
