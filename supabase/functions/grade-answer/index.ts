import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GradeRequest {
  questionPrompt: string;
  subpartPrompt?: string;
  studentAnswer: string;
  correctAnswer?: string;
  modelAnswer?: string;
  gradingRubric?: string;
  solutionSteps?: string[];
  maxPoints?: number;
}

interface GradeResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
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

    // Authenticate user (any authenticated user, not admin-only)
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: GradeRequest = await req.json();

    if (!body.studentAnswer || !body.questionPrompt) {
      return new Response(
        JSON.stringify({ error: "studentAnswer and questionPrompt are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const maxPoints = body.maxPoints ?? 1;

    // Build context for Gemini
    const contextParts: string[] = [];

    contextParts.push(`QUESTION:\n${body.questionPrompt}`);

    if (body.subpartPrompt) {
      contextParts.push(`SUBPART:\n${body.subpartPrompt}`);
    }

    if (body.correctAnswer) {
      contextParts.push(`CORRECT ANSWER:\n${body.correctAnswer}`);
    }

    if (body.modelAnswer) {
      contextParts.push(`MODEL ANSWER:\n${body.modelAnswer}`);
    }

    if (body.gradingRubric) {
      contextParts.push(`GRADING RUBRIC:\n${body.gradingRubric}`);
    }

    if (body.solutionSteps && body.solutionSteps.length > 0) {
      contextParts.push(
        `SOLUTION STEPS:\n${body.solutionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      );
    }

    const gradingPrompt = `You are an expert academic grader. Grade the following student answer.

${contextParts.join("\n\n")}

STUDENT ANSWER:
${body.studentAnswer}

MAX POINTS: ${maxPoints}

GRADING INSTRUCTIONS:
- Compare the student's answer against the correct answer, model answer, and/or solution steps.
- Be fair but rigorous. Allow minor differences in wording or notation if the mathematical/conceptual content is equivalent.
- For math answers: equivalent forms are acceptable (e.g., 1/2 = 0.5 = 50%).
- Award partial credit proportional to how much of the solution the student got right.
- Provide brief, constructive feedback (1-2 sentences).

Return your assessment using the grade_answer function.`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: gradingPrompt }] }],
          tools: [
            {
              functionDeclarations: [
                {
                  name: "grade_answer",
                  description: "Grade the student's answer",
                  parameters: {
                    type: "object",
                    required: ["isCorrect", "score", "feedback"],
                    properties: {
                      isCorrect: {
                        type: "boolean",
                        description:
                          "True if the answer is substantially correct (score >= 70% of max points)",
                      },
                      score: {
                        type: "number",
                        description: `Points earned (0 to ${maxPoints}). Use partial credit when appropriate.`,
                      },
                      feedback: {
                        type: "string",
                        description:
                          "Brief constructive feedback (1-2 sentences). If wrong, explain what was incorrect. If correct, confirm.",
                      },
                    },
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: ["grade_answer"],
            },
          },
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);

      if (geminiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ error: "AI grading failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiResult = await geminiResponse.json();

    let gradeResult: GradeResult | null = null;

    try {
      const functionCall =
        geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall?.name === "grade_answer" && functionCall?.args) {
        gradeResult = functionCall.args as GradeResult;
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini grading response:", parseError);
    }

    if (!gradeResult) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI grading result" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(gradeResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Grading error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
