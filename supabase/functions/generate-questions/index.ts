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
  common_misconceptions?: Array<{ description: string; correct_concept: string }>;
  example_questions?: Array<{ stem: string; expected_answer_type: string; difficulty: number }>;
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
      common_misconceptions: [],
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
      "full_solution": "Step-by-step solution explanation",
      "hints": ["Hint 1 (general)", "Hint 2 (more specific)", "Hint 3 (almost gives away answer)"],
      "common_mistakes": ["Common mistake 1", "Common mistake 2"],
      "tags": ["tag1", "tag2"],
      "difficulty": 1-5
    }
  ]
}`;

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { materialId, topicIds, questionTypeIds, difficultyRange = [1, 5], quantityPerBucket = 3 } = await req.json();

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
    const topicMatches: Array<{ dbTopic: DbTopic; analysisTopic: AnalysisTopicV2 | null }> = topics.map((t) => ({
      dbTopic: t as DbTopic,
      analysisTopic: matchAnalysisTopic(t as DbTopic, analysis.topics),
    }));

    console.log(
      `Topic matching: ${topicMatches.filter((m) => m.analysisTopic).length}/${topics.length} matched`,
    );

    // Generate questions per topic using Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;

    let totalQuestionsCreated = 0;

    for (const { dbTopic, analysisTopic } of topicMatches) {
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
            .map((eq) => `- [${eq.expected_answer_type}, difficulty ${eq.difficulty}] ${eq.stem}`)
            .join("\n");
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
${allObjectives.length > 0 ? allObjectives.map((o) => `- ${o}`).join("\n") : "- General understanding of the topic"}
${enrichedContext}

${quantityInstructions}

RULES:
- Difficulty range: ${difficultyRange[0]}-${difficultyRange[1]} (1=easy, 5=hard)
- Allowed types: ${typesList}
- Each question needs: stem, 4 MCQ choices (A-D) for MCQs, correct answer, step-by-step solution, 3 hints, 2 common mistakes, tags, difficulty
- topic_title MUST be exactly: "${dbTopic.title}"
- Keep solutions concise (under 100 words each)
- Keep hints short (one sentence each)
- Questions MUST be grounded in the material context provided above
- For MCQs: use misconceptions as distractors when available
- For computation: use formulas and require actual calculation steps

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

        // Insert questions with correct topic_id
        for (const q of generatedData.questions) {
          const choices =
            (q.choices as string[])?.map((text: string, idx: number) => ({
              id: String.fromCharCode(65 + idx),
              text: text.replace(/^[A-D]\)\s*/, ""),
              isCorrect: (q.correct_answer as string)?.toUpperCase().startsWith(String.fromCharCode(65 + idx)),
            })) || null;

          const answerFormat = (q.answer_format as string) || "mcq";
          const questionFormat =
            answerFormat === "mcq" ? "multiple_choice" : answerFormat === "numeric" ? "numeric" : "short_answer";

          const { error: insertError } = await supabase.from("questions").insert({
            course_pack_id: material.course_pack_id,
            topic_ids: [dbTopic.id],
            prompt: q.stem,
            choices: choices,
            correct_answer: q.correct_answer,
            question_format: questionFormat,
            difficulty: (q.difficulty as number) || 3,
            hint: (q.hints as string[])?.[0] || null,
            solution_steps: (q.hints as string[]) || [],
            full_solution: q.full_solution,
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

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
