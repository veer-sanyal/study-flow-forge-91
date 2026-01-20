import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration for rate limiting and retries
const CONFIG = {
  CONCURRENCY: 5,           // Max simultaneous requests
  STAGGER_MS: 2000,         // Delay between starting each request
  MAX_RETRIES: 3,           // Retry attempts on failure
  RETRY_DELAY_MS: 3000,     // Initial retry delay (doubles each attempt)
  REQUEST_TIMEOUT_MS: 90000, // 90 second timeout per question
};

interface AnalysisJobParams {
  coursePackId: string;
  sourceExam: string;
  questionIds: string[];
  reanalyze?: boolean;
}

// Sleep utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Analyze a single question with timeout and retry
async function analyzeQuestionWithRetry(
  supabase: SupabaseClient,
  questionId: string,
  geminiApiKey: string,
  maxRetries: number,
  retryDelayMs: number,
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

      // Get question details
      const { data: question, error: questionError } = await supabase
        .from("questions")
        .select("*, course_packs(title)")
        .eq("id", questionId)
        .single();

      if (questionError || !question) {
        clearTimeout(timeoutId);
        return { success: false, error: `Question not found: ${questionId}` };
      }

      const q = question as any;

      // Check if this question comes from a final exam
      let isFinalExam = false;
      if (q?.source_exam && q?.course_pack_id) {
        const { data: job } = await supabase
          .from("ingestion_jobs")
          .select("is_final")
          .eq("course_pack_id", q.course_pack_id)
          .ilike("file_name", `%${q.source_exam.split(" ").slice(-2).join(" ")}%`)
          .maybeSingle();
        isFinalExam = (job as any)?.is_final === true;
      }

      // Get existing topics for mapping
      const { data: existingTopics } = await supabase
        .from("topics")
        .select("id, title, midterm_coverage")
        .eq("course_pack_id", q.course_pack_id);

      const topicsList = (existingTopics as any[])?.map((t) => `- ${t.title} (ID: ${t.id})`).join("\n") || "No topics defined yet";

      // Get existing question types
      const { data: existingQuestionTypes } = await supabase
        .from("question_types")
        .select("id, name, aliases")
        .eq("course_pack_id", q.course_pack_id);

      const questionTypesList =
        existingQuestionTypes && (existingQuestionTypes as any[]).length > 0
          ? (existingQuestionTypes as any[])
              .map((qt) => {
                const aliases = qt.aliases?.length ? ` (aliases: ${qt.aliases.join(", ")})` : "";
                return `- ID: "${qt.id}" - ${qt.name}${aliases}`;
              })
              .join("\n")
          : "No question types defined yet";

      // Build maps for validation
      const questionTypeIdMap = new Map<string, boolean>();
      (existingQuestionTypes as any[])?.forEach((qt) => {
        questionTypeIdMap.set(qt.id, true);
      });

      const choicesText = q.choices?.map((c: any) => `${c.id}) ${c.text}`).join("\n") || "No choices";

      // Handle image if present
      let imageBase64: string | null = null;
      let imageMimeType: string | null = null;

      if (q.image_url) {
        try {
          const imageResponse = await fetch(q.image_url);
          if (imageResponse.ok) {
            const imageBuffer = await imageResponse.arrayBuffer();
            const uint8Array = new Uint8Array(imageBuffer);
            let binary = "";
            const chunkSize = 32768;
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.slice(i, i + chunkSize);
              binary += String.fromCharCode(...chunk);
            }
            imageBase64 = btoa(binary);
            imageMimeType = imageResponse.headers.get("content-type") || "image/png";
          }
        } catch {
          // Continue without image
        }
      }

      // Build analysis prompt (simplified version - same as analyze-question)
      const analysisPrompt = buildAnalysisPrompt(q.prompt, choicesText, topicsList, questionTypesList);

      // Build content parts
      const contentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
      if (imageBase64 && imageMimeType) {
        contentParts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
        contentParts.push({ text: "The above image is the diagram/figure for this question.\n\n" + analysisPrompt });
      } else {
        contentParts.push({ text: analysisPrompt });
      }

      // Call Gemini API
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: contentParts }],
            tools: [{ functionDeclarations: [getAnalyzeQuestionSchema()] }],
            toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["analyze_question"] } },
            generationConfig: { temperature: 0.2 },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!geminiResponse.ok) {
        if (geminiResponse.status === 429) {
          throw new Error("RATE_LIMIT");
        }
        throw new Error(`Gemini API error: ${geminiResponse.status}`);
      }

      const geminiResult = await geminiResponse.json();
      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      
      if (!functionCall?.args) {
        throw new Error("Failed to parse AI analysis");
      }

      const analysis = functionCall.args;

      // Process and save analysis (similar to analyze-question)
      await saveAnalysisResult(supabase, questionId, q, analysis, existingTopics as any[], existingQuestionTypes as any[], isFinalExam);

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (errorMessage === "RATE_LIMIT" || errorMessage.includes("AbortError") || errorMessage.includes("timeout")) {
        if (attempt < maxRetries) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          console.log(`Question ${questionId} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      console.error(`Question ${questionId} analysis failed:`, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

// Save analysis result to database
async function saveAnalysisResult(
  supabase: SupabaseClient,
  questionId: string,
  question: any,
  analysis: any,
  existingTopics: any[],
  existingQuestionTypes: any[],
  isFinalExam: boolean
) {
  const topicIdSet = new Set(existingTopics?.map((t) => t.id) || []);
  const topicMap = new Map(existingTopics?.map((t) => [t.id, t]) || []);
  const questionTypeMap = new Map(existingQuestionTypes?.map((qt) => [qt.name.toLowerCase(), qt.id]) || []);
  const questionTypeIdMap = new Map(existingQuestionTypes?.map((qt) => [qt.id, true]) || []);

  existingQuestionTypes?.forEach((qt) => {
    qt.aliases?.forEach((alias: string) => {
      questionTypeMap.set(alias.toLowerCase(), qt.id);
    });
  });

  // Validate topic IDs
  const mappedTopicIds: string[] = [];
  for (const topicId of analysis.topicIds || []) {
    if (topicId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) && topicIdSet.has(topicId)) {
      mappedTopicIds.push(topicId);
    }
  }

  // Determine midterm number for final exam questions
  let determinedMidtermNumber: number | null = question.midterm_number;
  if (isFinalExam && mappedTopicIds.length > 0) {
    const primaryTopic = topicMap.get(mappedTopicIds[0]);
    if (primaryTopic?.midterm_coverage) {
      determinedMidtermNumber = primaryTopic.midterm_coverage;
    }
  }

  // Handle question type
  let questionTypeId: string | null = null;
  if (analysis.questionTypeId && questionTypeIdMap.has(analysis.questionTypeId)) {
    questionTypeId = analysis.questionTypeId;
  } else if (analysis.questionTypeName) {
    const matchedTypeId = questionTypeMap.get(analysis.questionTypeName.toLowerCase());
    if (matchedTypeId) {
      questionTypeId = matchedTypeId;
    } else {
      const { data: newType } = await supabase
        .from("question_types")
        .insert({
          name: analysis.questionTypeName,
          course_pack_id: question.course_pack_id,
          status: "active",
        } as any)
        .select("id")
        .single();
      if (newType) questionTypeId = (newType as any).id;
    }
  }

  // Update choices with correct answer
  const updatedChoices = question.choices?.map((c: any) => ({
    ...c,
    isCorrect: c.id.toLowerCase() === analysis.correctAnswer.toLowerCase(),
  })) || null;

  const guideData = {
    steps: analysis.guideMeSteps || [],
    methodSummary: analysis.methodSummary || { bullets: [] },
  };

  await supabase
    .from("questions")
    .update({
      choices: updatedChoices,
      correct_answer: analysis.correctAnswer,
      solution_steps: analysis.detailedSolution ? [analysis.detailedSolution] : null,
      guide_me_steps: guideData,
      difficulty: analysis.difficulty || 3,
      topic_ids: mappedTopicIds,
      unmapped_topic_suggestions: null,
      question_type_id: questionTypeId,
      midterm_number: determinedMidtermNumber,
      needs_review: mappedTopicIds.length === 0,
    } as any)
    .eq("id", questionId);
}

// Build simplified analysis prompt
function buildAnalysisPrompt(prompt: string, choicesText: string, topicsList: string, questionTypesList: string): string {
  return `You are an expert math tutor analyzing an exam question. Provide a complete analysis.

QUESTION:
${prompt}

CHOICES:
${choicesText}

AVAILABLE TOPICS (use these IDs only):
${topicsList}

EXISTING QUESTION TYPES (select by ID):
${questionTypesList}

Provide: correctAnswer (a/b/c/d/e), difficulty (1-5), detailedSolution, guideMeSteps (3-6 steps), methodSummary, topicIds, questionTypeId, questionTypeName.

Use LaTeX with $...$ for inline and $$...$$ for display math.`;
}

// Get function schema (simplified)
function getAnalyzeQuestionSchema() {
  return {
    name: "analyze_question",
    description: "Provide complete analysis with Guide Me scaffold",
    parameters: {
      type: "object",
      required: ["correctAnswer", "difficulty", "detailedSolution", "guideMeSteps", "methodSummary", "topicIds", "questionTypeId", "questionTypeName"],
      properties: {
        correctAnswer: { type: "string" },
        difficulty: { type: "number" },
        detailedSolution: { type: "string" },
        guideMeSteps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              stepNumber: { type: "number" },
              stepTitle: { type: "string" },
              microGoal: { type: "string" },
              prompt: { type: "string" },
              choices: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    text: { type: "string" },
                    isCorrect: { type: "boolean" },
                  },
                },
              },
              hints: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    tier: { type: "number" },
                    text: { type: "string" },
                  },
                },
              },
              explanation: { type: "string" },
              keyTakeaway: { type: "string" },
            },
          },
        },
        methodSummary: {
          type: "object",
          properties: {
            bullets: { type: "array", items: { type: "string" } },
            proTip: { type: "string" },
          },
        },
        topicIds: { type: "array", items: { type: "string" } },
        questionTypeId: { type: "string" },
        questionTypeName: { type: "string" },
      },
    },
  };
}

// Process batch in background with staggered parallel requests
async function processBatchInBackground(
  supabase: SupabaseClient,
  jobId: string,
  questionIds: string[],
  geminiApiKey: string
) {
  console.log(`Starting batch analysis job ${jobId} with ${questionIds.length} questions`);

  // Update job status to running
  await supabase
    .from("analysis_jobs")
    .update({ status: "running", started_at: new Date().toISOString() } as any)
    .eq("id", jobId);

  let completedCount = 0;
  let failedCount = 0;
  const inFlight = new Set<Promise<void>>();

  // Process questions with staggered parallel execution
  for (let i = 0; i < questionIds.length; i++) {
    const questionId = questionIds[i];

    // Wait if we've hit concurrency limit
    while (inFlight.size >= CONFIG.CONCURRENCY) {
      await Promise.race(inFlight);
    }

    // Get question prompt for progress display
    const { data: q } = await supabase
      .from("questions")
      .select("prompt")
      .eq("id", questionId)
      .single();

    // Update current progress
    await supabase
      .from("analysis_jobs")
      .update({
        current_question_id: questionId,
        current_question_prompt: (q as any)?.prompt?.slice(0, 200) || "",
      } as any)
      .eq("id", jobId);

    // Start analysis for this question
    const analysisPromise: Promise<void> = (async () => {
      try {
        const result = await analyzeQuestionWithRetry(
          supabase,
          questionId,
          geminiApiKey,
          CONFIG.MAX_RETRIES,
          CONFIG.RETRY_DELAY_MS
        );

        if (result.success) {
          completedCount++;
        } else {
          failedCount++;
          console.error(`Question ${questionId} failed: ${result.error}`);
        }

        // Update progress in database
        await supabase
          .from("analysis_jobs")
          .update({
            completed_questions: completedCount,
            failed_questions: failedCount,
          } as any)
          .eq("id", jobId);

      } catch (err) {
        console.error(`Unexpected error for ${questionId}:`, err);
        failedCount++;
      }
    })();

    // Track and clean up when done
    inFlight.add(analysisPromise);
    analysisPromise.finally(() => inFlight.delete(analysisPromise));

    // Stagger the start of next request
    if (i < questionIds.length - 1) {
      await sleep(CONFIG.STAGGER_MS);
    }
  }

  // Wait for all remaining in-flight requests
  await Promise.all(inFlight);

  // POST-ANALYSIS PASS: Compare AI answers with answer key
  console.log(`Running post-analysis answer key comparison for job ${jobId}...`);
  
  let mismatchCount = 0;
  try {
    // Get all questions that were just analyzed and have an answer key
    const { data: questionsWithKey } = await supabase
      .from("questions")
      .select("id, correct_answer, answer_key_answer")
      .in("id", questionIds)
      .not("answer_key_answer", "is", null);

    if (questionsWithKey && questionsWithKey.length > 0) {
      for (const q of questionsWithKey as any[]) {
        const aiAnswer = q.correct_answer?.toUpperCase().trim();
        const keyAnswer = q.answer_key_answer?.toUpperCase().trim();
        const hasMismatch = aiAnswer && keyAnswer && aiAnswer !== keyAnswer;

        if (hasMismatch) {
          mismatchCount++;
          console.log(`Answer mismatch for question ${q.id}: AI=${aiAnswer}, Key=${keyAnswer}`);
        }

        // Update the question with mismatch status
        await supabase
          .from("questions")
          .update({
            answer_mismatch: hasMismatch,
            needs_review: hasMismatch || false, // Set needs_review if mismatch (will merge with existing logic)
          } as any)
          .eq("id", q.id);
      }
      console.log(`Post-analysis: ${mismatchCount} answer mismatches found out of ${questionsWithKey.length} questions with answer keys`);
    }
  } catch (mismatchError) {
    console.error("Error during answer key comparison:", mismatchError);
  }

  // Mark job as completed
  const finalStatus = failedCount === questionIds.length ? "failed" : "completed";
  await supabase
    .from("analysis_jobs")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      current_question_id: null,
      current_question_prompt: null,
      error_message: failedCount > 0 ? `${failedCount} questions failed` : (mismatchCount > 0 ? `${mismatchCount} answer mismatches` : null),
    } as any)
    .eq("id", jobId);

  console.log(`Batch analysis job ${jobId} completed: ${completedCount} succeeded, ${failedCount} failed, ${mismatchCount} mismatches`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
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

    const params: AnalysisJobParams = await req.json();
    const { coursePackId, sourceExam, questionIds } = params;

    if (!coursePackId || !sourceExam || !questionIds?.length) {
      return new Response(JSON.stringify({ error: "coursePackId, sourceExam, and questionIds are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Creating batch analysis job for ${questionIds.length} questions`);

    // Cancel any existing running jobs for this exam
    await supabase
      .from("analysis_jobs")
      .update({ status: "cancelled" } as any)
      .eq("course_pack_id", coursePackId)
      .eq("source_exam", sourceExam)
      .in("status", ["pending", "running"]);

    // Create new analysis job
    const { data: job, error: jobError } = await supabase
      .from("analysis_jobs")
      .insert({
        course_pack_id: coursePackId,
        source_exam: sourceExam,
        status: "pending",
        total_questions: questionIds.length,
        completed_questions: 0,
        failed_questions: 0,
        created_by: user.id,
      } as any)
      .select()
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create analysis job: ${jobError?.message}`);
    }

    const jobData = job as any;

    // Start background processing using EdgeRuntime.waitUntil
    // This allows the function to return immediately while processing continues
    // @ts-ignore - EdgeRuntime is available in Deno Deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(
        processBatchInBackground(supabase, jobData.id, questionIds, GEMINI_API_KEY)
      );
    } else {
      // Fallback: process in background without waitUntil (may timeout for large batches)
      processBatchInBackground(supabase, jobData.id, questionIds, GEMINI_API_KEY);
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId: jobData.id,
        totalQuestions: questionIds.length,
        message: "Batch analysis started. Progress will be tracked in the database.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Batch analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
