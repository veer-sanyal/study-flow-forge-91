import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Types ----------

interface AnalysisTopicV1 {
  title: string;
  topic_code?: string | null;
  description?: string;
  objectives?: string[];
  recommended_question_types?: string[];
  supporting_chunks?: number[];
}

interface AnalysisTopicV2 extends AnalysisTopicV1 {
  difficulty_estimate?: number;
  difficulty_rationale?: string;
  difficulty_signals?: string[];
  key_terms?: Array<{ term: string; definition: string; page_ref: number | null }>;
  formulas?: Array<{ name: string; expression: string; context: string }>;
  canonical_formulas?: Array<{ name: string; expression: string; page_ref: number }>;
  common_misconceptions?: Array<{ description: string; correct_concept: string }>;
  worked_examples?: Array<{
    prompt: string;
    given: string[];
    steps: string[];
    answer: string;
    page_ref: number;
  }>;
  tables?: Array<{
    title: string;
    columns: string[];
    rows: string[][];
    page_ref: number;
  }>;
  example_questions?: Array<{
    type: string;
    stem: string;
    choices?: string[];
    correct_choice_index?: number;
    final_answer?: string;
    solution_steps?: string[];
    objective_index?: number;
    misconception_index?: number;
    page_ref?: number;
    difficulty: number;
    expected_answer_type?: string;
  }>;
  question_type_distribution?: Array<{ type: string; proportion: number }>;
}

interface ChunkSummary {
  chunk_index: number;
  chunk_type: "page" | "slide";
  summary: string;
  key_terms: string[];
}

interface QuestionReadyChunk {
  chunk_index: number;
  chunk_type: "page" | "slide";
  summary: string;
  key_terms: string[];
  evidence_spans?: Array<{ span_id: string; text: string }>;
  atomic_facts?: Array<{ fact_id: string; statement: string; fact_type: string; evidence_span_id: string }>;
  definitions?: Array<{ term: string; definition: string; evidence_span_id: string }>;
  formulas?: Array<{ name: string; expression: string; variables: { symbol: string; meaning: string; domain: string | null }[]; conditions: string[]; evidence_span_id: string }>;
  constraints?: Array<{ constraint: string; context: string; evidence_span_id: string }>;
  worked_examples?: Array<{
    problem_statement: string;
    given: { quantity: string; value: string; unit: string | null }[];
    asked: string;
    steps: { step_number: number; action: string; formula_used: string | null; intermediate_result: string | null }[];
    final_answer: string;
    evidence_span_id: string;
  }>;
  common_misconceptions?: Array<{ misconception_id: string; description: string; correct_concept: string; evidence_span_id: string }>;
  content_density?: "sparse" | "normal" | "dense";
  question_potential?: "low" | "medium" | "high";
}

interface NormalizedAnalysis {
  schema_version: 1 | 2 | 4;
  topics: AnalysisTopicV2[];
  chunk_summaries: ChunkSummary[];
  question_ready_chunks?: QuestionReadyChunk[];
}

interface DbTopic {
  id: string;
  title: string;
  description: string | null;
  topic_code: string | null;
}

// ---------- V5 Evidence-Based Pipeline Types ----------

interface TestableClaim {
  claim_id: string;
  claim: string;
  claim_type: "definition" | "procedure" | "formula" | "conceptual" | "example" | "pitfall";
  evidence: Array<{ quote: string; page: string }>;
  common_confusions: string[];
}

interface FactBankResult {
  claims: TestableClaim[];
}

interface OptionAudit {
  verdict: "correct" | "wrong";
  why: string;
  evidence: string;
}

interface DistractorRationale {
  choice_id: string;
  rationale_type: "misconception" | "computation_error" | "partial_understanding";
  error_description: string;
}

interface GeneratedMCQ {
  stem: string;
  choices: { A: string; B: string; C: string; D: string };
  correct: string;
  explanation: string;
  evidence_spans: Array<{ quote: string; page: string }>;
  option_audit: { A: OptionAudit; B: OptionAudit; C: OptionAudit; D: OptionAudit };
  difficulty_1to5: number;
  confidence_0to1: number;
  distractor_rationales: DistractorRationale[];
}

// ---------- Normalization ----------

