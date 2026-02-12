import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExtractedSubpart {
  id: string;      // "a", "b", "c", "d"
  prompt: string;
  points?: number;
  answerFormatEnum?: string;
  answerSpec?: Record<string, unknown>;
  gradingSpec?: Record<string, unknown>;
}

interface ExtractedQuestion {
  prompt: string;
  questionFormat: 'multiple_choice' | 'short_answer' | 'numeric' | 'multi_select';
  answerFormatEnum?: string;
  answerSpec?: Record<string, unknown>;
  gradingSpec?: Record<string, unknown>;
  sourceLocator?: { page?: number; questionNumber?: number };
  extractedRawText?: string;
  choices?: { id: string; text: string }[];  // Only for MCQ
  subparts?: ExtractedSubpart[];             // For multi-part questions
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

// Normalize choice ID to single lowercase letter
function normalizeChoiceId(id: string): string {
  if (!id) return "a";
  // Extract just the first letter and lowercase it
  const firstLetter = id.trim().charAt(0).toLowerCase();
  // Only allow a-e
  if (["a", "b", "c", "d", "e"].includes(firstLetter)) {
    return firstLetter;
  }
  return "a"; // fallback
}

// Main processing function (can be called sync or async)
async function processExamPdf(
  supabaseUrl: string,
  supabaseServiceKey: string,
  geminiApiKey: string,
  jobId: string,
  authHeader: string
): Promise<ProcessingResult> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log(`Processing job: ${jobId}`);

  // Get job details
  const { data: job, error: jobError } = await supabase
    .from("ingestion_jobs")
    .select("*, course_packs(title)")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    console.error("Job not found:", jobError);
    throw new Error("Job not found");
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

