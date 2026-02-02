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

// ---------- Question Schema ----------

const QUESTION_SCHEMA = `{
  "questions": [
    {
      "stem": "The question text",
      "topic_title": "The topic this question belongs to",
      "answer_format": "mcq|numeric|short|multi_select",
      "choices": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
      "correct_answer": "The correct answer (letter for MCQ, value for numeric/short)",
      "correct_choice_index": 0,
      "full_solution": "Step-by-step solution explanation",
      "solution_steps": ["Step 1", "Step 2", "Step 3"],
      "hints": ["Hint 1 (general)", "Hint 2 (more specific)", "Hint 3 (almost gives away answer)"],
      "common_mistakes": ["Common mistake 1", "Common mistake 2"],
      "distractor_rationales": {"0": "why this is wrong", "1": "why this is wrong", "2": "why this is wrong"},
      "tags": ["tag1", "tag2"],
      "difficulty": 1-5,
      "objective_index": 0,
      "source_refs": {"supporting_chunks": [29, 30], "page_refs": [29]}
    }
  ]
}`;

const JUDGE_SCHEMA = `{
  "judged_questions": [
    {
      "original_index": 0,
      "score": 1-5,
      "scores": {
        "alignment": 1-5,
        "clarity": 1-5,
        "solvability_from_material": 1-5,
        "correctness": 1-5,
        "distractor_quality": 1-5
      },
      "issues": ["issue 1", "issue 2"],
      "rewritten_question": {
        "stem": "improved question text",
        "choices": ["A) Option A", "B) Option B", "C) Option C", "D) Option D"],
        "correct_answer": "correct answer",
        "full_solution": "improved solution",
        "solution_steps": ["Step 1", "Step 2"]
      }
    }
  ]
}`;

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
    const typesList = questionTypes?.map((qt) => qt.name).join(", ") || "multiple choice, short answer, conceptual";

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

      // Determine quantity per type from distribution
      let quantityInstructions = `Generate ${quantityPerBucket} questions.`;
      const dist = analysisTopic?.question_type_distribution || [];
      if (dist.length > 0) {
        const typeQuantities = dist
          .map((d) => {
            const count = Math.max(1, Math.round(quantityPerBucket * d.proportion));
            return `${count} ${d.type}`;
          })
          .join(", ");
        quantityInstructions = `Generate approximately: ${typeQuantities} (total ~${quantityPerBucket}).`;
      }

      const topicPrompt = `You are generating practice questions for a specific topic.

TOPIC: ${dbTopic.title}
DESCRIPTION: ${dbTopic.description || analysisTopic?.description || "N/A"}

LEARNING OBJECTIVES:
${allObjectives.length > 0 ? allObjectives.map((o, idx) => `[${idx}] ${o}`).join("\n") : "- General understanding of the topic"}
${enrichedContext}

${quantityInstructions}

QUALITY RUBRIC (CRITICAL):
1. Each question must test exactly ONE objective:
   - Include "objective_index" pointing to the objective it tests (0-based index from LEARNING OBJECTIVES above)
   - Do NOT create multi-skill mashups

2. Must be solvable from provided material:
   - Use concrete numbers/examples from worked_examples and tables when available
   - Use exact formulas from canonical_formulas
   - Do NOT require outside facts not in the material

3. MCQ requirements (if answer_format is "mcq"):
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
   - MCQ with multiple correct choices (unless explicitly multi_select)
   - Questions requiring outside knowledge not in the material
   - Definition-only questions unless the objective explicitly requires "define" or "identify"

6. Required fields for each question:
   - stem: Clear, unambiguous question text. Define all symbols. Specify rounding if numeric.
   - solution_steps: 3-8 bullet steps showing how to solve
   - final_answer: The correct answer (use this field, not just correct_answer)
   - source_refs: Include supporting_chunks and page_refs from the material
   - For MCQs: choices array with exactly 4 items, correct_choice_index, distractor_rationales

RULES:
- Difficulty range: ${difficultyRange[0]}-${difficultyRange[1]}
- Allowed types: ${typesList}
- topic_title MUST be exactly: "${dbTopic.title}"
- Keep solutions concise (under 100 words each)
- Keep hints short (one sentence each)
- Questions MUST be grounded in the material context provided above
- Use worked_examples' concrete numbers and steps when available
- Use tables' exact values when available
- Use canonical_formulas' exact expressions when available

CRITICAL: Your response MUST be complete valid JSON. Do not truncate.

Return this exact JSON structure:
${QUESTION_SCHEMA}`;

      console.log(`Generating questions for topic: ${dbTopic.title}`);

      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: topicPrompt }] }],
            generationConfig: {
              temperature: 0.6,
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

        // Judge pass: Score and rewrite questions scoring <4
        let questionsToInsert = generatedData.questions;
        try {
          const judgePrompt = `You are a quality judge for practice questions. Score each question 1-5 on:
- alignment: Does it test exactly one objective from the list?
- clarity: Is the stem clear and unambiguous?
- solvability_from_material: Can it be solved using only the provided material?
- correctness: Is the answer and solution correct?
- distractor_quality: For MCQs, are distractors meaningful and map to misconceptions?

LEARNING OBJECTIVES:
${allObjectives.length > 0 ? allObjectives.map((o, idx) => `[${idx}] ${o}`).join("\n") : "- General understanding"}

GENERATED QUESTIONS:
${JSON.stringify(generatedData.questions, null, 2)}

RULES:
- Score each question 1-5 on each dimension (alignment, clarity, solvability_from_material, correctness, distractor_quality)
- Overall score = average of all dimensions
- For any question with overall score < 4, provide a rewritten_question with improvements
- Keep rewritten questions in the same format as original
- Return ONLY valid JSON matching this schema:
${JUDGE_SCHEMA}`;

          const judgeResponse = await fetch(geminiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: judgePrompt }] }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 16384,
                response_mime_type: "application/json",
              },
            }),
          });

          if (judgeResponse.ok) {
            const judgeResult = await judgeResponse.json();
            const judgeText = judgeResult.candidates?.[0]?.content?.parts?.[0]?.text;
            if (judgeText) {
              try {
                const cleanedJudgeText = judgeText.replace(/```json\n?|\n?```/g, "").trim();
                const judgeData = JSON.parse(cleanedJudgeText) as { judged_questions: Array<{
                  original_index: number;
                  score: number;
                  scores: {
                    alignment: number;
                    clarity: number;
                    solvability_from_material: number;
                    correctness: number;
                    distractor_quality: number;
                  };
                  issues: string[];
                  rewritten_question?: Record<string, unknown>;
                }> };

                // Replace low-scoring questions with rewritten versions
                if (judgeData.judged_questions) {
                  for (const judged of judgeData.judged_questions) {
                    if (judged.score < 4 && judged.rewritten_question) {
                      const originalIdx = judged.original_index;
                      if (originalIdx >= 0 && originalIdx < questionsToInsert.length) {
                        // Merge rewritten question with original (preserve fields not in rewritten)
                        questionsToInsert[originalIdx] = {
                          ...questionsToInsert[originalIdx],
                          ...judged.rewritten_question,
                        };
                        console.log(`Rewrote question ${originalIdx} (score: ${judged.score.toFixed(2)})`);
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn(`Failed to parse judge response for topic "${dbTopic.title}":`, e);
                // Continue with original questions
              }
            }
          }
        } catch (judgeError) {
          console.warn(`Judge pass failed for topic "${dbTopic.title}":`, judgeError);
          // Continue with original questions
        }

        // Insert questions with correct topic_id
        for (const q of questionsToInsert) {
          // Handle choices - use correct_choice_index if available, otherwise infer from correct_answer
          const choicesArray = (q.choices as string[]) || [];
          const correctChoiceIndex = (q.correct_choice_index as number) ?? 
            (q.correct_answer as string)?.toUpperCase().charCodeAt(0) - 65;
          
          const choices = choicesArray.length > 0
            ? choicesArray.map((text: string, idx: number) => ({
                id: String.fromCharCode(65 + idx),
                text: text.replace(/^[A-D]\)\s*/, ""),
                isCorrect: idx === correctChoiceIndex,
              }))
            : null;

          const answerFormat = (q.answer_format as string) || "mcq";
          const questionFormat =
            answerFormat === "mcq" ? "multiple_choice" : answerFormat === "numeric" ? "numeric" : "short_answer";

          // Use final_answer if available, otherwise fall back to correct_answer
          const finalAnswer = (q.final_answer as string) || (q.correct_answer as string) || "";

          // Use solution_steps if available, otherwise fall back to hints
          const solutionSteps = (q.solution_steps as string[]) || (q.hints as string[]) || [];

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
          });

          if (insertError) {
            console.error("Error inserting question:", insertError);
          } else {
            totalQuestionsCreated++;
            
            // Update question count in job
            if (jobId) {
              const { data: currentJob } = await supabase
                .from("material_jobs")
                .select("total_questions, completed_questions")
                .eq("id", jobId)
                .single();
              
              if (currentJob) {
                await supabase
                  .from("material_jobs")
                  .update({
                    total_questions: Math.max((currentJob as any).total_questions || 0, totalQuestionsCreated),
                    completed_questions: totalQuestionsCreated,
                  })
                  .eq("id", jobId);
              }
            }
          }
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