function normalizeAnalysis(
  raw: Record<string, unknown>,
  rawV4?: Record<string, unknown> | null,
): NormalizedAnalysis {
  if (rawV4 && (rawV4.schema_version as number) === 4) {
    const topics = (rawV4.topics as AnalysisTopicV1[]) || [];
    const questionReadyChunks = (rawV4.question_ready_chunks as QuestionReadyChunk[]) || [];
    const chunkSummaries: ChunkSummary[] = questionReadyChunks.map((qrc) => ({
      chunk_index: qrc.chunk_index,
      chunk_type: qrc.chunk_type,
      summary: qrc.summary,
      key_terms: qrc.key_terms,
    }));

    return {
      schema_version: 4,
      topics: topics as AnalysisTopicV2[],
      chunk_summaries: chunkSummaries,
      question_ready_chunks: questionReadyChunks,
    };
  }

  const version = (raw.schema_version as number) || 1;
  const topics = (raw.topics as AnalysisTopicV1[]) || [];
  const chunkSummaries = (raw.chunk_summaries as ChunkSummary[]) || [];

  if (version === 2) {
    return {
      schema_version: 2,
      topics: topics as AnalysisTopicV2[],
      chunk_summaries: chunkSummaries,
    };
  }

  const normalized: AnalysisTopicV2[] = topics.map((t) => {
    const types = t.recommended_question_types || [];
    const proportion = types.length > 0 ? 1.0 / types.length : 0;
    return {
      ...t,
      difficulty_signals: [],
      difficulty_rationale: "",
      key_terms: [],
      formulas: [],
      canonical_formulas: [],
      common_misconceptions: [],
      worked_examples: [],
      tables: [],
      example_questions: [],
      question_type_distribution: types.map((type) => ({ type, proportion })),
    };
  });

  return {
    schema_version: 1,
    topics: normalized,
    chunk_summaries: [],
  };
}

// ---------- Fuzzy Topic Matching ----------

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2),
  );
}

function keywordOverlap(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const tok of tokensA) if (tokensB.has(tok)) overlap++;
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function matchAnalysisTopic(dbTopic: DbTopic, analysisTopics: AnalysisTopicV2[]): AnalysisTopicV2 | null {
  const dbTitle = dbTopic.title.toLowerCase().trim();
  const dbCode = dbTopic.topic_code?.toLowerCase().trim() || null;

  for (const at of analysisTopics) if (at.title.toLowerCase().trim() === dbTitle) return at;
  if (dbCode) for (const at of analysisTopics) if (at.topic_code && at.topic_code.toLowerCase().trim() === dbCode) return at;
  for (const at of analysisTopics) {
    const atTitle = at.title.toLowerCase().trim();
    if (dbTitle.includes(atTitle) || atTitle.includes(dbTitle)) return at;
  }

  let bestMatch: AnalysisTopicV2 | null = null;
  let bestScore = 0;
  for (const at of analysisTopics) {
    const score = keywordOverlap(dbTopic.title, at.title);
    const descScore = dbTopic.description && at.description ? keywordOverlap(dbTopic.description, at.description) * 0.5 : 0;
    const totalScore = score + descScore;
    if (totalScore > bestScore && totalScore > 0.3) {
      bestScore = totalScore;
      bestMatch = at;
    }
  }

  return bestMatch;
}

// ---------- V5 Pipeline Config ----------

const V5_CONFIG = {
  TEMP_FACT_BANK: 0.3,
  TEMP_MCQ_GEN: 0.4,
  MAX_CLAIMS_PER_CHUNK: 12,
  MAX_QUESTIONS_PER_TOPIC: 8,
  MIN_CONFIDENCE: 0.7,
  MAX_QUESTIONS_PER_CLAIM: 1,
} as const;

// ---------- Call 1: Fact Bank Extraction ----------

