import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedQuestion {
  prompt: string;
  choices: { id: string; text: string }[];
  questionOrder: number;
}

interface ProcessingResult {
  questionsExtracted: number;
  message: string;
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

    // Get authorization header to verify admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    const { data: pdfData, error: downloadError } = await supabase.storage.from("exam-pdfs").download(job.file_path);

    if (downloadError || !pdfData) {
      console.error("Failed to download PDF:", downloadError);
      await supabase
        .from("ingestion_jobs")
        .update({
          status: "failed",
          error_message: `Failed to download PDF: ${downloadError?.message}`,
        })
        .eq("id", jobId);

      return new Response(JSON.stringify({ error: "Failed to download PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("ingestion_jobs").update({ current_step: "A2", progress_pct: 15 }).eq("id", jobId);

    // Step A2: Convert PDF to base64 for Gemini
    console.log("Step A2: Converting PDF to base64...");
    const arrayBuffer = await pdfData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64 in chunks to avoid stack overflow for large files
    let binaryString = "";
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode.apply(null, [...chunk]);
    }
    const base64Pdf = btoa(binaryString);

    await supabase.from("ingestion_jobs").update({ current_step: "B1", progress_pct: 25 }).eq("id", jobId);

    // Step B1: Call Gemini to extract ONLY questions and choices (Phase 1 - lightweight)
    console.log("Step B1: Extracting questions with Gemini (Phase 1 - lightweight)...");

    const extractionPrompt = `You are an expert at extracting exam questions from PDF documents, including repairing common PDF text-extraction artifacts.

Extract ALL questions with precise LaTeX formatting that renders correctly in a system that supports ONLY $...$ (inline) and $$...$$ (display).

OUTPUT REQUIREMENTS:
- Return JSON via extract_questions only (no extra commentary).
- Each question has: questionOrder (1..N), sourceExamName, prompt, choices[{label, text}], (optional) questionNumberFromPDF.

SOURCE EXAM NAME:
- Extract from the cover/header if present (e.g., course + year (eg 2024) + term (Spring or fall) + exam (midterm 1, 2, or 3 or final). Use the first page header.

PROMPT LAYOUT (CRITICAL):
- Preserve the PDF’s visual layout using NEWLINES.
- Narrative text stays as plain text (do NOT wrap entire sentences in $...$).
- Inline math inside sentences: use $...$.
- Centered equations / standalone math lines: must be display math using the exact block form:

  (blank line)
  $$
  ...latex...
  $$
  (blank line)

- Do NOT use \[ \] or \(...\) because the renderer won’t parse them.

PUNCTUATION:
- If punctuation belongs to the sentence, keep it outside math delimiters.
- If punctuation is printed as part of a standalone centered math line, keep it inside that $$...$$ block.

CHOICE TEXT RULES:
- If a choice is purely mathematical, wrap the ENTIRE choice in $...$.
- If a choice mixes words + math, only wrap the math parts in $...$.
- For integral-heavy or fraction-heavy pure-math choices, use display sizing:
  wrap as "$\\displaystyle ...$".
- Do not use $$...$$ inside choices unless absolutely necessary.

LATEX NORMALIZATION:
- Fractions: \frac{...}{...}
- Radicals: \sqrt{...}
- Inequalities: \le, \ge
- Integrals: \int_{a}^{b} ... \, dx (include \, before dx)
- Spacing: \quad only when needed
- Parentheses grouping: \left( ... \right) for tall expressions
- Use \pi for pi, and convert unicode minus (−) to "-".

PDF ARTIFACT REPAIR (REQUIRED):
Repair these common extraction errors before finalizing LaTeX:
- "Z" used as an integral sign → convert patterns like "Z b a f dx" into "\int_{a}^{b} f \, dx".
- "p" used as a sqrt sign → convert "p expression" into "\sqrt{expression}".
- Exponents split across lines (e.g., "x" then "3") → reconstruct as "x^{3}".
- Fractions split across lines (numerator/denominator on separate lines) → reconstruct using \frac{...}{...}.
- Join broken math tokens across line breaks when they clearly form one expression.
- Vector glyphs like "~ı", "~" → map to \mathbf{i}, \mathbf{j} (and \mathbf{k}).

QUALITY CHECKS (DO THESE):
- After formatting, re-read each prompt and ensure the display-math lines are centered via $$ block form.
- Ensure every choice obeys the math delimiter rules.
- Ensure the question order matches the PDF numbering sequence.
- Do NOT solve problems or infer correct answers.

Return your response using the extract_questions function.`;

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
                  name: "extract_questions",
                  description: "Extract questions from an exam PDF with proper LaTeX math delimiters",
                  parameters: {
                    type: "object",
                    properties: {
                      sourceExam: {
                        type: "string",
                        description: "Name of the exam (e.g., 'Fall 2023 Midterm 1')",
                      },
                      midtermNumber: {
                        type: "number",
                        description: "The midterm number (1, 2, or 3) if identifiable",
                      },
                      questions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            prompt: {
                              type: "string",
                              description:
                                "Question text. Use $$...$$ for display math, $...$ for inline math. Punctuation outside delimiters.",
                            },
                            choices: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  id: { type: "string", description: "Choice letter (a, b, c, d, e)" },
                                  text: {
                                    type: "string",
                                    description:
                                      "Choice text. ALL math expressions MUST be wrapped in $...$ delimiters. Example: '$\\\\frac{1}{2}$'",
                                  },
                                },
                              },
                            },
                            questionOrder: {
                              type: "number",
                              description: "The order of this question in the exam",
                            },
                          },
                        },
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
              allowedFunctionNames: ["extract_questions"],
            },
          },
          generationConfig: {
            temperature: 0.2,
          },
        }),
      },
    );

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

    await supabase.from("ingestion_jobs").update({ current_step: "B2", progress_pct: 60 }).eq("id", jobId);

    // Parse the tool call response
    let extractedData: { sourceExam: string; midtermNumber?: number; questions: ExtractedQuestion[] } = {
      sourceExam: job.file_name,
      questions: [],
    };

    try {
      // Parse Gemini native API response format
      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall?.name === "extract_questions" && functionCall?.args) {
        extractedData = functionCall.args as {
          sourceExam: string;
          midtermNumber?: number;
          questions: ExtractedQuestion[];
        };
      } else {
        console.error("No function call found in response:", JSON.stringify(geminiResult));
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
    }

    console.log(`Extracted ${extractedData.questions.length} questions from ${extractedData.sourceExam}`);

    if (extractedData.questions.length === 0) {
      await supabase
        .from("ingestion_jobs")
        .update({
          status: "failed",
          error_message: "No questions extracted from PDF. Please check the PDF format.",
        })
        .eq("id", jobId);

      return new Response(JSON.stringify({ error: "No questions found in PDF" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("ingestion_jobs")
      .update({
        current_step: "B3",
        progress_pct: 70,
        questions_extracted: extractedData.questions.length,
      })
      .eq("id", jobId);

    // Step B3: Insert questions with needs_review=true and needs_analysis=true
    console.log("Step B3: Inserting questions (pending analysis)...");

    const docMidtermNumber = extractedData.midtermNumber || null;

    for (const q of extractedData.questions) {
      // Format choices without isCorrect (will be set during analysis)
      const formattedChoices =
        q.choices?.map((c) => ({
          id: c.id,
          text: c.text,
          isCorrect: false, // Will be updated during analysis
        })) || null;

      const { error: insertError } = await supabase.from("questions").insert({
        prompt: q.prompt,
        choices: formattedChoices,
        correct_answer: null, // Will be set during analysis
        solution_steps: null, // Will be set during analysis
        guide_me_steps: null, // Will be set during analysis
        hint: null, // Will be set during analysis
        difficulty: null, // Will be set during analysis
        topic_ids: [], // Will be set during analysis
        source_exam: extractedData.sourceExam,
        needs_review: true, // Needs analysis
        unmapped_topic_suggestions: null,
        question_type_id: null, // Will be set during analysis
        course_pack_id: job.course_pack_id,
        midterm_number: docMidtermNumber,
        question_order: q.questionOrder || null,
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
        current_step: "B4",
        progress_pct: 100,
        questions_extracted: extractedData.questions.length,
        questions_mapped: 0,
        questions_pending_review: extractedData.questions.length, // All need analysis
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    console.log(
      `Job ${jobId} completed. Extracted: ${extractedData.questions.length} questions (all pending analysis)`,
    );

    const result: ProcessingResult = {
      questionsExtracted: extractedData.questions.length,
      message: `Extracted ${extractedData.questions.length} questions. Use "Analyze" on each question to generate solutions and guide-me steps.`,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Processing error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