    throw new Error("Failed to download PDF");
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
- Each question has: questionOrder, questionFormat, prompt, and either choices (for MCQ) or subparts (for multi-part short answer).
- Include structured answer_spec and grading_spec for each question.

EXAM METADATA EXTRACTION (CRITICAL):
From the cover page or header, extract these SEPARATE fields:
- examYear: The year (integer, e.g., 2024)
- examSemester: The semester/term (exactly one of: "Spring", "Summer", "Fall", "Winter")
- examType: Simple value representing the exam type. Use exactly one of: "1", "2", "3" (for Midterm 1, 2, 3) or "f" (for Final).
  Examples: First midterm exam → "1", Second midterm → "2", Final exam → "f"

QUESTION FORMAT DETECTION (CRITICAL):
Determine the question format based on these rules:
1. "multiple_choice": Question has labeled answer choices (A, B, C, D, E) to SELECT from
2. "short_answer": Question requires written explanation, proof, derivation, or free-form response
3. "numeric": Question asks for a specific numerical answer to be calculated (no choices, single number expected)
4. "multi_select": Question has choices but multiple can be correct ("select all that apply")

ANSWER FORMAT ENUM (for answer_spec):
Based on the question format, set answer_format_enum to one of:
- "mcq": Single correct choice from A-E
- "multi_select": Multiple correct choices
- "numeric": Single number with optional unit
- "expression": Mathematical expression answer
- "short_text": Brief text answer
- "free_response": Long form written response

ANSWER_SPEC STRUCTURE (output for each question):
- For MCQ: { "correct_choice_ids": ["c"] }
- For multi_select: { "correct_choice_ids": ["b", "d"] }
- For numeric: { "value": null, "unit": null } (to be filled during analysis)
- For expression: { "canonical": null, "alt": [] } (to be filled during analysis)
- For short_text/free_response: { "model_answer": null } (to be filled during analysis)

GRADING_SPEC STRUCTURE (output for each question):
- For numeric: { "tolerance_abs": 0.01, "tolerance_rel": 0.05, "sig_figs": null, "units_required": false }
- For expression: { "must_simplify": false, "case_sensitive": false }
- For MCQ/multi_select: { "partial_credit": false }
- For short_text/free_response: { "rubric_points": [], "keywords_required": [] }

SOURCE LOCATOR (for each question):
Extract position information:
- page: Page number where question starts (1-indexed)
- questionNumber: The original question number in the PDF

SUBPART EXTRACTION (FOR SHORT-ANSWER QUESTIONS):
When a short-answer question has labeled subparts like (a), (b), (c), (d) that each require SEPARATE answers:
- Set the main "prompt" to the overall question setup/context (the shared information)
- Extract each subpart into the "subparts" array with:
  - id: The subpart letter ("a", "b", "c", etc.) - exactly one lowercase letter
  - prompt: The specific question for that subpart
  - points: Point value if shown (e.g., "(2 points)" → 2, "(3 pts)" → 3)
  - answer_format_enum: Format for this subpart (numeric, expression, short_text, etc.)
  - answer_spec: Typed answer structure for this subpart
  - grading_spec: Grading rules for this subpart
- Do NOT include choices array for short-answer questions

QUESTION NUMBER & POINTS REMOVAL (MANDATORY):
- Strip the question number (e.g., "8.", "1.", "12.") from the beginning of the prompt.
- Strip any point values (e.g., "(12 points)", "(10 pts)", "(5 points)") from the MAIN prompt.
- For subparts, extract points separately into the points field, then remove from subpart prompt.
- The prompt should START with the actual question content, NOT "8. (12 points) If..."

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

CHOICE ID RULES (FOR MCQ ONLY - STRICT ENFORCEMENT):
- The choice "id" field MUST be EXACTLY one lowercase letter: a, b, c, d, or e.
- Do NOT include ANY additional text, words, watermarks, or characters in the id field.
- If you see text like "PARADOX", "PARADIGM", "VERSION", "FORM", or similar near choices, this is a WATERMARK - COMPLETELY IGNORE IT.

LATEX NORMALIZATION:
- Fractions: \\frac{...}{...}
- Radicals: \\sqrt{...}
- Inequalities: \\le, \\ge
- Integrals: \\int_{a}^{b} ... \\, dx (include \\, before dx)
- Spacing: \\quad only when needed
- Parentheses grouping: \\left( ... \\right) for tall expressions
- Use \\pi for pi, and convert unicode minus (−) to "-".

PDF ARTIFACT REPAIR (REQUIRED):
- "Z" used as an integral sign → convert to "\\int_{a}^{b} f \\, dx".
- "p" used as a sqrt sign → convert to "\\sqrt{expression}".
- Exponents split across lines → reconstruct as "x^{3}".
- Fractions split across lines → reconstruct using \\frac{...}{...}.

QUALITY CHECKS:
- Ensure every choice obeys the math delimiter rules.
- Ensure the question order matches the PDF numbering sequence.
- Verify that question numbers and point values are REMOVED from prompts.
- VERIFY that questionFormat is correctly determined for each question.
- VERIFY answer_format_enum matches the question format.
- Do NOT solve problems or infer correct answers (leave answer_spec values as null where appropriate).

Return your response using the extract_questions function.`;

  const geminiResponse = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" +
      geminiApiKey,
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
                description: "Extract questions from an exam PDF with structured answer specs and grading rules",
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
                            description: "Question text. Use $$...$$ for display math, $...$ for inline math.",
                          },
                          questionFormat: {
                            type: "string",
                            enum: ["multiple_choice", "short_answer", "numeric", "multi_select"],
                            description: "The format of the question",
                          },
                          answerFormatEnum: {
                            type: "string",
                            enum: ["mcq", "multi_select", "numeric", "expression", "short_text", "free_response"],
                            description: "The answer format type for grading",
                          },
                          answerSpec: {
                            type: "object",
                            description: "Typed answer specification based on format",
                            properties: {
                              correct_choice_ids: { type: "array", items: { type: "string" } },
                              value: { type: "number" },
                              unit: { type: "string" },
                              canonical: { type: "string" },
                              alt: { type: "array", items: { type: "string" } },
                              model_answer: { type: "string" },
                            },
                          },
                          gradingSpec: {
                            type: "object",
                            description: "Grading rules for this question",
                            properties: {
                              tolerance_abs: { type: "number" },
                              tolerance_rel: { type: "number" },
                              sig_figs: { type: "number" },
                              units_required: { type: "boolean" },
                              must_simplify: { type: "boolean" },
                              case_sensitive: { type: "boolean" },
                              partial_credit: { type: "boolean" },
                              rubric_points: { type: "array", items: { type: "string" } },
                              keywords_required: { type: "array", items: { type: "string" } },
                            },
                          },
                          sourceLocator: {
                            type: "object",
                            description: "Location in the source PDF",
                            properties: {
                              page: { type: "number", description: "Page number (1-indexed)" },
                              questionNumber: { type: "number", description: "Original question number in PDF" },
                            },
                          },
                          choices: {
                            type: "array",
                            description: "Answer choices - ONLY for multiple_choice/multi_select",
                            items: {
                              type: "object",
                              properties: {
                                id: { 
                                  type: "string", 
                                  description: "EXACTLY one lowercase letter: a, b, c, d, or e.",
                                  enum: ["a", "b", "c", "d", "e"]
                                },
                                text: { type: "string", description: "Choice text with math wrapped in $...$" },
                              },
                            },
                          },
                          subparts: {
                            type: "array",
                            description: "For multi-part questions, each subpart with its own answer spec",
                            items: {
                              type: "object",
                              properties: {
                                id: { 
                                  type: "string", 
                                  description: "Subpart letter: a, b, c, d, etc.",
                                  enum: ["a", "b", "c", "d", "e", "f", "g", "h"]
                                },
                                prompt: { type: "string", description: "The specific question for this subpart" },
                                points: { type: "number", description: "Point value for this subpart" },
                                answerFormatEnum: {
                                  type: "string",
                                  enum: ["numeric", "expression", "short_text", "free_response"],
                                  description: "Answer format for this subpart",
                                },
                                answerSpec: {
                                  type: "object",
                                  description: "Answer spec for this subpart",
                                  properties: {
                                    value: { type: "number" },
                                    unit: { type: "string" },
                                    canonical: { type: "string" },
                                    model_answer: { type: "string" },
                                  },
                                },
                                gradingSpec: {
                                  type: "object",
                                  description: "Grading spec for this subpart",
                                  properties: {
                                    tolerance_abs: { type: "number" },
                                    tolerance_rel: { type: "number" },
                                    sig_figs: { type: "number" },
                                    units_required: { type: "boolean" },
                                  },
                                },
                              },
                            },
                          },
                          questionOrder: {
                            type: "number",
                            description: "The order of this question in the exam",
                          },
                          extractedRawText: {
                            type: "string",
                            description: "The raw text extracted from the PDF before any formatting",
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
      throw new Error("Rate limit exceeded");
    }

    await supabase
      .from("ingestion_jobs")
      .update({ status: "failed", error_message: `Gemini API error: ${geminiResponse.status}` })
      .eq("id", jobId);

    throw new Error("AI extraction failed");
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

    throw new Error("No questions found in PDF");
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
        `${supabaseUrl}/functions/v1/process-answer-key`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
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
    // Determine question format (default to multiple_choice for backwards compatibility)
    const questionFormat = q.questionFormat || (q.choices && q.choices.length > 0 ? 'multiple_choice' : 'short_answer');
    
    // Determine answer format enum
    const answerFormatEnum = q.answerFormatEnum || 
      (questionFormat === 'multiple_choice' ? 'mcq' : 
       questionFormat === 'multi_select' ? 'multi_select' :
       questionFormat === 'numeric' ? 'numeric' : 'free_response');
    
    // Format choices with normalized IDs (only for MCQ)
    const formattedChoices = (questionFormat === 'multiple_choice' || questionFormat === 'multi_select') && q.choices
      ? q.choices.map((c) => ({
          id: normalizeChoiceId(c.id),
          text: c.text,
          isCorrect: false, // Will be updated during analysis
        }))
      : null;

    // Format subparts with their own answer specs (for short-answer questions)
    const formattedSubparts = q.subparts && q.subparts.length > 0
      ? q.subparts.map((sp) => ({
          id: sp.id.toLowerCase().trim(),
          prompt: sp.prompt,
          points: sp.points || null,
          answer_format_enum: sp.answerFormatEnum || 'free_response',
          answer_spec: sp.answerSpec || null,
          grading_spec: sp.gradingSpec || null,
          correctAnswer: null,    // Will be set during analysis
          solutionSteps: null,    // Will be set during analysis
        }))
      : null;

    // Get answer from answer key if available (primarily for MCQ)
    const answerKeyAnswer = answerKeyMap.get(q.questionOrder) || null;

    // Build source locator
    const sourceLocator = {
      page: q.sourceLocator?.page || null,
      questionNumber: q.questionOrder || null,
    };

    console.log(`Inserting question ${q.questionOrder}: format=${questionFormat}, answerFormat=${answerFormatEnum}, choices=${formattedChoices?.length || 0}, subparts=${formattedSubparts?.length || 0}`);

    const { error: insertError } = await supabase.from("questions").insert({
      prompt: q.prompt,
      question_format: questionFormat,
      answer_format_enum: answerFormatEnum,
      answer_spec: q.answerSpec || null,
      grading_spec: q.gradingSpec || null,
      source_locator: sourceLocator,
      extracted_raw_text: q.extractedRawText || null,
      choices: formattedChoices,
      subparts: formattedSubparts,
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

  return {
    questionsExtracted: extractedData.questions.length,
    message: `Extracted ${extractedData.questions.length} questions. Use "Analyze" on each question to generate solutions and guide-me steps.`,
  };
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

    const supabaseForAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseForAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseForAuth
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

    const { jobId, async: asyncMode = false } = await req.json();

    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If async mode, return immediately and process in background
    if (asyncMode) {
      console.log(`Starting async processing for job: ${jobId}`);
      
      // Use EdgeRuntime.waitUntil for background processing
      (globalThis as any).EdgeRuntime?.waitUntil?.(
        processExamPdf(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, jobId, authHeader)
          .catch((error) => {
            console.error("Background processing error:", error);
            // Update job status to failed
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            supabase
              .from("ingestion_jobs")
              .update({ 
                status: "failed", 
                error_message: error instanceof Error ? error.message : "Unknown error" 
              })
              .eq("id", jobId);
          })
      );

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Processing started in background",
        jobId 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Synchronous processing
    const result = await processExamPdf(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, jobId, authHeader);

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