async function extractFactBank(
  chunkText: string,
  pageNumber: number,
  geminiUrl: string,
): Promise<TestableClaim[]> {
  const factBankPrompt = `You are creating exam-quality multiple choice questions from lecture notes.

Given the lecture notes excerpt below (page ${pageNumber}), extract up to ${V5_CONFIG.MAX_CLAIMS_PER_CHUNK} TESTABLE CLAIMS.

Rules:
- Each claim must be answerable using ONLY this excerpt.
- Each claim must include 1–2 exact supporting quotes (<=25 words each).
- Claims should be specific (definition, formula, condition, procedure step, common confusion, example conclusion).
- If the excerpt is too thin, return fewer claims rather than inventing.
- Focus on claims that would make good MCQ questions (testable, unambiguous, single-fact).

Return JSON only:

{
  "claims": [
    {
      "claim_id": "C1",
      "claim": "...",
      "claim_type": "definition|procedure|formula|conceptual|example|pitfall",
      "evidence": [
        {"quote": "...", "page": "${pageNumber}"},
        {"quote": "...", "page": "${pageNumber}"}
      ],
      "common_confusions": ["...", "..."]
    }
  ]
}

EXCERPT (Page ${pageNumber}):
${chunkText}`;

  try {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: factBankPrompt }] }],
        generationConfig: {
          temperature: V5_CONFIG.TEMP_FACT_BANK,
          maxOutputTokens: 8192,
          response_mime_type: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.error(`Fact bank extraction failed: ${response.status}`);
      return [];
    }

    const result = await response.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) return [];

    const cleanedText = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const factBank: FactBankResult = JSON.parse(cleanedText);
    return factBank.claims || [];
  } catch (error) {
    console.error("Error extracting fact bank:", error);
    return [];
  }
}

// ---------- Call 2: Generate ONE MCQ from ONE Claim (with Self-Audit) ----------

async function generateMCQFromClaim(
  claim: TestableClaim,
  chunkText: string,
  topicTitle: string,
  geminiUrl: string,
): Promise<GeneratedMCQ | null> {
  const mcqPrompt = `Write ONE exam-quality multiple choice question (4 options, single correct) based ONLY on the claim + evidence below.

Hard requirements:
- The correct option must be directly supported by the evidence quotes.
- The 3 distractors must be plausible and reflect the "common_confusions", but must be provably wrong or unsupported by the excerpt.
- Avoid vague stems. Test one objective only.
- No "all of the above", no multi-part, no select-all.
- Questions should require 2+ reasoning steps (not just definition recall).

Then do an OPTION AUDIT: for each option, cite which evidence supports/refutes it.
If the audit shows ambiguity or more than one correct, REWRITE the question once and re-audit.
If you cannot create a good MCQ from this claim, return {"cannot_create": true, "reason": "..."}.

Return JSON only:

{
  "stem": "...",
  "choices": {"A":"...","B":"...","C":"...","D":"..."},
  "correct": "B",
  "explanation": "2-4 sentences",
  "evidence_spans": [
    {"quote":"...", "page":"..."}
  ],
  "option_audit": {
    "A": {"verdict":"wrong", "why":"...", "evidence":".../none"},
    "B": {"verdict":"correct", "why":"...", "evidence":"..."},
    "C": {"verdict":"wrong", "why":"...", "evidence":".../none"},
    "D": {"verdict":"wrong", "why":"...", "evidence":".../none"}
  },
  "difficulty_1to5": 3,
  "confidence_0to1": 0.86,
  "distractor_rationales": [
    {"choice_id": "A", "rationale_type": "misconception", "error_description": "..."},
    {"choice_id": "C", "rationale_type": "computation_error", "error_description": "..."},
    {"choice_id": "D", "rationale_type": "partial_understanding", "error_description": "..."}
  ]
}

CLAIM PACKET:
Claim: ${claim.claim}
Type: ${claim.claim_type}
Evidence:
${claim.evidence.map((e) => `- "${e.quote}" (Page ${e.page})`).join("\n")}
Common confusions to use as distractors:
${claim.common_confusions.length > 0 ? claim.common_confusions.map((c) => `- ${c}`).join("\n") : "- None specified (create plausible misconception-based distractors)"}

TOPIC: ${topicTitle}

EXCERPT (for context):
${chunkText.slice(0, 3000)}`;

  try {
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: mcqPrompt }] }],
        generationConfig: {
          temperature: V5_CONFIG.TEMP_MCQ_GEN,
          maxOutputTokens: 4096,
          response_mime_type: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.error(`MCQ generation failed: ${response.status}`);
      return null;
    }

    const result = await response.json();
    const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) return null;

    const cleanedText = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanedText);

    // Check if model said it cannot create
    if (parsed.cannot_create) {
      console.log(`Skipping claim "${claim.claim_id}": ${parsed.reason}`);
      return null;
    }

    // Validate MCQ structure
    const mcq = parsed as GeneratedMCQ;
    if (!mcq.stem || !mcq.choices || !mcq.correct || !mcq.option_audit) {
      console.log(`Invalid MCQ structure for claim "${claim.claim_id}"`);
      return null;
    }

    // Validate option audit shows exactly one correct
    const correctCount = Object.values(mcq.option_audit).filter((a) => a.verdict === "correct").length;
    if (correctCount !== 1) {
      console.log(`MCQ for claim "${claim.claim_id}" has ${correctCount} correct answers, rejecting`);
      return null;
    }

    // Check confidence threshold
    if ((mcq.confidence_0to1 || 0) < V5_CONFIG.MIN_CONFIDENCE) {
      console.log(`MCQ for claim "${claim.claim_id}" below confidence threshold (${mcq.confidence_0to1})`);
      return null;
    }

    return mcq;
  } catch (error) {
    console.error(`Error generating MCQ for claim "${claim.claim_id}":`, error);
    return null;
  }
}

