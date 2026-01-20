import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnswerKeyEntry {
  questionNumber: number;
  answer: string;
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

    // Call Gemini to extract answers
    const extractionPrompt = `You are an expert at extracting answer keys from exam documents.

Extract the answer key from this document. The answer key typically shows:
- A list of question numbers with their correct answers
- Format might be: "1. B", "1) B", "#1: B", "Q1 = B", etc.
- Sometimes displayed in tables or columns

OUTPUT REQUIREMENTS:
- Return JSON via extract_answer_key only (no extra commentary).
- Each entry has: questionNumber (integer), answer (single letter like "A", "B", "C", "D", "E")
- Normalize all answers to UPPERCASE single letters
- Handle variations: "b" → "B", "(B)" → "B", "B." → "B"

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
                  description: "Extract the answer key mapping question numbers to correct answers",
                  parameters: {
                    type: "object",
                    properties: {
                      answers: {
                        type: "array",
                        description: "List of question number to answer mappings",
                        items: {
                          type: "object",
                          properties: {
                            questionNumber: {
                              type: "number",
                              description: "The question number (1, 2, 3, etc.)",
                            },
                            answer: {
                              type: "string",
                              description: "The correct answer letter (A, B, C, D, or E)",
                            },
                          },
                          required: ["questionNumber", "answer"],
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

    // Normalize answers to uppercase
    const normalizedAnswers = answerKeyData.answers.map((a) => ({
      questionNumber: a.questionNumber,
      answer: a.answer.toUpperCase().replace(/[^A-E]/g, ""),
    }));

    console.log(`Extracted ${normalizedAnswers.length} answers from answer key`);

    return new Response(
      JSON.stringify({
        success: true,
        answers: normalizedAnswers,
        count: normalizedAnswers.length,
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
