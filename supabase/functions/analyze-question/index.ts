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

interface ChoiceFeedback {
  choiceId: string;
  feedback: string;
}

interface GuideStepChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface GuideStep {
  stepNumber: number;
  stepTitle: string;
  microGoal: string;
  prompt: string;
  choices: GuideStepChoice[];
  hints: GuideHint[];
  choiceFeedback: ChoiceFeedback[];
  explanation: string;
  keyTakeaway: string;
  isMisconceptionCheck?: boolean;
}

interface MethodSummary {
  bullets: string[];
  proTip?: string;
}

// MiniVariant removed - not needed for question analysis

interface AnalysisResult {
  correctAnswer: string;
  difficulty: number;
  detailedSolution: string;
  guideMeSteps: GuideStep[];
  methodSummary: MethodSummary;
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

    const analysisPrompt = `You are an expert math tutor generating a "Guide Me" learning scaffold for an exam question.

GOAL: Teach the TRANSFERABLE REASONING PROCESS, not just the answer. Each step must be reusable for similar problems.

QUESTION:
${question.prompt}

CHOICES:
${choicesText}

AVAILABLE TOPICS (you MUST map to these):
${topicsList}

EXISTING QUESTION TYPES:
${questionTypesList}

=== LATEX CLARITY RULES (MUST FOLLOW) ===

1. Use inline math $...$ for short expressions; use display math $$...$$ for multi-step work.

2. EXPLANATION FORMAT (every algebra explanation must follow this):
   - 1 sentence in plain English describing the idea
   - Then a display-math block $$...$$ with exact algebra (max 3 lines)
   - Then 1 sentence interpreting the result (e.g., "Since $R^2 - h^2 < 0$, no real intersection.")

3. In every displayed math block, start with a short label using \\text{}:
   $$\\text{On the yz-plane: } x = 0$$

4. Use \\text{...} for words inside equations (e.g., $\\text{center}$, $\\text{radius}$).

5. Use \\quad to space major steps; avoid clutter.

6. Prefer named quantities:
   - center $C = (h, k, \\ell)$, radius $R$
   - distance $d$

7. When substituting a plane, show it explicitly as a labeled line:
   "On the yz-plane, $x = 0$. Substitute into the sphere: ..."

8. Use consistent notation: $|x|$ not "abs(x)".

9. Simplify to a standard recognizable form:
   $$\\text{Circle: } (y - k)^2 + (z - \\ell)^2 = R^2 - h^2$$

10. Show conditions as inequality lines:
    $$\\text{Intersection iff } R^2 - h^2 \\ge 0$$

11. End algebra in a recognizable canonical form and explicitly name $\\rho^2$ and its sign.

12. NO CLUTTER - Do NOT:
    - Chain more than one "=" per line if it makes the line long
    - Expand squares unless necessary
    - Use fractions/roots unless needed for the check
    - Include redundant words ("therefore, thus, hence") in math blocks
    - Put full sentences inside math mode

=== OUTPUT REQUIREMENTS ===

1. CORRECT ANSWER: Which choice (a, b, c, d, or e) is correct.

2. DIFFICULTY: Rate 1-5 (1=easy, 5=very hard)

3. DETAILED SOLUTION: Step-by-step following LaTeX rules above:
   - Use **bold** headers for sections
   - Display math: $$equation$$
   - Inline math: $x$
   - Each step: 1 sentence + display math (1-3 lines) + 1 interpretation sentence
   - End with **Conclusion** section

4. GUIDE ME STEPS (3-6 steps): Each step MUST include:

   a) stepTitle: Skill name (e.g., "Identify the sphere center from standard form")
   
   b) microGoal: What the student will learn (1 sentence)
   
   c) prompt: Short Socratic question (answerable in <20 seconds)
   
   d) choices: EXACTLY 4 options (a-d) where:
      - One is correct
      - Three are REALISTIC MISCONCEPTIONS (common student errors like: confusing center vs radius, forgetting sign conventions, using wrong formula, mixing up cases)
   
   e) choiceFeedback: One explanation for EACH option:
      - For correct: Why it's right
      - For wrong: Why it's tempting but wrong (explain the misconception)
   
   f) hints (3 tiers that ESCALATE, not rephrase):
      - Tier 1: Recall a definition or concept ("What is the standard form?")
      - Tier 2: Translate concept to math setup ("So what value does x equal?")
      - Tier 3: Do ONE helpful algebra step (not the whole problem!)
      * Tier 3 may reveal one intermediate line, but NOT the final answer
   
   g) explanation: Full explanation following LaTeX rules (sentence + math block + interpretation)
   
   h) keyTakeaway: ONE general rule reusable on similar problems
   
   i) isMisconceptionCheck: true if this step specifically tests a common mistake

   QUALITY RULES for steps:
   - Do NOT reveal the final answer until the last step
   - Prefer conceptual checks before computation
   - Include at least ONE step marked isMisconceptionCheck=true
   - Use plain language, minimal fluff
   - If a faster conceptual criterion exists, mention it

5. METHOD SUMMARY:
   - bullets: 3 key method steps that work for ALL similar problems
   - proTip: (optional) A faster conceptual shortcut if one exists
     Example for sphere/plane: "A sphere intersects a plane iff distance(center, plane) ≤ radius"

6. TOPICS: Map to topic IDs from the allowed list. If no exact match, suggest new topic names.

7. QUESTION TYPE: Category (e.g., "Sphere Intersection", "Volume of Rotation"). Use existing if possible.

Return your response using the analyze_question function.`;