// ---------- Convert MCQ to DB format ----------

function mcqToDbFormat(
  mcq: GeneratedMCQ,
  claim: TestableClaim,
  dbTopic: DbTopic,
  materialId: string,
  coursePackId: string,
): Record<string, unknown> {
  // Convert choices object to array format
  const choiceLetters = ["A", "B", "C", "D"] as const;
  const choices = choiceLetters.map((letter) => ({
    id: letter,
    text: mcq.choices[letter],
    isCorrect: letter === mcq.correct,
  }));

  // Build source evidence
  const sourceEvidence = {
    evidence_span_ids: mcq.evidence_spans.map((_, i) => `e_${claim.claim_id}_${i}`),
    quotes: mcq.evidence_spans,
    claim_id: claim.claim_id,
    claim_type: claim.claim_type,
  };

  // Calculate quality score from audit
  const auditScore = Object.values(mcq.option_audit).every((a) => a.evidence !== "none" && a.evidence !== "") ? 1 : 0.7;
  const qualityScore = Math.round((mcq.confidence_0to1 * 0.5 + auditScore * 0.5) * 10);

  // Build solution steps from explanation
  const solutionSteps = [
    `Understand: ${mcq.stem.slice(0, 100)}...`,
    mcq.explanation,
    `The correct answer is ${mcq.correct}: ${mcq.choices[mcq.correct as keyof typeof mcq.choices]}`,
  ];

  // Build quality flags
  const qualityFlags = {
    grounded: 1,
    answerable_from_context: 1,
    has_single_clear_correct: 1,
    format_justified: 1,
    non_trivial: mcq.difficulty_1to5 >= 2 ? Math.min(5, mcq.difficulty_1to5 + 1) : 2,
    distractors_plausible: mcq.distractor_rationales?.length >= 3 ? 5 : 3,
    clarity: 4,
    context_authentic: 5,
    pipeline_version: 5,
    was_repaired: false,
    claim_type: claim.claim_type,
    confidence: mcq.confidence_0to1,
    option_audit_complete: Object.values(mcq.option_audit).every((a) => a.why && a.why.length > 0),
  };

  return {
    course_pack_id: coursePackId,
    topic_ids: [dbTopic.id],
    prompt: mcq.stem,
    choices: choices,
    correct_answer: mcq.correct,
    question_format: "multiple_choice",
    difficulty: mcq.difficulty_1to5,
    hint: claim.evidence[0]?.quote ? `Look at: "${claim.evidence[0].quote.slice(0, 50)}..."` : null,
    solution_steps: solutionSteps,
    full_solution: mcq.explanation,
    common_mistakes: claim.common_confusions,
    tags: [claim.claim_type, `page-${claim.evidence[0]?.page || "unknown"}`],
    source: "generated",
    source_material_id: materialId,
    status: "draft",
    is_published: false,
    needs_review: true,
    quality_score: qualityScore,
    quality_flags: qualityFlags,
    source_evidence: sourceEvidence,
  };
}

