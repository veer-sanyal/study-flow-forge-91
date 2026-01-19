import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GuideHint {
  tier: number;
  text: string;
}

interface GuideStepChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface GuideStep {
  stepNumber: number;
  prompt: string;
  choices: GuideStepChoice[];
  hints: GuideHint[];
  explanation: string;
  keyTakeaway: string;
}

interface AnalysisResult {
  correctAnswer: string;
  difficulty: number;
  detailedSolution: string;
  guideMeSteps: GuideStep[];
  topicSuggestions: string[];
  questionType: string;
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

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { questionId } = await req.json();
    
    if (!questionId) {
      return new Response(JSON.stringify({ error: "questionId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Analyzing question: ${questionId}`);

    // Get question details
    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("*, course_packs(title)")
      .eq("id", questionId)
      .single();

    if (questionError || !question) {
      console.error("Question not found:", questionError);
      return new Response(JSON.stringify({ error: "Question not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing topics for mapping
    const { data: existingTopics } = await supabase
      .from("topics")
      .select("id, title")
      .eq("course_pack_id", question.course_pack_id);

    const topicsList = existingTopics?.map(t => `- ${t.title} (ID: ${t.id})`).join("\n") || "No topics defined yet";

    // Get existing question types
    const { data: existingQuestionTypes } = await supabase
      .from("question_types")
      .select("id, name, aliases")
      .eq("course_pack_id", question.course_pack_id);

    const questionTypesList = existingQuestionTypes?.map(qt => {
      const aliases = qt.aliases?.length ? ` (aliases: ${qt.aliases.join(", ")})` : "";
      return `- ${qt.name}${aliases} (ID: ${qt.id})`;
    }).join("\n") || "No question types defined yet";

    // Format the question for analysis
    const choicesText = question.choices?.map((c: any) => `${c.id}) ${c.text}`).join("\n") || "No choices";

    const analysisPrompt = `You are an expert math tutor analyzing an exam question. Provide a complete analysis.

QUESTION:
${question.prompt}

CHOICES:
${choicesText}

AVAILABLE TOPICS (you MUST map to these):
${topicsList}

EXISTING QUESTION TYPES:
${questionTypesList}

Provide the following analysis:

1. CORRECT ANSWER: Identify which choice (a, b, c, d, or e) is correct.

2. DIFFICULTY: Rate from 1-5 (1=easy, 5=very hard)

3. DETAILED SOLUTION: A beautifully formatted step-by-step solution. Use rich markdown + LaTeX formatting:
   
   **FORMATTING REQUIREMENTS:**
   - Use **bold** headers for each major section (e.g., **Step 1: Identify the Problem**)
   - Use bullet points (- or •) for listing related items or cases
   - Put key equations on their own lines using display math: $$equation$$
   - Use inline math $x$ for variables mentioned in text
   - Add blank lines between sections for visual breathing room
   - Use \\textbf{} inside LaTeX for emphasis on key terms
   - For multi-case analysis, use structured bullets like:
     - For case A: $equation$ \\Rightarrow result
     - For case B: $equation$ \\Rightarrow result
   - End with a clear **Conclusion** section summarizing the answer
   - Use \\implies or \\Rightarrow for logical flow between steps
   
   **CONTENT REQUIREMENTS:**
   - Explain the reasoning behind each step in plain language
   - Show ALL intermediate calculations
   - Highlight key insights and why they matter
   - Connect back to the original question at the end

4. GUIDE ME STEPS: Create 2-5 scaffolded steps that help students DISCOVER the answer (don't give it directly). Each step should:
   - Have a guiding question prompt
   - Have EXACTLY 4 multiple choice options (a, b, c, d) with one correct
   - Have 3 hint tiers (these help with THIS guide step, NOT the main question):
     * Tier 1: Gentle conceptual nudge (doesn't reveal the step answer)
     * Tier 2: More specific guidance (still doesn't reveal the step answer)
     * Tier 3: Strong hint that points toward the step answer
   - Have an explanation of why the correct choice is right
   - Have a keyTakeaway summarizing the core concept learned

5. TOPICS: Map to topic IDs from the allowed list above. If no exact match, suggest new topic names.

6. QUESTION TYPE: The category (e.g., "Volume of Rotation", "Arc Length"). Use existing types if possible.

Return your response using the analyze_question function.`;

    console.log("Calling Gemini for analysis...");

    const geminiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: analysisPrompt,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_question",
              description: "Provide complete analysis for an exam question",
              parameters: {
                type: "object",
                properties: {
                  correctAnswer: { 
                    type: "string", 
                    description: "The correct choice letter (a, b, c, d, or e)" 
                  },
                  difficulty: { 
                    type: "number", 
                    description: "Difficulty 1-5" 
                  },
                  detailedSolution: {
                    type: "string", 
                    description: "Beautifully formatted solution with **bold headers**, bullet points, display math $$equation$$, logical flow using \\Rightarrow, and a clear **Conclusion** section" 
                  },
                  guideMeSteps: {
                    type: "array",
                    description: "2-5 scaffolded steps to guide students",
                    items: {
                      type: "object",
                      properties: {
                        stepNumber: { type: "number" },
                        prompt: { type: "string", description: "Guiding question" },
                        choices: {
                          type: "array",
                          description: "4 multiple choice options",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              text: { type: "string" },
                              isCorrect: { type: "boolean" }
                            }
                          }
                        },
                        hints: {
                          type: "array",
                          description: "3 hint tiers",
                          items: {
                            type: "object",
                            properties: {
                              tier: { type: "number" },
                              text: { type: "string" }
                            }
                          }
                        },
                        explanation: { type: "string", description: "Why the correct answer is right" },
                        keyTakeaway: { type: "string", description: "Core concept or skill learned from this step" }
                      }
                    }
                  },
                  topicSuggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Topic IDs or new topic names"
                  },
                  unmappedTopicSuggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "New topic names if not in allowed list"
                  },
                  questionType: {
                    type: "string",
                    description: "Question type/category"
                  },
                  isNewQuestionType: {
                    type: "boolean",
                    description: "True if this is a new question type"
                  },
                },
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_question" } },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errorText);
      
      if (geminiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiResult = await geminiResponse.json();
    console.log("Gemini analysis received");

    // Parse the tool call response
    let analysis: AnalysisResult | null = null;
    
    try {
      const toolCall = geminiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        analysis = JSON.parse(toolCall.function.arguments);
      } else {
        console.error("No tool call found:", JSON.stringify(geminiResult));
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
    }

    if (!analysis) {
      return new Response(JSON.stringify({ error: "Failed to parse AI analysis" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Analysis complete, updating question...");

    // Map topics
    const topicMap = new Map(existingTopics?.map(t => [t.title.toLowerCase(), t.id]) || []);
    const questionTypeMap = new Map(existingQuestionTypes?.map(qt => [qt.name.toLowerCase(), qt.id]) || []);
    
    // Add aliases
    existingQuestionTypes?.forEach(qt => {
      if (qt.aliases) {
        qt.aliases.forEach((alias: string) => {
          questionTypeMap.set(alias.toLowerCase(), qt.id);
        });
      }
    });

    const mappedTopicIds: string[] = [];
    const unmappedSuggestions: string[] = [];

    for (const suggestion of analysis.topicSuggestions || []) {
      if (suggestion.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        mappedTopicIds.push(suggestion);
      } else {
        const matchedId = topicMap.get(suggestion.toLowerCase());
        if (matchedId) {
          mappedTopicIds.push(matchedId);
        } else {
          unmappedSuggestions.push(suggestion);
        }
      }
    }

    // Handle question type
    let questionTypeId: string | null = null;
    if (analysis.questionType) {
      const matchedTypeId = questionTypeMap.get(analysis.questionType.toLowerCase());
      if (matchedTypeId) {
        questionTypeId = matchedTypeId;
      } else {
        // Create new question type
        const { data: newType, error: typeError } = await supabase
          .from("question_types")
          .insert({
            name: analysis.questionType,
            course_pack_id: question.course_pack_id,
            status: "active",
          })
          .select("id")
          .single();
        
        if (!typeError && newType) {
          questionTypeId = newType.id;
          console.log(`Created new question type: ${analysis.questionType}`);
        }
      }
    }

    // Update choices with correct answer
    const updatedChoices = question.choices?.map((c: any) => ({
      ...c,
      isCorrect: c.id.toLowerCase() === analysis!.correctAnswer.toLowerCase(),
    })) || null;

    // Update the question
    const { error: updateError } = await supabase
      .from("questions")
      .update({
        choices: updatedChoices,
        correct_answer: analysis.correctAnswer,
        solution_steps: analysis.detailedSolution ? [analysis.detailedSolution] : null,
        guide_me_steps: analysis.guideMeSteps || null,
        difficulty: analysis.difficulty || 3,
        topic_ids: mappedTopicIds,
        unmapped_topic_suggestions: unmappedSuggestions.length > 0 ? unmappedSuggestions : null,
        question_type_id: questionTypeId,
        needs_review: mappedTopicIds.length === 0 || unmappedSuggestions.length > 0,
      })
      .eq("id", questionId);

    if (updateError) {
      console.error("Failed to update question:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update question" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Question ${questionId} analysis complete`);

    return new Response(JSON.stringify({ 
      success: true, 
      correctAnswer: analysis.correctAnswer,
      difficulty: analysis.difficulty,
      topicsMapped: mappedTopicIds.length,
      guideMeSteps: analysis.guideMeSteps?.length || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
