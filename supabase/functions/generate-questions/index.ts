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
    expected_answer_type?: string; // Legacy field
  }>;
  question_type_distribution?: Array<{ type: string; proportion: number }>;
}

interface ChunkSummary {
  chunk_index: number;
  chunk_type: "page" | "slide";
  summary: string;
  key_terms: string[];
}

interface NormalizedAnalysis {
  schema_version: 1 | 2;
  topics: AnalysisTopicV2[];
  chunk_summaries: ChunkSummary[];
}

interface DbTopic {
  id: string;
  title: string;
  description: string | null;
  topic_code: string | null;
}

// ---------- Normalization ----------

function normalizeAnalysis(raw: Record<string, unknown>): NormalizedAnalysis {
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

  // V1: wrap topics with empty v2 fields, derive distribution from recommended_question_types
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
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function keywordOverlap(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const tok of tokensA) {
    if (tokensB.has(tok)) overlap++;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

function matchAnalysisTopic(
  dbTopic: DbTopic,
  analysisTopics: AnalysisTopicV2[],
): AnalysisTopicV2 | null {
  const dbTitle = dbTopic.title.toLowerCase().trim();
  const dbCode = dbTopic.topic_code?.toLowerCase().trim() || null;

  // 1. Case-insensitive exact title match
  for (const at of analysisTopics) {
    if (at.title.toLowerCase().trim() === dbTitle) return at;
  }

  // 2. Topic code match
  if (dbCode) {
    for (const at of analysisTopics) {
      if (at.topic_code && at.topic_code.toLowerCase().trim() === dbCode) return at;
    }
  }

  // 3. Substring containment (either direction)
  for (const at of analysisTopics) {
    const atTitle = at.title.toLowerCase().trim();
    if (dbTitle.includes(atTitle) || atTitle.includes(dbTitle)) return at;
  }

  // 4. Keyword overlap scoring
  let bestMatch: AnalysisTopicV2 | null = null;
  let bestScore = 0;
  for (const at of analysisTopics) {
    const score = keywordOverlap(dbTopic.title, at.title);
    // Also check description overlap if available
    const descScore = dbTopic.description && at.description
      ? keywordOverlap(dbTopic.description, at.description) * 0.5
      : 0;
    const totalScore = score + descScore;
    if (totalScore > bestScore && totalScore > 0.3) {
      bestScore = totalScore;
      bestMatch = at;
    }
  }

  return bestMatch;
}

// ---------- Pipeline Config ----------

const PIPELINE_CONFIG = {
  TEMP_GENERATE: 0.5,
  TEMP_JUDGE: 0.2,
  TEMP_REPAIR: 0.4,
  KEEP_THRESHOLD: 7,     // out of 10
  REPAIR_THRESHOLD: 4,   // out of 10
  MAX_QUESTIONS_PER_TOPIC: 8,
  OVERGENERATE_FACTOR: 1.5, // request 150% of desired count
} as const;

// ---------- Question Schema (v3 Candidate) ----------

const CANDIDATE_SCHEMA = `{
  "questions": [
    {
      "stem": "The question text",
      "topic_title": "The topic this question belongs to",
      "type": "mcq_single|mcq_multi|short_answer",
      "choices": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
      "correct_answer": "The correct answer (letter for MCQ, value for short_answer)",
      "correct_choice_index": 0,
      "full_solution": "Step-by-step solution explanation",
      "solution_steps": ["Step 1", "Step 2", "Step 3"],
      "hints": ["Hint 1 (general)", "Hint 2 (more specific)", "Hint 3 (almost gives away answer)"],
      "common_mistakes": ["Common mistake 1", "Common mistake 2"],
      "distractor_rationales": {"0": "why this is wrong", "1": "why this is wrong", "2": "why this is wrong"},
      "tags": ["tag1", "tag2"],
      "difficulty": 1-5,
      "objective_index": 0,
      "source_refs": {"supporting_chunks": [29, 30], "page_refs": [29]},
      "why_this_question": "One sentence linking this question to specific material content"
    }
  ]
}`;

const JUDGE_V2_SCHEMA = `{
  "judged_questions": [
    {
      "original_index": 0,
      "binary": {
        "answerable_from_context": 0 or 1,
        "has_single_clear_correct": 0 or 1,
        "format_justified": 0 or 1
      },
      "likert": {
        "distractors_plausible": 1-5,
        "clarity": 1-5,
        "difficulty_appropriate": 1-5
      },
      "verdict": "keep|repair|reject",
      "issues": ["issue 1", "issue 2"]
    }
  ]
}`;

// ---------- Judge Types ----------

interface JudgeBinary {
  answerable_from_context: number;
  has_single_clear_correct: number;
  format_justified: number;
}

interface JudgeLikert {
  distractors_plausible: number;
  clarity: number;
  difficulty_appropriate: number;
}

interface JudgeResult {
  original_index: number;
  binary: JudgeBinary;
  likert: JudgeLikert;
  verdict: "keep" | "repair" | "reject";
  issues: string[];
}

// ---------- Scoring ----------

function computeTotalScore(binary: JudgeBinary, likert: JudgeLikert): number {
  // Binary dims weighted x2 (max 6)
  const binaryScore =
    (binary.answerable_from_context + binary.has_single_clear_correct + binary.format_justified) * 2;
  // Normalized Likert: average of 3 dims scaled to max 4
  const avgLikert =
    (likert.distractors_plausible + likert.clarity + likert.difficulty_appropriate) / 3;
  const likertScore = (avgLikert / 5) * 4;
  return Math.round((binaryScore + likertScore) * 10) / 10; // total out of 10
}

function resolveVerdict(
  llmVerdict: string,
  score: number,
): "keep" | "repair" | "reject" {
  // Trust numeric scores over LLM labels
  if (score >= PIPELINE_CONFIG.KEEP_THRESHOLD) return "keep";
  if (score >= PIPELINE_CONFIG.REPAIR_THRESHOLD) return "repair";
  return "reject";
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let materialId: string | undefined;
  
  try {
    const body = await req.json();
    materialId = body.materialId;
    const { topicIds, questionTypeIds, difficultyRange = [1, 5], quantityPerBucket = 3 } = body;

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

    // Get material record with analysis
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

    // Create job record for progress tracking
    const { data: job, error: jobError } = await supabase
      .from("material_jobs")
      .insert({
        material_id: materialId,
        job_type: "generation",
        status: "pending",
        created_by: user.id,
      })
      .select()
      .single();

    if (jobError) {
      console.warn("Failed to create job record:", jobError);
    }

    const jobId = job?.id;

    console.log(`Starting question generation for material: ${material.title}`);

    // Normalize analysis for v1/v2 compatibility
    const analysis = normalizeAnalysis(material.analysis_json as Record<string, unknown>);

    // Get DB topics to generate for
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

      return new Response(JSON.stringify({ error: "No topics found for this material" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get objectives for context
    const { data: objectives } = await supabase.from("objectives").select("*").eq("source_material_id", materialId);

    // Get question types
    let questionTypesQuery = supabase
      .from("question_types")
      .select("id, name")
      .eq("course_pack_id", material.course_pack_id);

    if (questionTypeIds && questionTypeIds.length > 0) {
      questionTypesQuery = questionTypesQuery.in("id", questionTypeIds);
    }

    const { data: questionTypes } = await questionTypesQuery;
    // v3 pipeline uses MCQ-first distribution, but questionTypes kept for future filtering

    // Match each DB topic to its analysis topic
    const allMatches: Array<{ dbTopic: DbTopic; analysisTopic: AnalysisTopicV2 | null }> = topics.map((t) => ({
      dbTopic: t as DbTopic,
      analysisTopic: matchAnalysisTopic(t as DbTopic, analysis.topics),
    }));

    // CRITICAL FIX: Only generate questions for topics that ACTUALLY matched content in the analyzed material
    // This prevents generating questions for topics not covered in the uploaded lecture
    const topicMatches = allMatches.filter((m) => m.analysisTopic !== null);

    console.log(
      `Topic matching: ${topicMatches.length}/${topics.length} matched to material content`,
    );

    // Update job to running with topic count
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
          total_topics: topicMatches.length,
          completed_topics: 0,
          progress_message: `Starting question generation for ${topicMatches.length} topics...`,
        })
        .eq("id", jobId);
    }

    if (topicMatches.length === 0) {
      await supabase
        .from("course_materials")
        .update({ status: "analyzed", error_message: "No topics from this material matched database topics" })
        .eq("id", materialId);

      return new Response(JSON.stringify({ 
        error: "No matching topics found", 
        detail: "The analyzed material's topics did not match any existing database topics. Please ensure topics have been created first.",
        analysisTopics: analysis.topics.map(t => t.title),
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate questions per topic using Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;

    let totalQuestionsCreated = 0;
    let completedTopicCount = 0;

    for (const { dbTopic, analysisTopic } of topicMatches) {
      completedTopicCount++;
      
      // Update job progress
      if (jobId) {
        await supabase
          .from("material_jobs")
          .update({
            completed_topics: completedTopicCount,
            current_item: dbTopic.title,
            progress_message: `Generating questions for topic ${completedTopicCount} of ${topicMatches.length}: ${dbTopic.title}`,
          })
          .eq("id", jobId);
      }
      const topicObjectives =
        objectives?.filter((o) => o.topic_id === dbTopic.id).map((o) => o.objective_text) || [];
      const allObjectives = [...topicObjectives, ...(analysisTopic?.objectives || [])];

      // Build enriched context for this topic
      let enrichedContext = "";

      if (analysisTopic) {
        // Key terms context
        if (analysisTopic.key_terms && analysisTopic.key_terms.length > 0) {
          enrichedContext += "\nKEY TERMS:\n";
          enrichedContext += analysisTopic.key_terms
            .map((kt) => `- ${kt.term}: ${kt.definition}`)
            .join("\n");
        }

        // Formulas context
        if (analysisTopic.formulas && analysisTopic.formulas.length > 0) {
          enrichedContext += "\nFORMULAS:\n";
          enrichedContext += analysisTopic.formulas
            .map((f) => `- ${f.name}: ${f.expression} (${f.context})`)
            .join("\n");
        }

        // Canonical formulas (exact expressions)
        if (analysisTopic.canonical_formulas && analysisTopic.canonical_formulas.length > 0) {
          enrichedContext += "\nCANONICAL FORMULAS (exact expressions with precise symbols):\n";
          enrichedContext += analysisTopic.canonical_formulas
            .map((f) => `- ${f.name}: ${f.expression} [Page ${f.page_ref}]`)
            .join("\n");
        }

        // Worked examples (problem-ready facts)
        if (analysisTopic.worked_examples && analysisTopic.worked_examples.length > 0) {
          enrichedContext += "\nWORKED EXAMPLES (use these concrete numbers and steps):\n";
          enrichedContext += analysisTopic.worked_examples
            .map((we) => {
              return `Example: ${we.prompt}\nGiven: ${we.given.join(", ")}\nSteps: ${we.steps.join(" → ")}\nAnswer: ${we.answer} [Page ${we.page_ref}]`;
            })
            .join("\n\n");
        }

        // Tables (structured data)
        if (analysisTopic.tables && analysisTopic.tables.length > 0) {
          enrichedContext += "\nTABLES (use exact values from these):\n";
          enrichedContext += analysisTopic.tables
            .map((t) => {
              const header = `${t.title} [Page ${t.page_ref}]:\n${t.columns.join(" | ")}\n`;
              const rows = t.rows.map((r) => r.join(" | ")).join("\n");
              return header + rows;
            })
            .join("\n\n");
        }

        // Common misconceptions (use as MCQ distractors)
        if (analysisTopic.common_misconceptions && analysisTopic.common_misconceptions.length > 0) {
          enrichedContext += "\nCOMMON MISCONCEPTIONS (use these to create distractors for MCQs):\n";
          enrichedContext += analysisTopic.common_misconceptions
            .map((m) => `- Students often think: "${m.description}" but actually: "${m.correct_concept}"`)
            .join("\n");
        }

        // Example questions as seeds
        if (analysisTopic.example_questions && analysisTopic.example_questions.length > 0) {
          enrichedContext += "\nEXAMPLE QUESTION SEEDS (rephrase, don't copy verbatim):\n";
          enrichedContext += analysisTopic.example_questions
            .map((eq, idx) => {
              const base = `[${idx}] [${eq.type}, difficulty ${eq.difficulty}, objective ${eq.objective_index}] ${eq.stem}`;
              if (eq.choices && eq.choices.length > 0) {
                return base + `\nChoices: ${eq.choices.join(", ")}\nCorrect: ${eq.correct_choice_index}`;
              }
              return base + `\nAnswer: ${eq.final_answer}`;
            })
            .join("\n\n");
        }

        // Chunk summaries for grounded context
        if (analysisTopic.supporting_chunks && analysis.chunk_summaries.length > 0) {
          const relevantChunks = analysis.chunk_summaries.filter((cs) =>
            analysisTopic.supporting_chunks!.includes(cs.chunk_index),
          );
          if (relevantChunks.length > 0) {
            enrichedContext += "\nSOURCE MATERIAL CONTEXT:\n";
            enrichedContext += relevantChunks.map((cs) => `[Page ${cs.chunk_index + 1}] ${cs.summary}`).join("\n");
          }
        }

        // Difficulty signals for calibration
        if (analysisTopic.difficulty_signals && analysisTopic.difficulty_signals.length > 0) {
          enrichedContext += `\nDIFFICULTY SIGNALS: ${analysisTopic.difficulty_signals.join("; ")}`;
        }
      }

      // Request ~150% of desired count to account for rejection in judge pass
      const candidateCount = Math.ceil(quantityPerBucket * PIPELINE_CONFIG.OVERGENERATE_FACTOR);

      const topicPrompt = `You are generating practice questions for a specific topic.

TOPIC: ${dbTopic.title}
DESCRIPTION: ${dbTopic.description || analysisTopic?.description || "N/A"}

LEARNING OBJECTIVES:
${allObjectives.length > 0 ? allObjectives.map((o, idx) => `[${idx}] ${o}`).join("\n") : "- General understanding of the topic"}
${enrichedContext}

Generate ${candidateCount} candidate questions. Some may be filtered out by a quality judge, so generate more than needed.

QUESTION TYPE DISTRIBUTION (CRITICAL - MCQ FIRST):
- 80-90% must be mcq_single (standard 4-choice MCQ)
- mcq_multi ONLY for "select all that apply" concepts where multiple answers are genuinely correct
- short_answer ONLY for formula derivations / proofs where MCQ would trivialize the question
- The "type" field replaces "answer_format". Valid values: "mcq_single", "mcq_multi", "short_answer"

DIFFICULTY DISTRIBUTION TARGET:
- ~40% easy (difficulty 1-2)
- ~40% medium (difficulty 3)
- ~20% hard (difficulty 4-5)

QUALITY RUBRIC (CRITICAL):
1. Each question must test exactly ONE objective:
   - Include "objective_index" pointing to the objective it tests (0-based index from LEARNING OBJECTIVES above)
   - Do NOT create multi-skill mashups

2. Must be solvable from provided material:
   - Use concrete numbers/examples from worked_examples and tables when available
   - Use exact formulas from canonical_formulas
   - Do NOT require outside facts not in the material

3. MCQ requirements (if type is "mcq_single"):
   - Exactly 4 choices (A, B, C, D)
   - Exactly one correct choice
   - Include "correct_choice_index" (0-3)
   - Include "distractor_rationales" mapping each wrong choice to a misconception
   - Distractors must map to misconceptions from COMMON MISCONCEPTIONS above

4. Difficulty operationalization:
   - 1: Single-step recall or definition. No computation. Direct application of a single concept.
   - 2: Two-step process. Simple substitution into formula. Basic algebraic manipulation.
   - 3: Multi-step reasoning. Requires combining 2-3 concepts. Moderate algebraic work.
   - 4: Complex multi-step. Conditional reasoning. Requires synthesis of multiple concepts. Advanced algebra.
   - 5: Novel problem-solving. Requires creative application. Proof or derivation. Multiple solution paths.
   - Difficulty MUST match the number of steps and complexity described above

5. Anti-bad-question rules (BAN these):
   - Vague stems ("Which is correct?" with missing context)
   - Trick wording or gotcha questions
   - Questions that can't be answered without the slide image (must be solvable from text)
   - Multi-skill mashups (one question testing multiple unrelated objectives)
   - MCQ with multiple correct choices (unless explicitly mcq_multi)
   - Questions requiring outside knowledge not in the material
   - Definition-only questions unless the objective explicitly requires "define" or "identify"

6. Required fields for each question:
   - stem: Clear, unambiguous question text. Define all symbols. Specify rounding if numeric.
   - type: "mcq_single", "mcq_multi", or "short_answer"
   - solution_steps: 3-8 bullet steps showing how to solve
   - correct_answer: The correct answer
   - source_refs: Include supporting_chunks and page_refs from the material
   - why_this_question: One sentence linking this question to specific material content
   - For MCQs: choices array with exactly 4 items, correct_choice_index, distractor_rationales

RULES:
- Difficulty range: ${difficultyRange[0]}-${difficultyRange[1]}
- topic_title MUST be exactly: "${dbTopic.title}"
- Keep solutions concise (under 100 words each)
- Keep hints short (one sentence each)
- Questions MUST be grounded in the material context provided above
- Use worked_examples' concrete numbers and steps when available
- Use tables' exact values when available
- Use canonical_formulas' exact expressions when available

CRITICAL: Your response MUST be complete valid JSON. Do not truncate.

Return this exact JSON structure:
${CANDIDATE_SCHEMA}`;

      console.log(`Generating questions for topic: ${dbTopic.title}`);

      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: topicPrompt }] }],
            generationConfig: {
              temperature: PIPELINE_CONFIG.TEMP_GENERATE,
              maxOutputTokens: 16384,
              response_mime_type: "application/json",
            },
          }),
        });

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          console.error(`Gemini error for topic "${dbTopic.title}":`, errorText);
          continue;
        }

        const geminiResult = await geminiResponse.json();
        const responseText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!responseText) {
          console.error(`Empty Gemini response for topic "${dbTopic.title}"`);
          continue;
        }

        let generatedData: { questions: Array<Record<string, unknown>> };
        try {
          const cleanedText = responseText.replace(/```json\n?|\n?```/g, "").trim();
          generatedData = JSON.parse(cleanedText);
        } catch {
          console.error(`Failed to parse Gemini response for topic "${dbTopic.title}"`);
          continue;
        }

        if (!generatedData.questions || !Array.isArray(generatedData.questions)) continue;

        console.log(`Stage A complete: ${generatedData.questions.length} candidates for "${dbTopic.title}"`);

        // ========== STAGE B: Quality Judge with Rejection ==========
        const kept: Array<{ question: Record<string, unknown>; judgeData: JudgeResult }> = [];
        const toRepair: Array<{ question: Record<string, unknown>; judgeData: JudgeResult }> = [];
        let rejectedCount = 0;

        try {
          const judgePrompt = `You are a strict quality judge for practice questions. Score each question on 6 dimensions.

BINARY DIMENSIONS (0 = fail, 1 = pass):
- answerable_from_context: Can a student answer this using ONLY the provided material? (0 if requires outside knowledge)
- has_single_clear_correct: Is there exactly one unambiguous correct answer? (0 if ambiguous or multiple correct)
- format_justified: Is the chosen format (mcq_single/mcq_multi/short_answer) the best format for this question? (0 if MCQ trivializes it, or short_answer used where MCQ is better)

LIKERT DIMENSIONS (1-5 scale):
- distractors_plausible: For MCQs, are wrong choices based on real misconceptions? (5 = maps to common errors; 1 = obviously wrong). Rate 3 for short_answer.
- clarity: Is the stem clear, unambiguous, all symbols defined? (5 = crystal clear; 1 = confusing)
- difficulty_appropriate: Does the stated difficulty match actual complexity? (5 = perfect match; 1 = way off)

VERDICT RULES (you MUST follow these exactly):
- "keep": ALL binary = 1 AND average Likert >= 3.5
- "repair": At least 2 binary = 1 AND average Likert >= 2.0
- "reject": Everything else

LEARNING OBJECTIVES:
${allObjectives.length > 0 ? allObjectives.map((o, idx) => `[${idx}] ${o}`).join("\n") : "- General understanding"}

GENERATED QUESTIONS:
${JSON.stringify(generatedData.questions, null, 2)}

For each question, output ALL 6 dimension scores, the verdict, and a list of specific issues.
Return ONLY valid JSON matching this schema:
${JUDGE_V2_SCHEMA}`;

          const judgeResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: judgePrompt }] }],
              generationConfig: {
                temperature: PIPELINE_CONFIG.TEMP_JUDGE,
                maxOutputTokens: 8192,
                response_mime_type: "application/json",
              },
            }),
          });

          if (judgeResponse.ok) {
            const judgeResult = await judgeResponse.json();
            const judgeText = judgeResult.candidates?.[0]?.content?.parts?.[0]?.text;
            if (judgeText) {
              const cleanedJudgeText = judgeText.replace(/```json\n?|\n?```/g, "").trim();
              const judgeData = JSON.parse(cleanedJudgeText) as { judged_questions: JudgeResult[] };

              if (judgeData.judged_questions) {
                for (const judged of judgeData.judged_questions) {
                  const idx = judged.original_index;
                  if (idx < 0 || idx >= generatedData.questions.length) continue;

                  const question = generatedData.questions[idx];
                  const binary = judged.binary || { answerable_from_context: 0, has_single_clear_correct: 0, format_justified: 0 };
                  const likert = judged.likert || { distractors_plausible: 1, clarity: 1, difficulty_appropriate: 1 };
                  const score = computeTotalScore(binary, likert);

                  // Override LLM verdict with numeric score
                  const finalVerdict = resolveVerdict(judged.verdict, score);
                  const result: JudgeResult = { ...judged, binary, likert, verdict: finalVerdict };

                  if (finalVerdict === "keep") {
                    kept.push({ question, judgeData: result });
                  } else if (finalVerdict === "repair") {
                    toRepair.push({ question, judgeData: result });
                  } else {
                    rejectedCount++;
                  }
                }
              }
            }
          } else {
            // Judge call failed — treat all candidates as kept with default scores
            console.warn(`Judge API failed for "${dbTopic.title}", keeping all candidates`);
            for (const question of generatedData.questions) {
              kept.push({
                question,
                judgeData: {
                  original_index: 0,
                  binary: { answerable_from_context: 1, has_single_clear_correct: 1, format_justified: 1 },
                  likert: { distractors_plausible: 3, clarity: 3, difficulty_appropriate: 3 },
                  verdict: "keep",
                  issues: ["judge_pass_skipped"],
                },
              });
            }
          }
        } catch (judgeError) {
          console.warn(`Judge pass failed for topic "${dbTopic.title}":`, judgeError);
          // Fallback: keep all candidates with default scores
          for (const question of generatedData.questions) {
            kept.push({
              question,
              judgeData: {
                original_index: 0,
                binary: { answerable_from_context: 1, has_single_clear_correct: 1, format_justified: 1 },
                likert: { distractors_plausible: 3, clarity: 3, difficulty_appropriate: 3 },
                verdict: "keep",
                issues: ["judge_pass_skipped"],
              },
            });
          }
        }

        console.log(`Stage B complete: ${kept.length} kept, ${toRepair.length} to repair, ${rejectedCount} rejected`);

        // ========== STAGE C: Repair Pass ==========
        const repaired: Array<{ question: Record<string, unknown>; judgeData: JudgeResult; wasRepaired: true }> = [];

        if (toRepair.length > 0) {
          try {
            const repairInstructions = toRepair.map((item, i) => {
              const issues = item.judgeData.issues.join("; ");
              const formatFailed = item.judgeData.binary.format_justified === 0;
              const qType = (item.question.type as string) || "mcq_single";
              let instruction = `[${i}] Issues: ${issues}`;
              if (formatFailed && qType === "short_answer") {
                instruction += "\n  ACTION: Convert to mcq_single with 4 choices based on common misconceptions.";
              }
              if (item.judgeData.likert.clarity < 3) {
                instruction += "\n  ACTION: Tighten stem wording, define all symbols, remove ambiguity.";
              }
              if (item.judgeData.likert.distractors_plausible < 3) {
                instruction += "\n  ACTION: Replace weak distractors with misconception-based options.";
              }
              return instruction;
            }).join("\n\n");

            const repairPrompt = `You are repairing practice questions that failed quality review.
Fix ONLY the specific issues listed for each question. Preserve topic_title, objective_index, source_refs, and difficulty.

QUESTIONS TO REPAIR:
${JSON.stringify(toRepair.map(r => r.question), null, 2)}

REPAIR INSTRUCTIONS:
${repairInstructions}

RULES:
- If converting short_answer to mcq_single: add exactly 4 choices, set correct_choice_index, add distractor_rationales
- type must be one of: "mcq_single", "mcq_multi", "short_answer"
- Preserve all fields not mentioned in the repair instructions
- Each repaired question must have: stem (>10 chars), solution_steps (non-empty array), correct_answer
- For mcq_single: exactly 4 choices and a valid correct_choice_index (0-3)

Return the repaired questions in this JSON structure:
{
  "repaired_questions": [
    { ...full question object with repairs applied... }
  ]
}`;

            const repairResponse = await fetch(geminiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: repairPrompt }] }],
                generationConfig: {
                  temperature: PIPELINE_CONFIG.TEMP_REPAIR,
                  maxOutputTokens: 16384,
                  response_mime_type: "application/json",
                },
              }),
            });

            if (repairResponse.ok) {
              const repairResult = await repairResponse.json();
              const repairText = repairResult.candidates?.[0]?.content?.parts?.[0]?.text;
              if (repairText) {
                const cleanedRepairText = repairText.replace(/```json\n?|\n?```/g, "").trim();
                const repairData = JSON.parse(cleanedRepairText) as {
                  repaired_questions: Array<Record<string, unknown>>;
                };

                if (repairData.repaired_questions) {
                  for (let i = 0; i < repairData.repaired_questions.length; i++) {
                    const rq = repairData.repaired_questions[i];
                    const originalJudge = toRepair[i]?.judgeData;

                    // Structural re-validation (not a full re-judge)
                    const stem = rq.stem as string;
                    const solutionSteps = rq.solution_steps as string[];
                    const qType = (rq.type as string) || "mcq_single";
                    const choices = rq.choices as string[] | undefined;
                    const correctIdx = rq.correct_choice_index as number | undefined;

                    const stemOk = stem && stem.length > 10;
                    const stepsOk = Array.isArray(solutionSteps) && solutionSteps.length > 0;
                    const mcqOk = qType !== "mcq_single" || (
                      Array.isArray(choices) && choices.length === 4 &&
                      typeof correctIdx === "number" && correctIdx >= 0 && correctIdx <= 3
                    );

                    if (stemOk && stepsOk && mcqOk && originalJudge) {
                      repaired.push({ question: rq, judgeData: originalJudge, wasRepaired: true });
                    } else {
                      rejectedCount++;
                      console.log(`Repaired question ${i} failed structural validation, rejecting`);
                    }
                  }
                }
              }
            }
          } catch (repairError) {
            console.warn(`Repair pass failed for topic "${dbTopic.title}":`, repairError);
            rejectedCount += toRepair.length;
          }
        }

        console.log(`Stage C complete: ${repaired.length} repaired, ${rejectedCount} total rejected`);

        // ========== Combine, sort, cap, and insert ==========
        const allScoredQuestions = [
          ...kept.map(k => ({ ...k, wasRepaired: false as const })),
          ...repaired,
        ];

        // Sort by score descending, cap at MAX_QUESTIONS_PER_TOPIC
        allScoredQuestions.sort((a, b) => {
          const scoreA = computeTotalScore(a.judgeData.binary, a.judgeData.likert);
          const scoreB = computeTotalScore(b.judgeData.binary, b.judgeData.likert);
          return scoreB - scoreA;
        });

        const finalQuestions = allScoredQuestions.slice(0, PIPELINE_CONFIG.MAX_QUESTIONS_PER_TOPIC);

        for (const { question: q, judgeData, wasRepaired } of finalQuestions) {
          // Map new type field to DB question_format
          const qType = (q.type as string) || "mcq_single";
          const questionFormat = qType === "short_answer" ? "short_answer" : "multiple_choice";

          // Handle choices
          const choicesArray = (q.choices as string[]) || [];
          const correctChoiceIndex = (q.correct_choice_index as number) ??
            ((q.correct_answer as string)?.toUpperCase().charCodeAt(0) - 65);

          const choices = choicesArray.length > 0
            ? choicesArray.map((text: string, idx: number) => ({
                id: String.fromCharCode(65 + idx),
                text: text.replace(/^[A-D]\)\s*/, ""),
                isCorrect: idx === correctChoiceIndex,
              }))
            : null;

          // Use correct_answer (v3 primary field), fall back to final_answer for compat
          const finalAnswer = (q.correct_answer as string) || (q.final_answer as string) || "";
          const solutionSteps = (q.solution_steps as string[]) || (q.hints as string[]) || [];

          // Compute quality metadata
          const qualityScore = computeTotalScore(judgeData.binary, judgeData.likert);
          const qualityFlags = {
            answerable_from_context: judgeData.binary.answerable_from_context,
            has_single_clear_correct: judgeData.binary.has_single_clear_correct,
            format_justified: judgeData.binary.format_justified,
            distractors_plausible: judgeData.likert.distractors_plausible,
            clarity: judgeData.likert.clarity,
            difficulty_appropriate: judgeData.likert.difficulty_appropriate,
            issues: judgeData.issues,
            pipeline_version: 3,
            was_repaired: wasRepaired,
          };

          const { error: insertError } = await supabase.from("questions").insert({
            course_pack_id: material.course_pack_id,
            topic_ids: [dbTopic.id],
            prompt: q.stem,
            choices: choices,
            correct_answer: finalAnswer,
            question_format: questionFormat,
            difficulty: (q.difficulty as number) || 3,
            hint: (q.hints as string[])?.[0] || null,
            solution_steps: solutionSteps,
            full_solution: (q.full_solution as string) || solutionSteps.join("\n"),
            common_mistakes: (q.common_mistakes as string[]) || [],
            tags: (q.tags as string[]) || [],
            source: "generated",
            source_material_id: materialId,
            status: "draft",
            is_published: false,
            needs_review: true,
            quality_score: qualityScore,
            quality_flags: qualityFlags,
          });

          if (insertError) {
            console.error("Error inserting question:", insertError);
          } else {
            totalQuestionsCreated++;
          }
        }

        // Update job progress with pipeline stats
        if (jobId) {
          await supabase
            .from("material_jobs")
            .update({
              total_questions: totalQuestionsCreated,
              completed_questions: totalQuestionsCreated,
              progress_message: `Topic "${dbTopic.title}": ${kept.length} kept, ${repaired.length} repaired, ${rejectedCount} rejected. Total so far: ${totalQuestionsCreated}`,
            })
            .eq("id", jobId);
        }
      } catch (topicError) {
        console.error(`Error generating questions for topic "${dbTopic.title}":`, topicError);
        continue;
      }
    }

    // Update material status
    await supabase
      .from("course_materials")
      .update({
        status: "ready",
        questions_generated_count: totalQuestionsCreated,
        error_message: null,
      })
      .eq("id", materialId);

    // Update job to completed
    if (jobId) {
      await supabase
        .from("material_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_topics: topicMatches.length,
          total_questions: totalQuestionsCreated,
          completed_questions: totalQuestionsCreated,
          progress_message: `Generation complete! Created ${totalQuestionsCreated} questions from ${topicMatches.length} topics.`,
        })
        .eq("id", jobId);
    }

    console.log(`Created ${totalQuestionsCreated} questions as drafts across ${topicMatches.length} topics`);

    return new Response(
      JSON.stringify({
        success: true,
        questionsGenerated: totalQuestionsCreated,
        topicsMatched: topicMatches.filter((m) => m.analysisTopic).length,
        topicsTotal: topics.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in generate-questions:", error);

    // Try to update job to failed
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