// ---------- Main Handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let materialId: string | undefined;

  try {
    const body = await req.json();
    materialId = body.materialId;
    const { topicIds } = body;

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
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;

    // Verify admin role
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

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

    if (!material.analysis_json) {
      return new Response(JSON.stringify({ error: "Material has not been analyzed yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to generating
    await supabase
      .from("course_materials")
      .update({ status: "generating_questions", error_message: null })
      .eq("id", materialId);

    // Create job record
    const { data: job } = await supabase
      .from("material_jobs")
      .insert({
        material_id: materialId,
        job_type: "generation",
        status: "pending",
        created_by: user.id,
      })
      .select()
      .single();

    const jobId = job?.id;

    console.log(`Starting V5 evidence-based question generation for: ${material.title}`);

    // Normalize analysis
    const analysis = normalizeAnalysis(
      material.analysis_json as Record<string, unknown>,
      (material as any).analysis_json_v4 as Record<string, unknown> | null,
    );

    // Get chunks from material_chunks table
    const { data: chunks, error: chunksError } = await supabase
      .from("material_chunks")
      .select("chunk_index, text, title_hint")
      .eq("material_id", materialId)
      .order("chunk_index", { ascending: true });

    if (chunksError || !chunks || chunks.length === 0) {
      // Fallback: use chunk_summaries from analysis
      console.log("No chunks in DB, using analysis chunk summaries as fallback");
    }

    // Get DB topics
    let topicsQuery = supabase
      .from("topics")
      .select("id, title, description, topic_code")
      .eq("course_pack_id", material.course_pack_id);

    if (topicIds && topicIds.length > 0) {
      topicsQuery = topicsQuery.in("id", topicIds);
    }

    const { data: topics, error: topicsError } = await topicsQuery;

    if (topicsError || !topics || topics.length === 0) {
      await supabase
        .from("course_materials")
        .update({ status: "analyzed", error_message: "No topics found" })
        .eq("id", materialId);
      return new Response(JSON.stringify({ error: "No topics found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Match topics to analysis
    const topicMatches = topics
      .map((t) => ({
        dbTopic: t as DbTopic,
        analysisTopic: matchAnalysisTopic(t as DbTopic, analysis.topics),
      }))
      .filter((m) => m.analysisTopic !== null);

    console.log(`Matched ${topicMatches.length}/${topics.length} topics to material content`);

    if (topicMatches.length === 0) {
      await supabase
        .from("course_materials")
        .update({ status: "analyzed", error_message: "No topics matched material content" })
        .eq("id", materialId);
      return new Response(JSON.stringify({ error: "No matching topics" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update job to running
    if (jobId) {
      await supabase.from("material_jobs").update({
        status: "running",
        started_at: new Date().toISOString(),
        total_topics: topicMatches.length,
        completed_topics: 0,
        progress_message: `Starting V5 evidence-based generation for ${topicMatches.length} topics...`,
      }).eq("id", jobId);
    }

    let totalQuestionsCreated = 0;
    let completedTopicCount = 0;

    // Process each topic
    for (const { dbTopic, analysisTopic } of topicMatches) {
      completedTopicCount++;

      if (jobId) {
        await supabase.from("material_jobs").update({
          completed_topics: completedTopicCount,
          current_item: dbTopic.title,
          progress_message: `Processing topic ${completedTopicCount}/${topicMatches.length}: ${dbTopic.title}`,
        }).eq("id", jobId);
      }

      console.log(`\n=== Processing topic: ${dbTopic.title} ===`);

      // Get relevant chunks for this topic
      const relevantChunkIndices = analysisTopic?.supporting_chunks || [];
      let topicChunks: Array<{ index: number; text: string }> = [];

      if (chunks && chunks.length > 0 && relevantChunkIndices.length > 0) {
        topicChunks = chunks
          .filter((c) => relevantChunkIndices.includes(c.chunk_index))
          .map((c) => ({ index: c.chunk_index, text: c.text }));
      } else if (chunks && chunks.length > 0) {
        // Use first 3 chunks if no specific mapping
        topicChunks = chunks.slice(0, 3).map((c) => ({ index: c.chunk_index, text: c.text }));
      } else if (analysis.chunk_summaries.length > 0) {
        // Fallback to summaries
        const relevantSummaries = relevantChunkIndices.length > 0
          ? analysis.chunk_summaries.filter((cs) => relevantChunkIndices.includes(cs.chunk_index))
          : analysis.chunk_summaries.slice(0, 3);
        topicChunks = relevantSummaries.map((cs) => ({
          index: cs.chunk_index,
          text: `[Summary] ${cs.summary}. Key terms: ${cs.key_terms.join(", ")}`,
        }));
      }

      if (topicChunks.length === 0) {
        console.log(`No chunks found for topic "${dbTopic.title}", skipping`);
        continue;
      }

      let topicQuestionCount = 0;
      const allClaims: Array<{ claim: TestableClaim; chunkText: string }> = [];

      // CALL 1: Extract fact bank from each chunk
      for (const chunk of topicChunks) {
        if (topicQuestionCount >= V5_CONFIG.MAX_QUESTIONS_PER_TOPIC) break;

        console.log(`  Extracting facts from chunk ${chunk.index}...`);
        const claims = await extractFactBank(chunk.text, chunk.index + 1, geminiUrl);
        console.log(`  Found ${claims.length} testable claims`);

        for (const claim of claims) {
          allClaims.push({ claim, chunkText: chunk.text });
        }
      }

      // Sort claims by type priority (prefer procedure/formula over definition)
      const typePriority: Record<string, number> = {
        procedure: 1,
        formula: 2,
        conceptual: 3,
        example: 4,
        pitfall: 5,
        definition: 6,
      };
      allClaims.sort((a, b) =>
        (typePriority[a.claim.claim_type] || 10) - (typePriority[b.claim.claim_type] || 10)
      );

      // CALL 2: Generate ONE MCQ per claim (with self-audit)
      for (const { claim, chunkText } of allClaims) {
        if (topicQuestionCount >= V5_CONFIG.MAX_QUESTIONS_PER_TOPIC) break;

        console.log(`  Generating MCQ for claim ${claim.claim_id} (${claim.claim_type}): "${claim.claim.slice(0, 50)}..."`);

        const mcq = await generateMCQFromClaim(claim, chunkText, dbTopic.title, geminiUrl);

        if (!mcq) {
          console.log(`  Failed to generate MCQ for claim ${claim.claim_id}`);
          continue;
        }

        // Convert to DB format and insert
        const insertData = mcqToDbFormat(mcq, claim, dbTopic, materialId!, material.course_pack_id);

        const { error: insertError } = await supabase.from("questions").insert(insertData);

        if (insertError) {
          console.error(`  Error inserting MCQ:`, insertError);
        } else {
          topicQuestionCount++;
          totalQuestionsCreated++;
          console.log(`  ✓ Created MCQ (difficulty ${mcq.difficulty_1to5}, confidence ${mcq.confidence_0to1.toFixed(2)})`);
        }
      }

      console.log(`  Topic "${dbTopic.title}": ${topicQuestionCount} questions created`);

      // Update job progress
      if (jobId) {
        await supabase.from("material_jobs").update({
          total_questions: totalQuestionsCreated,
          completed_questions: totalQuestionsCreated,
          progress_message: `Topic "${dbTopic.title}": ${topicQuestionCount} MCQs. Total: ${totalQuestionsCreated}`,
        }).eq("id", jobId);
      }
    }

    // Update material status
    await supabase.from("course_materials").update({
      status: "ready",
      questions_generated_count: totalQuestionsCreated,
      error_message: null,
    }).eq("id", materialId);

    // Complete job
    if (jobId) {
      await supabase.from("material_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_topics: topicMatches.length,
        total_questions: totalQuestionsCreated,
        completed_questions: totalQuestionsCreated,
        progress_message: `V5 generation complete! ${totalQuestionsCreated} grounded MCQs from ${topicMatches.length} topics.`,
      }).eq("id", jobId);
    }

    console.log(`\n=== V5 Generation Complete: ${totalQuestionsCreated} questions ===`);

    return new Response(
      JSON.stringify({
        success: true,
        pipeline: "v5-evidence-based",
        questionsGenerated: totalQuestionsCreated,
        topicsMatched: topicMatches.length,
        topicsTotal: topics.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in generate-questions:", error);

    if (materialId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sb = createClient(supabaseUrl, supabaseServiceKey);

        const { data: failedJob } = await sb
          .from("material_jobs")
          .select("id")
          .eq("material_id", materialId)
          .eq("job_type", "generation")
          .in("status", ["pending", "running"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (failedJob) {
          await sb.from("material_jobs").update({
            status: "failed",
            error_message: String(error),
            completed_at: new Date().toISOString(),
          }).eq("id", failedJob.id);
        }

        await sb.from("course_materials").update({
          status: "analyzed",
          error_message: String(error),
        }).eq("id", materialId);
      } catch {
        // Best-effort
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
