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
    const { jobId } = await req.json();
    console.log("Processing calendar image for job:", jobId);

    if (!jobId) {
      throw new Error("Missing jobId");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    // Call Gemini Vision API via Lovable AI Gateway
    const systemPrompt = `You are an expert at extracting course calendar information from images.
You will be shown an image of a course calendar/schedule. Extract ALL events including:
- Lessons/lectures with topic names
- Recitations
- Exams (midterms, finals)
- Quizzes  
- Homework assignments
- Class activities
- No-class days / holidays
- Reviews

For each event, identify:
- Week number (if shown)
- Day of week (MON, TUE, WED, THU, FRI, SAT, SUN)
- Date (in YYYY-MM-DD format if visible)
- Event type: lesson, recitation, exam, quiz, homework, no_class, review, activity, other
- Title (e.g., "Lecture 01 - Vectors in the plane" or the lecture/event name)
- Description (additional details)
- Topics covered: IMPORTANT - Extract the FULL topic name WITH section number in format "Topic Name (Section#)"
  Examples: "Vectors in the plane (13.1)", "Cross products (13.4)", "Volumes by slicing (6.3)"
  If the lecture shows "Lecture 01 - Vectors in the plane (13.1)", the topic is "Vectors in the plane (13.1)"
  Do NOT just extract the section number alone like "13.1" - always include the descriptive name.
- Homework assignments mentioned
- Location (if specified, like "LILY 1105")
- Time slot (if specified)

Here are the existing topics in this course pack for reference:
${topicList}

Be thorough - extract every single row/entry from the calendar image.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
              {
                type: "text",
                text: "Extract all calendar events from this course schedule image. Return the structured data using the extract_calendar_events tool.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_calendar_events",
              description: "Extract structured calendar events from the course schedule",
              parameters: {
                type: "object",
                properties: {
                  events: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        week_number: { type: "integer", description: "Week number (1, 2, 3, etc.)" },
                        day_of_week: { type: "string", enum: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] },
                        event_date: { type: "string", description: "Date in YYYY-MM-DD format if visible" },
                        event_type: { 
                          type: "string", 
                          enum: ["lesson", "recitation", "exam", "quiz", "homework", "no_class", "review", "activity", "other"] 
                        },
                        title: { type: "string", description: "Event title" },
                        description: { type: "string", description: "Additional details" },
                        topics_covered: { 
                          type: "array", 
                          items: { type: "string" },
                          description: "List of topics with FULL name and section number, e.g. 'Vectors in the plane (13.1)', 'Cross products (13.4)'. Never just the section number alone." 
                        },
                        homework_assignments: { 
                          type: "array", 
                          items: { type: "string" },
                          description: "Homework assignments mentioned" 
                        },
                        location: { type: "string", description: "Location if specified" },
                        time_slot: { type: "string", description: "Time if specified" },
                      },
                      required: ["week_number", "event_type", "title"],
                    },
                  },
                },
                required: ["events"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_calendar_events" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (response.status === 402) {
        throw new Error("Payment required. Please add credits to your workspace.");
      }
      throw new Error(`AI Gateway error: ${response.status}`);
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

    // Parse the tool call response
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "extract_calendar_events") {
      throw new Error("AI did not return expected tool call");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    const events = extractedData.events || [];
    console.log(`Extracted ${events.length} calendar events`);

    // Update progress
    await supabase
      .from("ingestion_jobs")
      .update({ 
        current_step: "B3_inserting",
        progress_pct: 80 
      })
      .eq("id", jobId);

    // Insert calendar events
    let insertedCount = 0;
    let needsReviewCount = 0;

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

    for (const event of events) {
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
          topics_covered: event.topics_covered || [],
          homework_assignments: event.homework_assignments || [],
          location: event.location || null,
          time_slot: event.time_slot || null,
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