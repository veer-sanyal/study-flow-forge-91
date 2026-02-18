import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EXTERNAL_SUPABASE_URL, getExternalServiceRoleKey } from "../_shared/external-db.ts";

const allowedOrigins = [
  "https://study-flow-forge-91.lovable.app",
  "https://study-flow-forge-91.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const getCorsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
});

serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseServiceKey = getExternalServiceRoleKey();
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

    const supabaseUrl = EXTERNAL_SUPABASE_URL;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Safely parse body
    let jobId: string | null = null;
    let body;
    try {
      body = await req.json();
      jobId = body.jobId;
    } catch (e) {
      throw new Error("Invalid request body");
    }

    console.log("Processing calendar image for job:", jobId);

    if (!jobId) {
      throw new Error("Missing jobId");
    }

    // Fetch the ingestion job
    const { data: job, error: jobError } = await supabase
      .from("ingestion_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message}`);
    }

    console.log("Found job:", job.file_name, "kind:", job.kind);

    // Update job status to processing
    await supabase
      .from("ingestion_jobs")
      .update({
        status: "processing",
        current_step: "A1_downloading",
        progress_pct: 10
      })
      .eq("id", jobId);

    // Download the image from storage
    const { data: imageData, error: downloadError } = await supabase.storage
      .from("calendar-images")
      .download(job.file_path);

    if (downloadError || !imageData) {
      throw new Error(`Failed to download image: ${downloadError?.message}`);
    }

    console.log("Downloaded image, size:", imageData.size);

    // Update progress
    await supabase
      .from("ingestion_jobs")
      .update({
        current_step: "A2_converting",
        progress_pct: 20
      })
      .eq("id", jobId);

    // Convert to base64
    const arrayBuffer = await imageData.arrayBuffer();
    const base64Image = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // Determine mime type from file extension
    const ext = job.file_name.split(".").pop()?.toLowerCase() || "png";
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      ext === "webp" ? "image/webp" : "image/png";

    console.log("Converted to base64, mime type:", mimeType);

    // Update progress
    await supabase
      .from("ingestion_jobs")
      .update({
        current_step: "B1_analyzing",
        progress_pct: 30
      })
      .eq("id", jobId);

    // Fetch existing topics for this course pack to help with mapping
    const { data: existingTopics } = await supabase
      .from("topics")
      .select("id, title")
      .eq("course_pack_id", job.course_pack_id);

    const topicList = existingTopics?.map(t => `- ${t.title} (ID: ${t.id})`).join("\n") || "No topics yet";

    // Call Gemini Vision API
    const systemPrompt = `You are an expert at extracting TOPICS and EVENTS from university course schedule images.

Your PRIMARY goal is to extract every TOPIC or CONTENT UNIT that will be covered in the course, along with the EXACT DATE it is covered. This works for ANY subject — math, finance, business, engineering, humanities, etc.

IMPORTANT RULES:
1. Extract every academic TOPIC, CHAPTER, MODULE, or CONTENT UNIT mentioned in the schedule.
   - Examples: "Time Value of Money", "Bond Valuation", "13.1: Vectors", "Supply and Demand", "Chapter 5: Risk and Return"
2. DO NOT extract:
   - Recitations or discussion sections (skip these)
   - "No class" / holidays / breaks
   - "Final Review", "Exam Review", or "Course Recap" (these are NOT topics)
   - Generic labels like "Lecture 1" with no topic content
3. If a row mentions MULTIPLE topics, create a SEPARATE entry for EACH topic.
4. TITLE FORMAT — CRITICAL:
   - Use ONLY the topic name as it appears in the image
   - If there is a textbook section number visible (e.g., "8.3", "13.1"), include it: "13.1: Vectors in the Plane"
   - DO NOT add your own sequential numbering (no "01 -", "02 -", "09 -", "10 -", etc.)
   - DO NOT prefix topics with lecture numbers, ordinal numbers, or any numbering that is not a textbook section
   - WRONG: "09 - Physical applications of integrals I (8.7)"
   - RIGHT: "Physical applications of integrals I (8.7)" or "8.7: Physical Applications of Integrals"
5. DESCRIPTION FORMAT — CRITICAL:
   - Start directly with the action or subject: "Interprets financial statements..." or "Explains the concept of..."
   - DO NOT start with "This topic covers", "This module discusses", "In this lecture", etc.
   - Keep it concise (1 sentence).
6. Extract the EXACT DATE in YYYY-MM-DD format for when each topic is covered.
7. Track the week number for organization.
8. If the SAME topic appears on MULTIPLE days, create a separate entry for EACH day.

For EXAMS, MIDTERMS, FINALS, and QUIZZES:
- Extract with event_type: "exam" or "quiz"
- Include the exact date and week number

Here are the existing topics in this course pack for reference:
${topicList}

Be thorough — extract EVERY topic/content unit from the schedule. Even if you're unsure about exact dates, still extract the topic with your best estimate.`;

    const userPrompt = systemPrompt + "\n\nLook at this course schedule image carefully. Extract ALL topics/content units and exams. For each, identify the exact date. Create separate entries for distinct topics even if they're on the same row. Use the extract_calendar_events tool to return the structured data. Do NOT return an empty array — there should be topics visible in this image.";

    // Helper: call Gemini with a given model and return parsed events
    const callGemini = async (model: string): Promise<unknown[]> => {
      console.log(`Calling Gemini model: ${model}`);
      const geminiBody = {
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image,
              },
            },
            { text: userPrompt },
          ],
        }],
        tools: [{
          functionDeclarations: [{
            name: "extract_calendar_events",
            description: "Extract distinct topics and exam events from the course schedule. Each topic should be a separate entry even if multiple topics are on the same calendar line. If the same topic spans multiple days, create separate entries for each day.",
            parameters: {
              type: "object",
              properties: {
                events: {
                  type: "array",
                  description: "Array of distinct topics and exams. If a single calendar row has multiple topics, create separate entries for each. If the same topic is taught over multiple days, create an entry for each day.",
                  items: {
                    type: "object",
                    properties: {
                      week_number: { type: "integer", description: "Week number (1, 2, 3, etc.)" },
                      day_of_week: { type: "string", enum: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] },
                      event_date: { type: "string", description: "EXACT date in YYYY-MM-DD format. This is REQUIRED for topics." },
                      event_type: {
                        type: "string",
                        enum: ["topic", "exam", "quiz"],
                        description: "Use 'topic' for academic content, 'exam' for midterms/finals, 'quiz' for quizzes. Do NOT use 'lesson', 'recitation', 'review', etc."
                      },
                      title: {
                        type: "string",
                        description: "For topics: Format as 'SECTION#: Topic Name' (e.g., '13.1: Vectors in the Plane', '6.3: Volumes by Slicing'). For exams: The exam name (e.g., 'Midterm 1', 'Final Exam')."
                      },
                      description: { type: "string", description: "A single sentence explaining what this topic covers academically. Required for topic events." },
                    },
                    required: ["week_number", "event_type", "title", "event_date"],
                  },
                },
              },
              required: ["events"],
            },
          }]
        }],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: ["extract_calendar_events"]
          }
        },
        generationConfig: {
          temperature: 0.2,
          // Disable thinking for flash (causes empty results); enable for pro-preview
          ...(model.includes("flash")
            ? { thinkingConfig: { thinkingBudget: 0 } }
            : model.includes("pro-preview")
              ? { thinkingConfig: { includeThoughts: true } }
              : {}),
        }
      };

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        }
      );

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`Gemini API error (${model}):`, resp.status, errorText);
        if (resp.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }
        throw new Error(`Gemini API error: ${resp.status}`);
      }

      const result = await resp.json();
      console.log(`AI response received from ${model}`);

      const fc = result.candidates?.[0]?.content?.parts?.find(
        (p: Record<string, unknown>) => p.functionCall
      )?.functionCall;
      if (!fc || fc.name !== "extract_calendar_events") {
        console.error(`${model} did not return expected function call. Response:`, JSON.stringify(result).slice(0, 2000));
        throw new Error("AI did not return expected function call");
      }

      return fc.args?.events || [];
    };

    // Try gemini-3-pro-preview with thinking enabled
    let events = await callGemini("gemini-3-pro-preview");
    console.log(`Extracted ${events.length} events from gemini-3-pro-preview`);

    if (events.length === 0) {
      console.warn("Pro preview returned 0 events, retrying with gemini-2.5-pro...");

      await supabase
        .from("ingestion_jobs")
        .update({ current_step: "B1_retry_pro", progress_pct: 45 })
        .eq("id", jobId);

      try {
        events = await callGemini("gemini-2.5-pro");
        console.log(`Extracted ${events.length} events from gemini-2.5-pro`);
      } catch (retryErr) {
        console.error("Pro fallback also failed:", retryErr instanceof Error ? retryErr.message : retryErr);
      }
    }

    if (events.length > 0) {
      console.log("First event sample:", JSON.stringify(events[0]));
    } else {
      console.warn("WARNING: Both models returned 0 events");
    }

    // Update progress
    await supabase
      .from("ingestion_jobs")
      .update({
        current_step: "B2_parsing",
        progress_pct: 60
      })
      .eq("id", jobId);

    // Update progress
    await supabase
      .from("ingestion_jobs")
      .update({
        current_step: "B3_inserting",
        progress_pct: 80
      })
      .eq("id", jobId);

    // Helper to validate and fix date format
    const parseEventDate = (dateStr: string | null | undefined): string | null => {
      if (!dateStr || dateStr === "TBD" || dateStr.toLowerCase() === "tbd") {
        return null;
      }
      // If it's already a full date (YYYY-MM-DD), return it
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
      }
      // If it's MM-DD format, assume current year
      if (/^\d{2}-\d{2}$/.test(dateStr)) {
        const currentYear = new Date().getFullYear();
        return `${currentYear}-${dateStr}`;
      }
      // If it's M/D or MM/DD format
      const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (slashMatch) {
        const currentYear = new Date().getFullYear();
        const month = slashMatch[1].padStart(2, '0');
        const day = slashMatch[2].padStart(2, '0');
        return `${currentYear}-${month}-${day}`;
      }
      // Can't parse, return null
      console.warn("Could not parse date:", dateStr);
      return null;
    };

    // Helper to extract base topic name (removing section numbers for grouping)
    const extractBaseTopic = (title: string): string => {
      // Remove section prefix like "13.1: " or "6.3: "
      return title.replace(/^\d+(?:\.\d+)?\s*:\s*/, '').trim().toLowerCase();
    };

    // Helper to get section number
    const extractSection = (title: string): string | null => {
      const match = title.match(/^(\d+(?:\.\d+)?)\s*:/);
      return match ? match[1] : null;
    };

    // Group topic events by their base name to detect multi-day topics
    const topicGroups = new Map<string, typeof events>();
    const nonTopicEvents: typeof events = [];

    for (const event of events) {
      if (event.event_type === "topic") {
        const section = extractSection(event.title);
        const baseTopic = extractBaseTopic(event.title);
        // Use section number if available, otherwise base topic name
        const groupKey = section || baseTopic;

        if (!topicGroups.has(groupKey)) {
          topicGroups.set(groupKey, []);
        }
        topicGroups.get(groupKey)!.push(event);
      } else {
        nonTopicEvents.push(event);
      }
    }

    // Process topic groups and add "Part X" suffix for multi-day topics
    const processedEvents: typeof events = [];

    for (const [groupKey, groupEvents] of topicGroups) {
      // Sort by date
      groupEvents.sort((a: { event_date?: string }, b: { event_date?: string }) => {
        const dateA = parseEventDate(a.event_date) || '';
        const dateB = parseEventDate(b.event_date) || '';
        return dateA.localeCompare(dateB);
      });

      if (groupEvents.length === 1) {
        // Single day topic - no suffix needed
        processedEvents.push(groupEvents[0]);
      } else {
        // Multi-day topic - add "Part 1", "Part 2", etc.
        groupEvents.forEach((event: { title: string }, index: number) => {
          const partNumber = index + 1;
          processedEvents.push({
            ...event,
            title: `${event.title} - Part ${partNumber}`,
          });
        });
      }
    }

    // Add non-topic events back
    processedEvents.push(...nonTopicEvents);

    // Insert calendar events
    let insertedCount = 0;
    let needsReviewCount = 0;

    for (const event of processedEvents) {
      const parsedDate = parseEventDate(event.event_date);
      // Mark as needs_review if it's an exam or has missing date
      const needsReview = event.event_type === "exam" || !parsedDate;
      if (needsReview) needsReviewCount++;

      const insertPayload = {
        course_pack_id: job.course_pack_id,
        ingestion_job_id: jobId,
        week_number: event.week_number || 0,
        day_of_week: event.day_of_week || null,
        event_date: parsedDate,
        event_type: event.event_type,
        title: event.title,
        description: event.description || null,
        needs_review: needsReview,
      };

      console.log(`Inserting event: ${JSON.stringify(insertPayload)}`);

      const { error: insertError } = await supabase
        .from("calendar_events")
        .insert(insertPayload);

      if (insertError) {
        console.error("Error inserting event:", JSON.stringify(insertError));
      } else {
        insertedCount++;
      }
    }

    console.log(`Inserted ${insertedCount} events, ${needsReviewCount} need review`);

    // Update job as completed
    await supabase
      .from("ingestion_jobs")
      .update({
        status: "completed",
        current_step: "done",
        progress_pct: 100,
        completed_at: new Date().toISOString(),
        questions_extracted: insertedCount,
        questions_pending_review: needsReviewCount,
      })
      .eq("id", jobId);

    return new Response(
      JSON.stringify({
        success: true,
        eventsExtracted: insertedCount,
        needsReview: needsReviewCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing calendar image:", error);

    // Try to update job status to failed using the jobId captured earlier
    // For this error handler, we need to construct a new client since the main one might have failed or not initialized
    if (typeof jobId !== 'undefined' && jobId) {
      try {
        const supabaseUrl = EXTERNAL_SUPABASE_URL;
        const supabaseServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          await supabase
            .from("ingestion_jobs")
            .update({
              status: "failed",
              error_message: error instanceof Error ? error.message : "Unknown error",
            })
            .eq("id", jobId);
        }
      } catch (e) {
        console.error("Failed to update job status:", e);
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
