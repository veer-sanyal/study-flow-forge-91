import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    const { jobId } = await req.json();
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
    const systemPrompt = `You are an expert at extracting DISTINCT TOPICS from course calendar images.

Your PRIMARY goal is to extract every unique TOPIC that will be covered in the course, along with the EXACT DATE it is covered.

IMPORTANT RULES:
1. ONLY extract actual academic TOPICS (math concepts, course content sections)
2. DO NOT extract:
   - Recitations (skip these entirely)
   - Lectures as events (only extract the TOPICS covered in lectures)
   - Reviews (skip these)
   - "No class" days
   - Generic activities
3. If a lecture covers MULTIPLE topics on the same line, create a SEPARATE entry for EACH topic
   Example: "Lecture 05 - Dot products (13.3) and Cross products (13.4)" becomes TWO separate topic entries:
     - "13.3: Dot Products" on that date
     - "13.4: Cross Products" on that date
4. Format topic names as "SECTION#: Topic Name" (e.g., "13.1: Vectors in the Plane", "6.3: Volumes by Slicing")
5. Extract the EXACT DATE (YYYY-MM-DD format) for when each topic is covered
6. Still track the week number for organization purposes
7. IMPORTANT: If the SAME topic appears on MULTIPLE consecutive days (multi-day coverage), create a separate entry for EACH day. The downstream system will handle consolidation.

For EXAMS and QUIZZES, DO extract them with:
- event_type: "exam" or "quiz"
- The exact date
- Week number

Here are the existing topics in this course pack for reference:
${topicList}

Be thorough - extract every DISTINCT topic from the calendar, splitting multi-topic entries into individual topics.`;

    const userPrompt = systemPrompt + "\n\nExtract all DISTINCT TOPICS from this course schedule image. For each topic, identify the EXACT date it is covered. If a single row contains multiple topics, create separate entries for each. If the same topic is covered over multiple days, still create an entry for each day. Skip recitations, reviews, lectures (extract only the topics from them). Format each topic as 'SECTION#: Topic Name'. Return the structured data using the extract_calendar_events tool.";

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=" + GEMINI_API_KEY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
                      description: { type: "string", description: "Additional details or context" },
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
          temperature: 0.2
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);

      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const aiResult = await response.json();
    console.log("AI response received");

    // Update progress
    await supabase
      .from("ingestion_jobs")
      .update({ 
        current_step: "B2_parsing",
        progress_pct: 60 
      })
      .eq("id", jobId);

    // Parse Gemini native API response format
    const functionCall = aiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (!functionCall || functionCall.name !== "extract_calendar_events") {
      throw new Error("AI did not return expected function call");
    }

    const extractedData = functionCall.args;
    const events = extractedData?.events || [];
    console.log(`Extracted ${events.length} calendar events`);

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

      const { error: insertError } = await supabase
        .from("calendar_events")
        .insert({
          course_pack_id: job.course_pack_id,
          ingestion_job_id: jobId,
          week_number: event.week_number || 0,
          day_of_week: event.day_of_week || null,
          event_date: parsedDate,
          event_type: event.event_type,
          title: event.title,
          description: event.description || null,
          // For topics, store the title as the topic covered
          topics_covered: event.event_type === "topic" ? [event.title] : [],
          homework_assignments: [],
          location: null,
          time_slot: null,
          needs_review: needsReview,
        });

      if (insertError) {
        console.error("Error inserting event:", insertError);
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

    // Try to update job status to failed
    try {
      const { jobId } = await req.clone().json().catch(() => ({}));
      if (jobId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
