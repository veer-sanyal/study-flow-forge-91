import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EXTERNAL_SUPABASE_URL, getExternalServiceRoleKey } from "../_shared/external-db.ts";

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
    const supabaseUrl = EXTERNAL_SUPABASE_URL;
    const supabaseServiceKey = getExternalServiceRoleKey();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

      // Fetch topics for this course pack (use scheduled_date directly)
      const { data: topics, error: topicsError } = await supabase
        .from("topics")
        .select("id, title, scheduled_date")
        .eq("course_pack_id", packId);

      if (topicsError) {
        console.error(`Error fetching topics for ${packId}:`, topicsError);
        continue;
      }

      // Calculate and update midterm_coverage for each topic
      // 0 = finals-only, 1/2/3 = midterm numbers
      for (const topic of topics || []) {
        const topicDate = topic.scheduled_date as string | null;

        let midtermCoverage = 0; // Default to finals

        if (topicDate) {
          // Find the first exam whose date is AFTER or on the topic date
          for (const exam of examDates) {
            if (topicDate <= exam.date) {
              midtermCoverage = exam.midtermNumber;
              break;
            }
          }
        }

        console.log(`Topic "${topic.title}" (date ${topicDate}) -> midterm_coverage: ${midtermCoverage}`);

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
