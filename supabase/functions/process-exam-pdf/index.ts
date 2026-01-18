import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedQuestion {
  prompt: string;
  choices: { id: string; text: string; isCorrect: boolean }[];
  correctAnswer?: string;
  solutionSteps?: string[];
  hint?: string;
  difficulty?: number;
  topicSuggestions: string[];
  sourceExam: string;
}

interface ProcessingResult {
  questionsExtracted: number;
  questionsMapped: number;
  questionsPendingReview: number;
  questions: ExtractedQuestion[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get authorization header to verify admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Create a client with user's token for RLS checks
    const userSupabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { jobId } = await req.json();
    
    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing job: ${jobId}`);

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("ingestion_jobs")
      .select("*, course_packs(title)")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("Job not found:", jobError);
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update job status to processing
    await supabase
      .from("ingestion_jobs")
      .update({ status: "processing", current_step: "A1", progress_pct: 5 })
      .eq("id", jobId);

    // Step A1: Download PDF from storage
    console.log("Step A1: Downloading PDF...");
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("exam-pdfs")
      .download(job.file_path);

    if (downloadError || !pdfData) {
      console.error("Failed to download PDF:", downloadError);
      await supabase
        .from("ingestion_jobs")
        .update({ 
          status: "failed", 
          error_message: `Failed to download PDF: ${downloadError?.message}` 
        })
        .eq("id", jobId);
      
      return new Response(JSON.stringify({ error: "Failed to download PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("ingestion_jobs")
      .update({ current_step: "A2", progress_pct: 15 })
      .eq("id", jobId);

    // Step A2: Convert PDF to base64 for Gemini
    console.log("Step A2: Converting PDF to base64...");
    const arrayBuffer = await pdfData.arrayBuffer();
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Get existing topics for mapping
    const { data: existingTopics } = await supabase
      .from("topics")
      .select("id, title")
      .eq("course_pack_id", job.course_pack_id);

    const topicsList = existingTopics?.map(t => `- ${t.title} (ID: ${t.id})`).join("\n") || "No topics defined yet";

    await supabase
      .from("ingestion_jobs")
      .update({ current_step: "B1", progress_pct: 25 })
      .eq("id", jobId);

    // Step B1-B4: Call Gemini to extract questions
    console.log("Step B1-B4: Extracting questions with Gemini...");
    
    const extractionPrompt = `You are an expert at extracting exam questions from PDF documents.

Analyze this exam PDF and extract ALL questions with the following information for each:
1. The question prompt (preserve any mathematical notation using LaTeX)
2. Multiple choice options if present (with the correct answer marked)
3. The correct answer
4. Step-by-step solution if visible
5. A hint for students
6. Estimated difficulty (1-5 scale)
7. Topic suggestions from this list of ALLOWED topics:
${topicsList}

IMPORTANT RULES:
- Only suggest topics from the ALLOWED list above
- If you cannot map to an existing topic, provide your best suggestion for what the topic should be called
- Preserve all mathematical notation using LaTeX format (e.g., \\frac{a}{b}, \\sqrt{x})
- Extract the source exam name from the document header if visible

Return your response using the extract_questions function.`;

    const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: extractionPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_questions",
              description: "Extract questions from an exam PDF",
              parameters: {
                type: "object",
                properties: {
                  sourceExam: {
                    type: "string",
                    description: "Name of the exam (e.g., 'Fall 2023 Midterm')",
                  },
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        prompt: { type: "string", description: "The question text with LaTeX math notation" },
                        choices: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              text: { type: "string" },
                              isCorrect: { type: "boolean" },
                            },
                            required: ["id", "text", "isCorrect"],
                          },
                        },
                        correctAnswer: { type: "string" },
                        solutionSteps: { type: "array", items: { type: "string" } },
                        hint: { type: "string" },
                        difficulty: { type: "number", minimum: 1, maximum: 5 },
                        topicSuggestions: {
                          type: "array",
                          items: { type: "string" },
                          description: "Topic titles or IDs from the allowed list",
                        },
                        unmappedTopicSuggestions: {
                          type: "array",
                          items: { type: "string" },
                          description: "New topic suggestions if none from allowed list match",
                        },
                      },
                      required: ["prompt", "topicSuggestions"],
                    },
                  },
                },
                required: ["sourceExam", "questions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_questions" } },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);
      
      if (geminiResponse.status === 429) {
        await supabase
          .from("ingestion_jobs")
          .update({ status: "failed", error_message: "Rate limit exceeded. Please try again later." })
          .eq("id", jobId);
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      await supabase
        .from("ingestion_jobs")
        .update({ status: "failed", error_message: `Gemini API error: ${geminiResponse.status}` })
        .eq("id", jobId);
      
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiResult = await geminiResponse.json();
    console.log("Gemini response received");

    await supabase
      .from("ingestion_jobs")
      .update({ current_step: "B5", progress_pct: 60 })
      .eq("id", jobId);

    // Parse the tool call response
    let extractedData: { sourceExam: string; questions: any[] } = { sourceExam: job.file_name, questions: [] };
    
    try {
      const toolCall = geminiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        extractedData = JSON.parse(toolCall.function.arguments);
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
    }

    console.log(`Extracted ${extractedData.questions.length} questions`);

    await supabase
      .from("ingestion_jobs")
      .update({ 
        current_step: "B6", 
        progress_pct: 70,
        questions_extracted: extractedData.questions.length 
      })
      .eq("id", jobId);

    // Step B6-B7: Map topics and insert questions
    console.log("Step B6-B7: Mapping topics and inserting questions...");
    
    const topicMap = new Map(existingTopics?.map(t => [t.title.toLowerCase(), t.id]) || []);
    let mapped = 0;
    let pendingReview = 0;

    for (const q of extractedData.questions) {
      // Try to map topic suggestions to existing topic IDs
      const mappedTopicIds: string[] = [];
      const unmappedSuggestions: string[] = [];

      for (const suggestion of q.topicSuggestions || []) {
        // Check if it's already a UUID
        if (suggestion.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
          mappedTopicIds.push(suggestion);
        } else {
          // Try to match by title
          const matchedId = topicMap.get(suggestion.toLowerCase());
          if (matchedId) {
            mappedTopicIds.push(matchedId);
          } else {
            unmappedSuggestions.push(suggestion);
          }
        }
      }

      // Add any explicit unmapped suggestions
      if (q.unmappedTopicSuggestions) {
        unmappedSuggestions.push(...q.unmappedTopicSuggestions);
      }

      const needsReview = mappedTopicIds.length === 0 || unmappedSuggestions.length > 0;
      if (needsReview) {
        pendingReview++;
      } else {
        mapped++;
      }

      // Insert the question
      const { error: insertError } = await supabase
        .from("questions")
        .insert({
          prompt: q.prompt,
          choices: q.choices || null,
          correct_answer: q.correctAnswer || null,
          solution_steps: q.solutionSteps || null,
          hint: q.hint || null,
          difficulty: q.difficulty || 3,
          topic_ids: mappedTopicIds,
          source_exam: extractedData.sourceExam,
          needs_review: needsReview,
          unmapped_topic_suggestions: unmappedSuggestions.length > 0 ? unmappedSuggestions : null,
        });

      if (insertError) {
        console.error("Failed to insert question:", insertError);
      }
    }

    // Step complete
    await supabase
      .from("ingestion_jobs")
      .update({
        status: "completed",
        current_step: "B7",
        progress_pct: 100,
        questions_extracted: extractedData.questions.length,
        questions_mapped: mapped,
        questions_pending_review: pendingReview,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(`Job ${jobId} completed. Extracted: ${extractedData.questions.length}, Mapped: ${mapped}, Pending Review: ${pendingReview}`);

    const result: ProcessingResult = {
      questionsExtracted: extractedData.questions.length,
      questionsMapped: mapped,
      questionsPendingReview: pendingReview,
      questions: extractedData.questions,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Processing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