    console.log("Calling Gemini for analysis...");

    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: analysisPrompt }]
        }],
        tools: [{
          functionDeclarations: [{
            name: "analyze_question",
            description: "Provide complete analysis with enhanced Guide Me scaffold",
            parameters: {
              type: "object",
              required: ["correctAnswer", "difficulty", "detailedSolution", "guideMeSteps", "methodSummary", "topicSuggestions", "questionType"],
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
                  description: "Formatted solution with **bold headers**, display math $$equation$$, and **Conclusion**" 
                },
                guideMeSteps: {
                  type: "array",
                  description: "REQUIRED: 3-6 scaffolded steps teaching transferable reasoning. MUST have at least 3 steps.",
                  items: {
                    type: "object",
                    required: ["stepNumber", "stepTitle", "microGoal", "prompt", "choices", "hints", "explanation", "keyTakeaway"],
                    properties: {
                      stepNumber: { type: "number", description: "Step number starting from 1" },
                      stepTitle: { type: "string", description: "Skill name (e.g., 'Identify the center from standard form')" },
                      microGoal: { type: "string", description: "What student will learn in this step" },
                      prompt: { type: "string", description: "Short Socratic question (answerable in <20 seconds)" },
                      choices: {
                        type: "array",
                        description: "Exactly 4 MC options (a-d) with misconception-based distractors",
                        items: {
                          type: "object",
                          required: ["id", "text", "isCorrect"],
                          properties: {
                            id: { type: "string", description: "Choice letter: a, b, c, or d" },
                            text: { type: "string", description: "Choice text with LaTeX if needed" },
                            isCorrect: { type: "boolean", description: "True for the correct choice only" }
                          }
                        }
                      },
                      choiceFeedback: {
                        type: "array",
                        description: "Feedback for each choice explaining why right/wrong",
                        items: {
                          type: "object",
                          properties: {
                            choiceId: { type: "string" },
                            feedback: { type: "string" }
                          }
                        }
                      },
                      hints: {
                        type: "array",
                        description: "Exactly 3 escalating hints: Tier 1 (definition) → Tier 2 (math setup) → Tier 3 (one algebra step)",
                        items: {
                          type: "object",
                          required: ["tier", "text"],
                          properties: {
                            tier: { type: "number", description: "1, 2, or 3" },
                            text: { type: "string", description: "Hint text with LaTeX if needed" }
                          }
                        }
                      },
                      explanation: { type: "string", description: "Full explanation after answering (sentence + math block + interpretation)" },
                      keyTakeaway: { type: "string", description: "ONE general rule reusable on similar problems" },
                      isMisconceptionCheck: { type: "boolean", description: "True if testing common mistake" }
                    }
                  }
                },
                methodSummary: {
                  type: "object",
                  description: "3-bullet method summary and optional pro tip",
                  properties: {
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      description: "3 key method steps for similar problems"
                    },
                    proTip: {
                      type: "string",
                      description: "Optional conceptual shortcut"
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
          }]
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: ["analyze_question"]
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

    // Parse the function call response from Gemini native API
    let analysis: AnalysisResult | null = null;
    
    try {
      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      if (functionCall?.name === "analyze_question" && functionCall?.args) {
        analysis = functionCall.args as AnalysisResult;
      } else {
        console.error("No function call found:", JSON.stringify(geminiResult));
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

    // Build the complete guide_me_steps object with all enhanced data
    const guideData = {
      steps: analysis.guideMeSteps || [],
      methodSummary: analysis.methodSummary || { bullets: [] },
    };

    // Update the question
    const { error: updateError } = await supabase
      .from("questions")
      .update({
        choices: updatedChoices,
        correct_answer: analysis.correctAnswer,
        solution_steps: analysis.detailedSolution ? [analysis.detailedSolution] : null,
        guide_me_steps: guideData,
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
      hasMethodSummary: !!analysis.methodSummary?.bullets?.length,
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
