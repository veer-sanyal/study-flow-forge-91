import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to parse midterm number from exam title
function parseMidtermNumber(title: string): number | null {
  const match = title.match(/midterm\s*(\d)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { coursePackId } = await req.json();

    console.log(`Backfilling topic midterm_coverage for course pack: ${coursePackId || "all"}`);

    // Fetch course packs to process
    let coursePackIds: string[] = [];
    
    if (coursePackId) {
      coursePackIds = [coursePackId];
    } else {
      const { data: packs, error: packsError } = await supabase
        .from("course_packs")
        .select("id");
      
      if (packsError) throw packsError;
      coursePackIds = (packs || []).map(p => p.id);
    }

    let totalUpdated = 0;

    for (const packId of coursePackIds) {
      console.log(`Processing course pack: ${packId}`);

      // Fetch exam events for this course pack
      const { data: examEvents, error: examError } = await supabase
        .from("calendar_events")
        .select("title, event_date")
        .eq("course_pack_id", packId)
        .eq("event_type", "exam")
        .not("event_date", "is", null)
        .order("event_date", { ascending: true });

      if (examError) {
        console.error(`Error fetching exams for ${packId}:`, examError);
        continue;
      }

      // Parse exam dates - only midterms (not finals)
      const examDates = (examEvents || [])
        .map(e => ({
          midtermNumber: parseMidtermNumber(e.title),
          date: e.event_date as string,
        }))
        .filter((e): e is { midtermNumber: number; date: string } => 
          e.midtermNumber !== null && e.date !== null
        )
        .sort((a, b) => a.date.localeCompare(b.date));

      console.log(`Found ${examDates.length} midterm exams:`, examDates);

      if (examDates.length === 0) {
        console.log(`No midterm exams found for ${packId}, skipping`);
        continue;
      }

      // Fetch topics for this course pack
      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("id, title, scheduled_week")
        .eq("course_pack_id", packId);

      if (topicsError) {
        console.error(`Error fetching topics for ${packId}:`, topicsError);
        continue;
      }

      // Fetch calendar events to get original dates for topics
      const { data: calendarEvents, error: calError } = await supabase
        .from("calendar_events")
        .select("title, event_date, week_number")
        .eq("course_pack_id", packId)
        .eq("event_type", "topic")
        .order("event_date", { ascending: true });

      if (calError) {
        console.error(`Error fetching calendar events for ${packId}:`, calError);
        continue;
      }

      // Create a map of week_number to earliest event_date
      const weekToDate = new Map<number, string>();
      for (const event of calendarEvents || []) {
        if (event.week_number !== null && event.event_date) {
          if (!weekToDate.has(event.week_number) || event.event_date < weekToDate.get(event.week_number)!) {
            weekToDate.set(event.week_number, event.event_date);
          }
        }
      }

      console.log(`Week to date mapping:`, Object.fromEntries(weekToDate));

      // Calculate and update midterm_coverage for each topic
      for (const topic of topics || []) {
        const topicDate = topic.scheduled_week !== null ? weekToDate.get(topic.scheduled_week) : null;
        
        let midtermCoverage: number | null = null;
        
        if (topicDate) {
          // Find the first exam whose date is AFTER or on the topic date
          for (const exam of examDates) {
            if (topicDate <= exam.date) {
              midtermCoverage = exam.midtermNumber;
              break;
            }
          }
        }

        console.log(`Topic "${topic.title}" (week ${topic.scheduled_week}, date ${topicDate}) -> midterm_coverage: ${midtermCoverage}`);

        // Update the topic
        const { error: updateError } = await supabase
          .from("topics")
          .update({ midterm_coverage: midtermCoverage })
          .eq("id", topic.id);

        if (updateError) {
          console.error(`Error updating topic ${topic.id}:`, updateError);
        } else {
          totalUpdated++;
        }
      }
    }

    console.log(`Backfill complete. Updated ${totalUpdated} topics.`);

    return new Response(
      JSON.stringify({ success: true, updated: totalUpdated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in backfill-topic-coverage:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
