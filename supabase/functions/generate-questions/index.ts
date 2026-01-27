import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Question generation schema for Gemini
const QUESTION_SCHEMA = `{
  "questions": [
    {
      "stem": "The question text",
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

    // Get topics to generate for
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

    // Build context from analysis
    const analysisContext = material.analysis_json as {
      topics?: Array<{
        title: string;
        description: string;
        objectives: string[];
      }>;
    };

    // Generate questions using Gemini
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`;

    const topicsContext = topics
      .map((t) => {
        const analysedTopic = analysisContext.topics?.find((at) => at.title === t.title);
        const topicObjectives = objectives?.filter((o) => o.topic_id === t.id).map((o) => o.objective_text) || [];
        return `Topic: ${t.title}
Description: ${t.description || analysedTopic?.description || "N/A"}
Learning Objectives:
${[...topicObjectives, ...(analysedTopic?.objectives || [])].map((o) => `- ${o}`).join("\n")}`;
      })
      .join("\n\n");

    const generationPrompt = `You are a course question generator. Generate practice questions based on the following topics and learning objectives.

TOPICS AND OBJECTIVES:
${topicsContext}

REQUIREMENTS:
1. Generate ${quantityPerBucket} questions per topic
2. Difficulty range: ${difficultyRange[0]} to ${difficultyRange[1]} (1=easy, 5=hard)
3. Question types to include: ${typesList}
4. Each question must have:
   - Clear, unambiguous stem
   - 4 choices for MCQ (A, B, C, D)
   - Step-by-step solution
   - 3 progressive hints
   - 2+ common mistakes students make
   - Relevant tags

5. Questions should:
   - Test understanding, not just recall
   - Be appropriate for the difficulty level
   - Have plausible distractors for MCQ
   - Reference specific concepts from the objectives

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
${QUESTION_SCHEMA}

Generate the questions now:`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: generationPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 16384,
          response_mime_type: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);

      await supabase
        .from("course_materials")
        .update({ status: "analyzed", error_message: `Gemini API error: ${geminiResponse.status}` })
        .eq("id", materialId);

      return new Response(JSON.stringify({ error: "Gemini API error", details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiResult = await geminiResponse.json();
    const responseText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      await supabase
        .from("course_materials")
        .update({ status: "analyzed", error_message: "No response from Gemini" })
        .eq("id", materialId);

      return new Response(JSON.stringify({ error: "No response from Gemini" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the generated questions
    let generatedData;
    try {
      const cleanedText = responseText.replace(/```json\n?|\n?```/g, "").trim();
      generatedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", responseText);

      await supabase
        .from("course_materials")
        .update({ status: "analyzed", error_message: "Failed to parse generated questions" })
        .eq("id", materialId);

      return new Response(JSON.stringify({ error: "Failed to parse questions", raw: responseText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generated ${generatedData.questions?.length || 0} questions`);

    // Store generated questions as drafts
    let questionsCreated = 0;
    const defaultTopicId = topics[0]?.id;

    if (generatedData.questions && Array.isArray(generatedData.questions)) {
      for (const q of generatedData.questions) {
        // Format choices for storage
        const choices =
          q.choices?.map((text: string, idx: number) => ({
            id: String.fromCharCode(65 + idx), // A, B, C, D
            text: text.replace(/^[A-D]\)\s*/, ""), // Remove "A) " prefix if present
            isCorrect: q.correct_answer?.toUpperCase().startsWith(String.fromCharCode(65 + idx)),
          })) || null;

        // Determine answer format
        const answerFormat = q.answer_format || "mcq";
        const questionFormat =
          answerFormat === "mcq" ? "multiple_choice" : answerFormat === "numeric" ? "numeric" : "short_answer";

        // Insert question as draft
        const { error: insertError } = await supabase.from("questions").insert({
          course_pack_id: material.course_pack_id,
          topic_ids: [defaultTopicId],
          prompt: q.stem,
          choices: choices,
          correct_answer: q.correct_answer,
          question_format: questionFormat,
          difficulty: q.difficulty || 3,
          hint: q.hints?.[0] || null,
          solution_steps: q.hints || [],
          full_solution: q.full_solution,
          common_mistakes: q.common_mistakes || [],
          tags: q.tags || [],
          source: "generated",
          source_material_id: materialId,
          status: "draft",
          is_published: false,
          needs_review: true,
        });

        if (insertError) {
          console.error("Error inserting question:", insertError);
        } else {
          questionsCreated++;
        }
      }
    }

    // Update material status
    await supabase
      .from("course_materials")
      .update({
        status: "ready",
        questions_generated_count: questionsCreated,
        error_message: null,
      })
      .eq("id", materialId);

    console.log(`Created ${questionsCreated} questions as drafts`);

    return new Response(
      JSON.stringify({
        success: true,
        questionsGenerated: questionsCreated,
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
