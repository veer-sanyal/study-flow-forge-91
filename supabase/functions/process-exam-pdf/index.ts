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
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 in chunks to avoid stack overflow for large files
    let binaryString = "";
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode.apply(null, [...chunk]);
    }
    const base64Pdf = btoa(binaryString);

    await supabase
      .from("ingestion_jobs")
      .update({ current_step: "B1", progress_pct: 25 })
      .eq("id", jobId);

    // Step B1: Call Gemini to extract ONLY questions and choices (Phase 1 - lightweight)
    console.log("Step B1: Extracting questions with Gemini (Phase 1 - lightweight)...");
    
    const extractionPrompt = `You are an expert at extracting exam questions from PDF documents.

Extract ALL questions with precise LaTeX formatting that preserves the visual layout.

DISPLAY MATH (CENTERED EQUATIONS) - CRITICAL:
When you see a centered/standalone equation in the PDF (on its own line, visually separated), output it as:

text before the equation

$$
equation_here
$$

text after the equation

EXAMPLE - If the PDF shows:
"Find the surface area when the curve" (centered equation: y = x³/3, 0 ≤ x ≤ 1) "is rotated..."

Output EXACTLY as:
Find the surface area of the surface generated when the curve

$$
y=\\frac{x^{3}}{3},\\quad 0\\le x\\le 1
$$

is rotated about the $x$-axis.

QUESTION PROMPT RULES:
- Centered/standalone equations: use display math with $$...$$ on its OWN LINES (newline before $$, newline after $$)
- Inline math within sentences: use $...$ (e.g., "the $x$-axis")
- Punctuation belonging to the sentence goes OUTSIDE math delimiters
- Preserve the EXACT visual hierarchy from the PDF

CHOICE TEXT RULES:
- ALL mathematical expressions in choices MUST be wrapped in $...$ delimiters
- Example: "$\\frac{\\pi(2\\sqrt{2}-1)}{27}$"
- Pure text choices don't need delimiters

LATEX FORMATTING:
- \\frac{num}{den} for fractions
- \\sqrt{x} for square roots, \\sqrt[n]{x} for nth roots
- \\int_{a}^{b} for definite integrals
- \\le / \\ge for ≤ / ≥
- \\pi for π
- \\quad for spacing between expressions
- \\left( ... \\right) for auto-sizing parentheses

RULES:
- Number questions in order (questionOrder: 1, 2, 3, etc.)
- Extract source exam name from document header if visible
- DO NOT determine correct answers - done separately

Return your response using the extract_questions function.`;

    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
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
        }],
        tools: [{
          functionDeclarations: [{
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
                        description: "Question text. Use $$...$$ for display math, $...$ for inline math. Punctuation outside delimiters." 
                      },
                      choices: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string", description: "Choice letter (a, b, c, d, e)" },
                            text: { 
                              type: "string", 
                              description: "Choice text. ALL math expressions MUST be wrapped in $...$ delimiters. Example: '$\\\\frac{1}{2}$'" 
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
          }]
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: ["extract_questions"]
          }
        },
        generationConfig: {
          temperature: 0.2
        }
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
      .update({ current_step: "B2", progress_pct: 60 })
      .eq("id", jobId);

    // Parse the tool call response
    let extractedData: { sourceExam: string; midtermNumber?: number; questions: ExtractedQuestion[] } = { 
      sourceExam: job.file_name, 
      questions: [] 
    };
    
    try {
      // Parse Gemini native API response format
      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall?.name === "extract_questions" && functionCall?.args) {
        extractedData = functionCall.args as { sourceExam: string; midtermNumber?: number; questions: ExtractedQuestion[] };
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
          error_message: "No questions extracted from PDF. Please check the PDF format." 
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
        questions_extracted: extractedData.questions.length 
      })
      .eq("id", jobId);

    // Step B3: Insert questions with needs_review=true and needs_analysis=true
    console.log("Step B3: Inserting questions (pending analysis)...");
    
    const docMidtermNumber = extractedData.midtermNumber || null;

    for (const q of extractedData.questions) {
      // Format choices without isCorrect (will be set during analysis)
      const formattedChoices = q.choices?.map(c => ({
        id: c.id,
        text: c.text,
        isCorrect: false, // Will be updated during analysis
      })) || null;

      const { error: insertError } = await supabase
        .from("questions")
        .insert({
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

    console.log(`Job ${jobId} completed. Extracted: ${extractedData.questions.length} questions (all pending analysis)`);

    const result: ProcessingResult = {
      questionsExtracted: extractedData.questions.length,
      message: `Extracted ${extractedData.questions.length} questions. Use "Analyze" on each question to generate solutions and guide-me steps.`,
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
