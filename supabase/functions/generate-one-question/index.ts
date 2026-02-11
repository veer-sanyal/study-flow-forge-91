import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simplified question schema for validation
interface SimplifiedChoice {
  id: "A" | "B" | "C" | "D";
  text: string;
  isCorrect: boolean;
}

interface SimplifiedQuestion {
  stem: string;
  choices: SimplifiedChoice[];
  difficulty: 1 | 2 | 3;
  topic: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a SimplifiedQuestion meets all requirements.
 */
function validateQuestion(question: unknown): ValidationResult {
  const errors: string[] = [];

  if (!question || typeof question !== "object") {
    return { valid: false, errors: ["Question must be an object"] };
  }

  const q = question as Record<string, unknown>;

  // Validate stem
  if (typeof q.stem !== "string") {
    errors.push("Stem must be a string");
  } else if (q.stem.length < 10) {
    errors.push("Stem must be at least 10 characters");
  }

  // Validate choices
  if (!Array.isArray(q.choices)) {
    errors.push("Choices must be an array");
  } else if (q.choices.length !== 4) {
    errors.push(`Must have exactly 4 choices, got ${q.choices.length}`);
  } else {
    const ids = new Set<string>();
    let correctCount = 0;
    const validIds = new Set(["A", "B", "C", "D"]);

    for (const choice of q.choices as unknown[]) {
      if (!choice || typeof choice !== "object") {
        errors.push("Each choice must be an object");
        continue;
      }

      const c = choice as Record<string, unknown>;

      if (typeof c.id !== "string" || !validIds.has(c.id)) {
        errors.push(`Choice id must be A, B, C, or D, got: ${String(c.id)}`);
      } else {
        if (ids.has(c.id)) {
          errors.push(`Duplicate choice id: ${c.id}`);
        }
        ids.add(c.id);
      }

      if (typeof c.text !== "string" || c.text.length === 0) {
        errors.push("Choice text must be a non-empty string");
      }

      if (typeof c.isCorrect !== "boolean") {
        errors.push("Choice isCorrect must be a boolean");
      } else if (c.isCorrect) {
        correctCount++;
      }
    }

    if (ids.size !== 4) {
      errors.push("Must have choices with IDs A, B, C, and D");
    }

    if (correctCount !== 1) {
      errors.push(`Exactly 1 choice must be correct, found ${correctCount}`);
    }
  }

  // Validate difficulty
  if (typeof q.difficulty !== "number" || ![1, 2, 3].includes(q.difficulty)) {
    errors.push("Difficulty must be 1, 2, or 3");
  }

  // Validate topic
  if (typeof q.topic !== "string" || q.topic.length === 0) {
    errors.push("Topic must be a non-empty string");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Builds the prompt for generating one high-quality MCQ.
 */
function buildPrompt(existingQuestions?: string[]): string {
  const existingSection =
    existingQuestions && existingQuestions.length > 0
      ? `\nDO NOT DUPLICATE THESE EXISTING QUESTIONS (avoid similar stems):\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`
      : "";

  return `You are an expert educational assessment designer. Analyze the lecture material provided and create ONE high-quality MCQ.
${existingSection}
REQUIREMENTS:
1. Test understanding of a CONCEPT from the lecture, not just memorization
2. Exactly 4 choices (A, B, C, D), exactly ONE correct
3. All info needed to answer must be in the lecture content
4. Pay attention to diagrams, charts, formulas, and visual elements in the slides

DISTRACTOR DESIGN (CRITICAL):
- DO NOT create obviously wrong answers
- Base each wrong answer on a COMMON MISCONCEPTION or TYPICAL STUDENT ERROR:
  * Confusing similar concepts (e.g., union vs intersection)
  * Computational mistakes (e.g., forgetting to subtract overlap in P(A∪B))
  * Partial understanding (e.g., knowing one condition but not both)
  * Misremembering formulas or definitions
  * Applying wrong rules to a situation
- Each distractor should be what a student who partially understands would pick

QUALITY SELF-CHECK (verify before responding):
- [ ] Exactly one unambiguous correct answer
- [ ] Answerable from lecture content alone
- [ ] Tests understanding, not recall
- [ ] Each distractor represents a real misconception

Generate the question using the generate_question function.`;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "GEMINI_API_KEY is not configured",
          retryable: false,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify auth
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Proceed with Service Role client for backend operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    const body = await req.json();
    const { materialId, existingQuestions } = body as {
      materialId?: string;
      existingQuestions?: string[];
    };

    if (!materialId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "materialId is required",
          retryable: false,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Generating question for material: ${materialId}`);

    // Get material record
    const { data: material, error: materialError } = await supabase
      .from("course_materials")
      .select("storage_path, title")
      .eq("id", materialId)
      .single();

    if (materialError || !material) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Material not found: ${materialError?.message || "Unknown error"}`,
          retryable: false,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!material.storage_path) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Material has no storage path",
          retryable: false,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Download PDF from storage
    console.log("Downloading PDF from storage...");
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("course-materials")
      .download(material.storage_path);

    if (downloadError || !pdfData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to download PDF: ${downloadError?.message || "Unknown error"}`,
          retryable: true,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Convert PDF to base64
    const arrayBuffer = await pdfData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const pdfBase64 = btoa(binary);

    console.log(`PDF loaded: ${Math.round(arrayBuffer.byteLength / 1024)}KB, generating question...`);

    // Build the prompt
    const prompt = buildPrompt(existingQuestions);

    // Call Gemini API with PDF directly for visual understanding
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" + GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: pdfBase64,
                  },
                },
                {
                  text: prompt,
                },
              ],
            },
          ],
          tools: [
            {
              functionDeclarations: [
                {
                  name: "generate_question",
                  description: "Generate a single MCQ with stem, choices, difficulty, and topic",
                  parameters: {
                    type: "object",
                    required: ["stem", "choices", "difficulty", "topic"],
                    properties: {
                      stem: {
                        type: "string",
                        description: "The question stem (at least 10 characters)",
                      },
                      choices: {
                        type: "array",
                        description: "Exactly 4 choices with IDs A, B, C, D",
                        minItems: 4,
                        maxItems: 4,
                        items: {
                          type: "object",
                          required: ["id", "text", "isCorrect"],
                          properties: {
                            id: {
                              type: "string",
                              enum: ["A", "B", "C", "D"],
                              description: "Choice identifier",
                            },
                            text: {
                              type: "string",
                              description: "Choice text",
                            },
                            isCorrect: {
                              type: "boolean",
                              description: "True if this is the correct answer",
                            },
                          },
                        },
                      },
                      difficulty: {
                        type: "string",
                        enum: ["1", "2", "3"],
                        description: "1 = Basic, 2 = Intermediate, 3 = Advanced",
                      },
                      topic: {
                        type: "string",
                        description: "The topic this question tests",
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
              allowedFunctionNames: ["generate_question"],
            },
          },
          generationConfig: {
            temperature: 0.4,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);

      if (geminiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Rate limit exceeded. Please try again later.",
            retryable: true,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `AI generation failed: ${geminiResponse.status} - ${errorText}`,
          retryable: true,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiResult = await geminiResponse.json();

    // Parse the function call response
    let question: SimplifiedQuestion | null = null;

    try {
      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall?.name === "generate_question" && functionCall?.args) {
        const args = functionCall.args;
        // Gemini returns difficulty as string due to enum constraint; convert back to number
        if (typeof args.difficulty === "string") {
          args.difficulty = parseInt(args.difficulty, 10);
        }
        question = args as SimplifiedQuestion;
      } else {
        console.error("No function call found:", JSON.stringify(geminiResult));
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
    }

    if (!question) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to parse AI response",
          retryable: true,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate the generated question
    const validation = validateQuestion(question);

    if (!validation.valid) {
      console.error("Question validation failed:", validation.errors);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Validation failed: ${validation.errors.join(", ")}`,
          retryable: true,
        }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Generated question: "${question.stem.slice(0, 50)}..." (difficulty: ${question.difficulty})`);

    return new Response(
      JSON.stringify({
        success: true,
        question,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Generation error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
