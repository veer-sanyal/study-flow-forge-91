import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Material analysis schema for Gemini
const ANALYSIS_SCHEMA = `{
  "course_guess": {
    "course_code": "string or null",
    "confidence": 0-1,
    "signals": ["array of signals that led to this guess"]
  },
  "topics": [
    {
      "topic_code": "string like '2.1' if present in material, else null",
      "title": "topic title",
      "description": "short description of the topic",
      "difficulty_estimate": 1-5,
      "recommended_question_types": ["conceptual", "computation", "mcq", "short_answer"],
      "objectives": ["learning objective 1", "learning objective 2"],
      "prerequisites": ["topic title or code that should be learned first"],
      "supporting_chunks": [0, 1, 2]
    }
  ]
}`;

interface MaterialChunk {
  index: number;
  type: "page" | "slide";
  text: string;
  title_hint?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { materialId } = await req.json();

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

    // Convert to base64 for Gemini using chunked approach to avoid stack overflow
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Process in chunks to avoid "Maximum call stack size exceeded" error
    const CHUNK_SIZE = 32768; // 32KB chunks
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

    // Call Gemini for analysis - use gemini-3-flash-preview model
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;

    const analysisPrompt = `You are analyzing course lecture material to extract topics and learning objectives.

Analyze this document and extract:
1. The course code/name if identifiable from the content
2. All distinct topics covered, with:
   - A topic code (like "2.1", "3.2") if visible in the material, otherwise null
   - A clear title
   - A short description
   - Estimated difficulty (1-5)
   - Recommended question types for testing this topic
   - 2-6 specific learning objectives (what students should be able to do)
   - Any prerequisite topics
   - Which page/slide numbers cover this topic (0-indexed)

IMPORTANT RULES:
1. Output ONLY valid JSON matching this exact schema:
${ANALYSIS_SCHEMA}

2. Focus on substantive academic topics, not meta-content like "syllabus" or "course overview"
3. Learning objectives should be specific and measurable (use action verbs like "calculate", "explain", "compare")
4. Difficulty estimates: 1=introductory, 3=intermediate, 5=advanced
5. Be thorough - extract ALL topics you can identify

Analyze the document now:`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: analysisPrompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          response_mime_type: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);

      await supabase
        .from("course_materials")
        .update({ status: "failed", error_message: `Gemini API error: ${geminiResponse.status}` })
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
        .update({ status: "failed", error_message: "No response from Gemini" })
        .eq("id", materialId);

      return new Response(JSON.stringify({ error: "No response from Gemini" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the analysis JSON
    let analysis;
    try {
      // Clean up potential markdown code blocks
      const cleanedText = responseText.replace(/```json\n?|\n?```/g, "").trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", responseText);

      await supabase
        .from("course_materials")
        .update({ status: "failed", error_message: "Failed to parse analysis JSON" })
        .eq("id", materialId);

      return new Response(JSON.stringify({ error: "Failed to parse analysis", raw: responseText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analysis complete: ${analysis.topics?.length || 0} topics extracted`);

    // Store analysis and create topics/objectives
    const topicsToCreate = [];
    const objectivesToCreate = [];

    if (analysis.topics && Array.isArray(analysis.topics)) {
      for (const topic of analysis.topics) {
        // Check if topic already exists for this course
        const { data: existingTopic } = await supabase
          .from("topics")
          .select("id")
          .eq("course_pack_id", material.course_pack_id)
          .eq("title", topic.title)
          .maybeSingle();

        let topicId = existingTopic?.id;

        if (!topicId) {
          // Create new topic
          const { data: newTopic, error: topicError } = await supabase
            .from("topics")
            .insert({
              course_pack_id: material.course_pack_id,
              edition_id: material.edition_id,
              title: topic.title,
              description: topic.description,
              topic_code: topic.topic_code,
              source: "lecture",
            })
            .select("id")
            .single();

          if (topicError) {
            console.error("Error creating topic:", topicError);
            continue;
          }
          topicId = newTopic.id;
          topicsToCreate.push(topic.title);
        }

        // Create objectives for this topic
        if (topic.objectives && Array.isArray(topic.objectives)) {
          for (const objectiveText of topic.objectives) {
            // Check if objective already exists
            const { data: existingObj } = await supabase
              .from("objectives")
              .select("id")
              .eq("topic_id", topicId)
              .eq("objective_text", objectiveText)
              .maybeSingle();

            if (!existingObj) {
              await supabase.from("objectives").insert({
                topic_id: topicId,
                objective_text: objectiveText,
                source_material_id: materialId,
              });
              objectivesToCreate.push(objectiveText);
            }
          }
        }
      }
    }

    // Update material with analysis results
    await supabase
      .from("course_materials")
      .update({
        status: "analyzed",
        analysis_json: analysis,
        topics_extracted_count: topicsToCreate.length,
        error_message: null,
      })
      .eq("id", materialId);

    console.log(`Created ${topicsToCreate.length} topics and ${objectivesToCreate.length} objectives`);

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        topicsCreated: topicsToCreate.length,
        objectivesCreated: objectivesToCreate.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in analyze-material:", error);

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
