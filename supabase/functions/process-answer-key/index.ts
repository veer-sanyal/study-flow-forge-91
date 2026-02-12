import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EXTERNAL_SUPABASE_URL, getExternalServiceRoleKey } from "../_shared/external-db.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced to support both MCQ and short-answer formats
interface AnswerKeyEntry {
  questionNumber: string; // e.g., "2.1", "3", "4"
  questionType: "mcq" | "short_answer";
  // For MCQ: single letter answer
  answer?: string;
  // For short-answer: subpart answers
  subparts?: {
    id: string; // e.g., "a", "b", "c"
    answer: string; // The final answer (number, expression, etc.)
    points?: number;
  }[];
}

interface AnswerKeyResult {
  answers: AnswerKeyEntry[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = EXTERNAL_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = getExternalServiceRoleKey();
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

    const { answerKeyPath } = await req.json();

    if (!answerKeyPath) {
      return new Response(JSON.stringify({ error: "answerKeyPath is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing answer key: ${answerKeyPath}`);

    // Download the answer key PDF from storage
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from("exam-pdfs")
      .download(answerKeyPath);

    if (downloadError || !pdfData) {
      console.error("Failed to download answer key:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download answer key PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert PDF to base64
    const arrayBuffer = await pdfData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64 in chunks to avoid stack overflow
    let binaryString = "";
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode.apply(null, [...chunk]);
    }
    const base64Pdf = btoa(binaryString);

    console.log("Answer key PDF converted to base64, calling Gemini...");

    // Enhanced extraction prompt for mixed MCQ + short-answer formats
    const extractionPrompt = `You are an expert at extracting answer keys from exam documents.

This document contains a GRADED EXAM with instructor corrections/solutions marked (often in red ink or annotations).

DOCUMENT STRUCTURE:
- Some questions are MULTIPLE CHOICE (MCQ): The correct answer is circled or marked. Extract the single letter (A, B, C, D, E).
- Some questions are SHORT-ANSWER/FREE-RESPONSE: These have multi-part subquestions (a, b, c, d...) with worked solutions. Extract the FINAL ANSWER for each subpart.

EXTRACTION RULES:

1. QUESTION NUMBERING:
   - Questions may be numbered as: "2.1", "2.2" or just "1", "2", "3"
   - Use the exact numbering from the document (e.g., "2.1", "2.2", "3", "4")

2. MCQ QUESTIONS:
   - questionType: "mcq"
   - Look for circled, boxed, or highlighted answer letters
   - answer: The correct letter (A, B, C, D, or E)
   - subparts: null or empty

3. SHORT-ANSWER QUESTIONS:
   - questionType: "short_answer"
   - answer: null (answers are in subparts)
   - subparts: Array of {id, answer, points}
     - id: The subpart letter (a, b, c, d, etc.)
     - answer: The FINAL answer only (a number, expression, or short phrase)
       - For probability: "0.1932", "0.2786"
       - For distributions: "Poisson(λ = 6)", "N(82, 64/35)"
       - For numeric: "80.4449", "1.48"
     - points: Point value if visible (e.g., 2, 4, 6, 8)

4. ANSWER EXTRACTION:
   - Extract only the FINAL answer, not the full solution steps
   - Preserve mathematical notation: fractions, exponents, special symbols
   - For LaTeX expressions, use standard notation: \\frac{}, \\sqrt{}, etc.
   - If answer is boxed or underlined in the solution, that's likely the final answer

5. IGNORE:
   - Student work or wrong attempts (focus on instructor corrections in red)
   - Watermarks like "PARADOX", "PARADIGM"
   - Partial credit annotations

Return your response using the extract_answer_key function.`;

    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" +
        GEMINI_API_KEY,
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
                { text: extractionPrompt },
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64Pdf,
                  },
                },
              ],
            },
          ],
          tools: [
            {
              functionDeclarations: [
                {
                  name: "extract_answer_key",
                  description: "Extract the answer key from a graded exam, supporting both MCQ and short-answer formats",
                  parameters: {
                    type: "object",
                    properties: {
                      answers: {
                        type: "array",
                        description: "List of questions with their correct answers",
                        items: {
                          type: "object",
                          properties: {
                            questionNumber: {
                              type: "string",
                              description: "The question identifier as shown in the document (e.g., '2.1', '3', '4')",
                            },
                            questionType: {
                              type: "string",
                              enum: ["mcq", "short_answer"],
                              description: "Whether this is a multiple choice or short-answer question",
                            },
                            answer: {
                              type: "string",
                              description: "For MCQ only: the correct answer letter (A, B, C, D, or E). Null for short-answer.",
                            },
                            subparts: {
                              type: "array",
                              description: "For short-answer only: array of subpart answers",
                              items: {
                                type: "object",
                                properties: {
                                  id: {
                                    type: "string",
                                    description: "Subpart identifier (a, b, c, d, etc.)",
                                  },
                                  answer: {
                                    type: "string",
                                    description: "The final answer for this subpart",
                                  },
                                  points: {
                                    type: "number",
                                    description: "Point value for this subpart if visible",
                                  },
                                },
                                required: ["id", "answer"],
                              },
                            },
                          },
                          required: ["questionNumber", "questionType"],
                        },
                      },
                    },
                    required: ["answers"],
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: {
              mode: "ANY",
              allowedFunctionNames: ["extract_answer_key"],
            },
          },
          generationConfig: {
            temperature: 0.1,
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiResult = await geminiResponse.json();
    console.log("Gemini response received for answer key");

    // Parse the function call response
    let answerKeyData: AnswerKeyResult = { answers: [] };

    try {
      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall?.name === "extract_answer_key" && functionCall?.args) {
        answerKeyData = functionCall.args as AnswerKeyResult;
      } else {
        console.error("No function call found:", JSON.stringify(geminiResult));
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
    }

    // Normalize and validate answers
    const normalizedAnswers = answerKeyData.answers.map((entry) => {
      if (entry.questionType === "mcq") {
        return {
          questionNumber: entry.questionNumber,
          questionType: "mcq" as const,
          answer: entry.answer?.toUpperCase().replace(/[^A-E]/g, "") || "",
          subparts: null,
        };
      } else {
        return {
          questionNumber: entry.questionNumber,
          questionType: "short_answer" as const,
          answer: null,
          subparts: entry.subparts?.map((sp) => ({
            id: sp.id.toLowerCase(),
            answer: sp.answer,
            points: sp.points,
          })) || [],
        };
      }
    });

    // Calculate stats
    const mcqCount = normalizedAnswers.filter((a) => a.questionType === "mcq").length;
    const shortAnswerCount = normalizedAnswers.filter((a) => a.questionType === "short_answer").length;
    const totalSubparts = normalizedAnswers
      .filter((a) => a.questionType === "short_answer")
      .reduce((sum, a) => sum + (a.subparts?.length || 0), 0);

    console.log(`Extracted ${normalizedAnswers.length} questions: ${mcqCount} MCQ, ${shortAnswerCount} short-answer (${totalSubparts} subparts)`);

    return new Response(
      JSON.stringify({
        success: true,
        answers: normalizedAnswers,
        stats: {
          total: normalizedAnswers.length,
          mcq: mcqCount,
          shortAnswer: shortAnswerCount,
          totalSubparts,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Answer key processing error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
