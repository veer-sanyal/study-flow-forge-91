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

// Convert simple exam type to display format for source_exam string
function formatExamTypeDisplay(examType: string | undefined): string {
  if (!examType) return "";
  if (examType === "f") return "Final";
  if (examType === "1" || examType === "2" || examType === "3") return `Midterm ${examType}`;
  return examType;
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
- Each question has: questionOrder (1..N), prompt, choices[{label, text}], (optional) questionNumberFromPDF.

EXAM METADATA EXTRACTION (CRITICAL):
From the cover page or header, extract these SEPARATE fields:
- examYear: The year (integer, e.g., 2024)
- examSemester: The semester/term (exactly one of: "Spring", "Summer", "Fall", "Winter")
- examType: Simple value representing the exam type. Use exactly one of: "1", "2", "3" (for Midterm 1, 2, 3) or "f" (for Final).
  Examples: First midterm exam → "1", Second midterm → "2", Final exam → "f"

QUESTION NUMBER & POINTS REMOVAL (MANDATORY):
- Strip the question number (e.g., "8.", "1.", "12.") from the beginning of the prompt.
- Strip any point values (e.g., "(12 points)", "(10 pts)", "(5 points)") from the prompt.
- The prompt should START with the actual question content, NOT "8. (12 points) If..."
- Example transformation:
  PDF shows: "8. (12 points) If $\\mathbf{v}$ and $\\mathbf{w}$ are vectors..."
  Output prompt: "If $\\mathbf{v}$ and $\\mathbf{w}$ are vectors..."

PROMPT LAYOUT (CRITICAL):
- Preserve the PDF's visual layout using NEWLINES.
- Narrative text stays as plain text (do NOT wrap entire sentences in $...$).
- Inline math inside sentences: use $...$.
- Centered equations / standalone math lines: must be display math using the exact block form:

  (blank line)
  $$
  ...latex...
  $$
  (blank line)

- Do NOT use \\[ \\] or \\(...\\) because the renderer won't parse them.

SUB-ITEM FORMATTING (CRITICAL):
- When a question contains labeled sub-items like (i), (ii), (iii) or (a), (b), (c):
  - Each sub-item MUST be on its OWN LINE.
  - Include a blank line before each sub-item for visual separation.
  - NEVER collapse multiple sub-items onto a single line.
  
  Example output:
  "Which of the following equations is guaranteed to hold?
  
  (i) $(\\mathbf{v} \\times \\mathbf{w}) \\cdot \\mathbf{v} = 0$
  
  (ii) $(\\mathbf{v} \\times \\mathbf{w}) + (\\mathbf{w} \\times \\mathbf{v}) = \\mathbf{0}$
  
  (iii) $(\\mathbf{v} \\times \\mathbf{w}) \\times \\mathbf{w} = \\mathbf{0}$
  
  Note: Partial credit is possible for this question."

NOTES AND REMARKS:
- Keep notes like "Note: Partial credit is possible for this question." as plain text.
- These should be on their own line at the end of the prompt (before choices).

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
- Fractions: \\frac{...}{...}
- Radicals: \\sqrt{...}
- Inequalities: \\le, \\ge
- Integrals: \\int_{a}^{b} ... \\, dx (include \\, before dx)
- Spacing: \\quad only when needed
- Parentheses grouping: \\left( ... \\right) for tall expressions
- Use \\pi for pi, and convert unicode minus (−) to "-".
- Vectors: use \\mathbf{v}, \\mathbf{w}, \\mathbf{i}, \\mathbf{j}, \\mathbf{k}

PDF ARTIFACT REPAIR (REQUIRED):
Repair these common extraction errors before finalizing LaTeX:
- "Z" used as an integral sign → convert patterns like "Z b a f dx" into "\\int_{a}^{b} f \\, dx".
- "p" used as a sqrt sign → convert "p expression" into "\\sqrt{expression}".
- Exponents split across lines (e.g., "x" then "3") → reconstruct as "x^{3}".
- Fractions split across lines (numerator/denominator on separate lines) → reconstruct using \\frac{...}{...}.
- Join broken math tokens across line breaks when they clearly form one expression.
- Vector glyphs like "~ı", "~" → map to \\mathbf{i}, \\mathbf{j} (and \\mathbf{k}).

QUALITY CHECKS (DO THESE):
- After formatting, re-read each prompt and ensure the display-math lines are centered via $$ block form.
- Ensure every choice obeys the math delimiter rules.
- Ensure the question order matches the PDF numbering sequence.
- Verify that question numbers and point values are REMOVED from prompts.
- Verify that sub-items (i), (ii), (iii) are on SEPARATE lines with blank lines between them.
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
                  description: "Extract questions from an exam PDF with proper LaTeX math delimiters and structured exam metadata",
                  parameters: {
                    type: "object",
                    properties: {
                      examYear: {
                        type: "number",
                        description: "The year of the exam (e.g., 2024)",
                      },
                      examSemester: {
                        type: "string",
                        description: "The semester (exactly one of: 'Spring', 'Summer', 'Fall', 'Winter')",
                      },
                      examType: {
                        type: "string",
                        description: "Simple exam type value. Use exactly: '1' (Midterm 1), '2' (Midterm 2), '3' (Midterm 3), or 'f' (Final)",
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
    let extractedData: { 
      examYear?: number; 
      examSemester?: string; 
      examType?: string; // "1", "2", "3", or "f"
      questions: ExtractedQuestion[] 
    } = {
      questions: [],
    };

    try {
      // Parse Gemini native API response format
      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall?.name === "extract_questions" && functionCall?.args) {
        extractedData = functionCall.args as {
          examYear?: number;
          examSemester?: string;
          examType?: string;
          questions: ExtractedQuestion[];
        };
      } else {
        console.error("No function call found in response:", JSON.stringify(geminiResult));
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
    }

    // Determine if final based on simple exam type
    const isFinalExam = extractedData.examType === "f";
    
    // Build source_exam string from structured data using display format
    const sourceExamParts: string[] = [];
    if (extractedData.examSemester && extractedData.examYear) {
      sourceExamParts.push(`${extractedData.examSemester} ${extractedData.examYear}`);
    }
    const formattedType = formatExamTypeDisplay(extractedData.examType);
    if (formattedType) {
      sourceExamParts.push(formattedType);
    }
    const sourceExam = sourceExamParts.join(" ") || job.file_name;
    
    console.log(`Extracted ${extractedData.questions.length} questions - Year: ${extractedData.examYear}, Semester: ${extractedData.examSemester}, Type: ${extractedData.examType}, isFinal: ${isFinalExam}`);

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

    // Step B3: Delete existing questions for this source_exam, then insert new ones
    console.log("Step B3: Deleting existing questions for this exam...");

    // For non-final exams, extract midterm number from simple exam type (1, 2, 3)
    // For finals (f), midterm_number will be set per-question during analysis based on topic coverage
    let docMidtermNumber: number | null = null;
    if (!isFinalExam && extractedData.examType) {
      const numVal = parseInt(extractedData.examType, 10);
      if (!isNaN(numVal) && numVal >= 1 && numVal <= 3) {
        docMidtermNumber = numVal;
      }
    }

    // Delete any existing questions with the same source_exam and course_pack_id to avoid duplicates
    const { error: deleteError } = await supabase
      .from("questions")
      .delete()
      .eq("course_pack_id", job.course_pack_id)
      .eq("source_exam", sourceExam);

    if (deleteError) {
      console.error("Failed to delete existing questions:", deleteError);
    } else {
      console.log(`Deleted existing questions for exam: ${sourceExam}`);
    }

    console.log("Inserting new questions (pending analysis)...");

    // Check if there's an answer key to process
    let answerKeyMap = new Map<number, string>();
    
    if (job.has_answer_key && job.answer_key_path) {
      console.log("Processing answer key...");
      try {
        // Call process-answer-key function
        const answerKeyResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/process-answer-key`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": req.headers.get("authorization") || "",
            },
            body: JSON.stringify({ answerKeyPath: job.answer_key_path }),
          }
        );
        
        if (answerKeyResponse.ok) {
          const answerKeyData = await answerKeyResponse.json();
          if (answerKeyData.answers) {
            for (const entry of answerKeyData.answers) {
              answerKeyMap.set(entry.questionNumber, entry.answer);
            }
            console.log(`Loaded ${answerKeyMap.size} answers from answer key`);
          }
        } else {
          console.warn("Failed to process answer key, continuing without it");
        }
      } catch (answerKeyError) {
        console.warn("Error processing answer key:", answerKeyError);
      }
    }

    for (const q of extractedData.questions) {
      // Format choices without isCorrect (will be set during analysis)
      const formattedChoices =
        q.choices?.map((c) => ({
          id: c.id,
          text: c.text,
          isCorrect: false, // Will be updated during analysis
        })) || null;

      // Get answer from answer key if available
      const answerKeyAnswer = answerKeyMap.get(q.questionOrder) || null;

      const { error: insertError } = await supabase.from("questions").insert({
        prompt: q.prompt,
        choices: formattedChoices,
        correct_answer: null, // Will be set during analysis
        solution_steps: null, // Will be set during analysis
        guide_me_steps: null, // Will be set during analysis
        hint: null, // Will be set during analysis
        difficulty: null, // Will be set during analysis
        topic_ids: [], // Will be set during analysis
        source_exam: sourceExam,
        needs_review: true, // Needs analysis
        unmapped_topic_suggestions: null,
        question_type_id: null, // Will be set during analysis
        course_pack_id: job.course_pack_id,
        midterm_number: docMidtermNumber, // null for finals, will be set during analysis
        question_order: q.questionOrder || null,
        answer_key_answer: answerKeyAnswer,
        answer_mismatch: false, // Will be set during analysis
      });

      if (insertError) {
        console.error("Failed to insert question:", insertError);
      }
    }

    // Update job with structured exam details and complete status
    await supabase
      .from("ingestion_jobs")
      .update({
        status: "completed",
        current_step: "B4",
        progress_pct: 100,
        questions_extracted: extractedData.questions.length,
        questions_mapped: 0,
        exam_year: extractedData.examYear || null,
        exam_semester: extractedData.examSemester || null,
        exam_type: extractedData.examType || null,
        questions_pending_review: extractedData.questions.length, // All need analysis
        completed_at: new Date().toISOString(),
        is_final: isFinalExam,
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
