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

    const topicsList = existingTopics?.map((t) => `- ${t.title} (ID: ${t.id})`).join("\n") || "No topics defined yet";

    // Get existing question types
    const { data: existingQuestionTypes } = await supabase
      .from("question_types")
      .select("id, name, aliases")
      .eq("course_pack_id", question.course_pack_id);

    const questionTypesList =
      existingQuestionTypes
        ?.map((qt) => {
          const aliases = qt.aliases?.length ? ` (aliases: ${qt.aliases.join(", ")})` : "";
          return `- ${qt.name}${aliases} (ID: ${qt.id})`;
        })
        .join("\n") || "No question types defined yet";

    // Format the question for analysis
    const choicesText = question.choices?.map((c: any) => `${c.id}) ${c.text}`).join("\n") || "No choices";

    // Check if question has an image and fetch it
    let imageBase64: string | null = null;
    let imageMimeType: string | null = null;

    if (question.image_url) {
      console.log("Question has image, fetching...", question.image_url);
      try {
        const imageResponse = await fetch(question.image_url);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const uint8Array = new Uint8Array(imageBuffer);

          // Convert to base64 in chunks to avoid stack overflow
          let binary = "";
          const chunkSize = 32768;
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          imageBase64 = btoa(binary);

          // Determine mime type from URL or content-type header
          const contentType = imageResponse.headers.get("content-type");
          imageMimeType = contentType || "image/png";
          console.log("Image fetched successfully, size:", imageBuffer.byteLength);
        } else {
          console.warn("Failed to fetch question image:", imageResponse.status);
        }
      } catch (imgError) {
        console.error("Error fetching question image:", imgError);
      }
    }

    const analysisPrompt = `You are an expert math tutor generating an analysis + a “Guide Me” learning scaffold for an exam question.

PRIMARY GOAL:
Teach the TRANSFERABLE REASONING PROCESS (reusable for similar problems), not just the answer.

INPUTS:
QUESTION:
${question.prompt}

CHOICES (exact text):
${choicesText}

AVAILABLE TOPICS (map to these IDs only):
${topicsList}

EXISTING QUESTION TYPES (use one of these if possible):
${questionTypesList}

========================
GROUNDING + GUARDRAILS
========================
- Use ONLY the information in QUESTION and CHOICES. Do NOT assume extra constraints, units, diagrams, or hidden context.
- Do NOT fabricate topic IDs or question types. Use exactly what is provided in the lists.
- If the prompt is ambiguous, state the ambiguity in 1 short sentence and proceed with the most standard interpretation.
- Do NOT include any meta/UI options as answers (e.g., “Skip”, “Not sure”, “I need help”). All choices must be content answers.

========================
LATEX + RENDERING RULES (MUST FOLLOW)
========================
Renderer supports ONLY $...$ (inline) and $$...$$ (display). Do NOT use \( \) or \[ \].

INLINE vs DISPLAY:
- Use inline math $...$ ONLY for short expressions.
- Use display math $$...$$ for any multi-step work, substitutions, derived equations, or any “long” expression.

========================
VISUAL READABILITY RULES (CRITICAL)
========================
These rules exist to prevent “math + text mush” and must be followed everywhere (solution + Guide Me).

1) BLOCK SPACING (newline discipline)
- Use blank lines to separate blocks.
- Never place display math immediately adjacent to text.
  Always include a blank line BEFORE and AFTER any $$...$$ block.

2) INLINE MATH LIMIT
- At most ONE inline math segment per sentence.
- If a sentence would need 2+ inline math segments, rewrite using a display math block instead.

3) DISPLAY MATH TRIGGERS (use $$...$$ if any are true)
- Expression contains 2+ +/− terms (e.g., (x-1)^2+(y-2)^2+...)
- Expression includes equality/inequality and is longer than ~20–25 characters
- Expression contains parentheses with powers (e.g., (x-h)^2)
- Expression is the result of a substitution/simplification
- Expression is something the student should “see as a whole” (sphere forms, circle forms, integral setup)

4) LONG EQUATION RULE (required formatting)
- If an equation is long, format it using aligned with at most 2 lines:

$$
\begin{aligned}
\text{label: } &\quad \text{(short label only)} \\
\text{line 1} \\
\text{line 2 (optional)}
\end{aligned}
$$

- Keep aligned blocks to MAX 2 math lines (plus an optional short label line).
- Do NOT chain many equalities on one line.

5) TEXT vs MATH
- Keep narrative in plain text.
- Use \text{...} inside math ONLY for short labels (not full sentences).
- Never put long phrases inside math mode.

========================
LATEX STYLE RULES (MUST FOLLOW)
========================
- Fractions: \frac{...}{...}
- Radicals: \sqrt{...}
- Inequalities: \le, \ge
- Integrals: \int_{a}^{b} \cdots \, dx  (include \, before dx)
- Spacing: \quad only when needed
- Parentheses: \left( ... \right) for tall expressions
- Absolute value: |x| (not abs(x))
- Avoid expanding unless necessary.

========================
OUTPUT FORMAT (STRICT)
========================
Return ONLY a JSON object that matches the analyze_question function schema.
Do not include any extra commentary.

Include these top-level fields:
- correctChoiceLetter: one of ["a","b","c","d","e"] (or more if present)
- correctChoiceText: exact choice text as shown in CHOICES
- difficulty: integer 1–5
- plan: 1 sentence describing the method (no math)
- detailedSolution: structured sections (see below)
- guideMeSteps: array of 3–6 steps (see below)
- methodSummary: { bullets: [3 items], proTip?: string }
- topicIds: array of topic IDs from AVAILABLE TOPICS only
- topicSuggestions: array of strings (ONLY if topicIds is empty)
- questionType: one of EXISTING QUESTION TYPES if possible, else "Other"
- questionTypeSuggestion: string (ONLY if questionType is "Other")

========================
DETAILED SOLUTION REQUIREMENTS
========================
Write detailedSolution with these sections and constraints:

**Plan**
- Exactly 1 sentence. No math.

**Work**
- Step-by-step.
- Every step MUST follow this exact 3-part pattern:
  1) 1 plain-English sentence describing the idea (max 1 sentence)
  2) then one $$...$$ block with exact math (max 3 lines; use aligned if long)
  3) then 1 plain-English interpretation sentence (max 1 sentence)
- Enforce the Visual Readability Rules above (blank lines around display math, etc.).

**Final Check**
- 1–2 lines verifying reasonableness (domain/sign/choice elimination).

**Conclusion**
- State the correct choice letter AND match to exact choice text.

========================
GUIDE ME STEPS (3–6 steps, STRICT)
========================
Each step MUST include:

a) stepTitle: short skill name

b) microGoal: 1 sentence describing what the student learns (no math unless tiny)

c) prompt: short Socratic question (<= 140 characters, answerable in < 20 seconds)
   - Avoid long inline math in the prompt.
   - If math is needed, keep it minimal (prefer “Which plane sets x=0?” over long equations).

d) choices: EXACTLY 4 options (a–d)
   - ALL must be content answers (NO meta/UI options like “Skip”, “Not sure”, “I need help”)
   - Keep each choice <= 90 characters unless it is pure LaTeX.
   - Wrong choices must be realistic misconceptions.

e) correctChoice: one of ["a","b","c","d"]

f) choiceFeedback: feedback for EACH option (<= 1 sentence each)
   - correct: why it’s right
   - wrong: why it’s tempting but wrong (name the misconception)
   - Keep feedback short and clear.

g) hints: Tier1/Tier2/Tier3 with escalation (not rephrasing)
   - Tier1: 1 sentence recall (definition/concept)
   - Tier2: 1 sentence translate to setup
   - Tier3: EXACTLY one helpful algebra move (ONE display math line) + 1 short sentence
     * Tier3 MUST NOT finish the full problem or reveal the final answer early.
     * Tier3 MUST obey blank lines around $$...$$.

h) explanation: must ONLY justify this step’s microGoal and MUST be:
   - 1 sentence (idea)
   - blank line
   - $$...$$ (max 2 math lines; use aligned if needed)
   - blank line
   - 1 sentence (interpretation)
   * Do NOT restate the entire problem.
   * Do NOT leak the final choice before the final step.

i) keyTakeaway: 1 general rule reusable for similar problems (plain English)

j) isMisconceptionCheck: boolean (at least one step must be true)

k) misconceptionType: one of ["definition","setup","algebra_sign"] (primary misconception tested)

QUALITY RULES FOR GUIDE ME:
- Do NOT reveal the final answer choice until the FINAL step.
- Steps should progress concept → setup → compute → interpret → choose.
- Prefer conceptual checks before computation.
- Include at least ONE step with isMisconceptionCheck=true.
- If a faster conceptual criterion exists, do NOT use it to shortcut early steps.
  Mention it only at the end inside methodSummary.proTip (1 sentence).

========================
METHOD SUMMARY
========================
Provide:
- bullets: exactly 3 short bullet items describing the universal method
- proTip (optional): 1 sentence shortcut (only at the end, non-spoiling)

========================
TOPIC + TYPE MAPPING
========================
- topicIds must contain ONLY IDs from AVAILABLE TOPICS.
- If none match, topicIds=[], and fill topicSuggestions with 1–3 concise names.
- questionType must match EXISTING QUESTION TYPES if possible.
- If none match, questionType="Other" and provide questionTypeSuggestion.

Now generate the analysis and return using analyze_question.`;

    console.log("Calling Gemini for analysis...");

    // Build content parts - include image if available
    const contentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (imageBase64 && imageMimeType) {
      // Add image first for better context
      contentParts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64,
        },
      });
      contentParts.push({
        text:
          "The above image is the diagram/figure for this question. Use it to understand the visual context.\n\n" +
          analysisPrompt,
      });
    } else {
      contentParts.push({ text: analysisPrompt });
    }

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
              parts: contentParts,
            },
          ],
          tools: [
            {
              functionDeclarations: [
                {
                  name: "analyze_question",
                  description: "Provide complete analysis with enhanced Guide Me scaffold",
                  parameters: {
                    type: "object",
                    required: [
                      "correctAnswer",
                      "difficulty",
                      "detailedSolution",
                      "guideMeSteps",
                      "methodSummary",
                      "topicSuggestions",
                      "questionType",
                    ],
                    properties: {
                      correctAnswer: {
                        type: "string",
                        description: "The correct choice letter (a, b, c, d, or e)",
                      },
                      difficulty: {
                        type: "number",
                        description: "Difficulty 1-5",
                      },
                      detailedSolution: {
                        type: "string",
                        description:
                          "Formatted solution with **bold headers**, display math $$equation$$, and **Conclusion**",
                      },
                      guideMeSteps: {
                        type: "array",
                        description:
                          "REQUIRED: 3-6 scaffolded steps teaching transferable reasoning. MUST have at least 3 steps.",
                        items: {
                          type: "object",
                          required: [
                            "stepNumber",
                            "stepTitle",
                            "microGoal",
                            "prompt",
                            "choices",
                            "hints",
                            "explanation",
                            "keyTakeaway",
                          ],
                          properties: {
                            stepNumber: { type: "number", description: "Step number starting from 1" },
                            stepTitle: {
                              type: "string",
                              description: "Skill name (e.g., 'Identify the center from standard form')",
                            },
                            microGoal: { type: "string", description: "What student will learn in this step" },
                            prompt: {
                              type: "string",
                              description: "Short Socratic question (answerable in <20 seconds)",
                            },
                            choices: {
                              type: "array",
                              description: "Exactly 4 MC options (a-d) with misconception-based distractors",
                              items: {
                                type: "object",
                                required: ["id", "text", "isCorrect"],
                                properties: {
                                  id: { type: "string", description: "Choice letter: a, b, c, or d" },
                                  text: { type: "string", description: "Choice text with LaTeX if needed" },
                                  isCorrect: { type: "boolean", description: "True for the correct choice only" },
                                },
                              },
                            },
                            choiceFeedback: {
                              type: "array",
                              description: "Feedback for each choice explaining why right/wrong",
                              items: {
                                type: "object",
                                properties: {
                                  choiceId: { type: "string" },
                                  feedback: { type: "string" },
                                },
                              },
                            },
                            hints: {
                              type: "array",
                              description:
                                "Exactly 3 escalating hints: Tier 1 (definition) → Tier 2 (math setup) → Tier 3 (one algebra step)",
                              items: {
                                type: "object",
                                required: ["tier", "text"],
                                properties: {
                                  tier: { type: "number", description: "1, 2, or 3" },
                                  text: { type: "string", description: "Hint text with LaTeX if needed" },
                                },
                              },
                            },
                            explanation: {
                              type: "string",
                              description: "Full explanation after answering (sentence + math block + interpretation)",
                            },
                            keyTakeaway: {
                              type: "string",
                              description: "ONE general rule reusable on similar problems",
                            },
                            isMisconceptionCheck: { type: "boolean", description: "True if testing common mistake" },
                          },
                        },
                      },
                      methodSummary: {
                        type: "object",
                        description: "3-bullet method summary and optional pro tip",
                        properties: {
                          bullets: {
                            type: "array",
                            items: { type: "string" },
                            description: "3 key method steps for similar problems",
                          },
                          proTip: {
                            type: "string",
                            description: "Optional conceptual shortcut",
                          },
                        },
                      },
                      topicSuggestions: {
                        type: "array",
                        items: { type: "string" },
                        description: "Topic IDs or new topic names",
                      },
                      unmappedTopicSuggestions: {
                        type: "array",
                        items: { type: "string" },
                        description: "New topic names if not in allowed list",
                      },
                      questionType: {
                        type: "string",
                        description: "Question type/category",
                      },
                      isNewQuestionType: {
                        type: "boolean",
                        description: "True if this is a new question type",
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
              allowedFunctionNames: ["analyze_question"],
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
    const topicMap = new Map(existingTopics?.map((t) => [t.title.toLowerCase(), t.id]) || []);
    const questionTypeMap = new Map(existingQuestionTypes?.map((qt) => [qt.name.toLowerCase(), qt.id]) || []);

    // Add aliases
    existingQuestionTypes?.forEach((qt) => {
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
    const updatedChoices =
      question.choices?.map((c: any) => ({
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

    return new Response(
      JSON.stringify({
        success: true,
        correctAnswer: analysis.correctAnswer,
        difficulty: analysis.difficulty,
        topicsMapped: mappedTopicIds.length,
        guideMeSteps: analysis.guideMeSteps?.length || 0,
        hasMethodSummary: !!analysis.methodSummary?.bullets?.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
