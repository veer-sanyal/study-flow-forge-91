
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

/**
 * script: distribute-topics-to-exams
 * 
 * Goal: Map topics to exams based on their covered_at/scheduled_date.
 * Logic:
 * 1. Backfill topics.scheduled_date from calendar_events (using update_topic_scheduled_dates RPC).
 * 2. For each exam event:
 *    - Find all topics where scheduled_date <= exam.event_date
 *    - AND scheduled_date > previous_exam.event_date
 * 
 * Approach:
 * - Get all exams sorted by date.
 * - Get all topics with dates.
 * - For each exam, find topics <= exam.date.
 * - Update calendar_events.topics_covered with titles.
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables:');
    console.error('  VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log("Starting distribute-topics-to-exams...");

    // 1. Backfill topic dates first (using the updated MAX logic)
    console.log("Backfilling topic dates from calendar/material...");
    // Note: This RPC might fail if it doesn't exist yet (migration not run)
    const { data: backfillResult, error: backfillError } = await supabase.rpc('update_topic_scheduled_dates');

    if (backfillError) {
        console.error("Failed to run update_topic_scheduled_dates:", backfillError);
        // Don't exit vs warn? Users might run this before migration. 
        // We should fail loudly so they know to run the migration.
        process.exit(1);
    }
    console.log(`Updated dates for ${backfillResult} topics.`);

    // 2. Fetch all exams
    const { data: exams, error: examsError } = await supabase
        .from('calendar_events')
        .select('*')
        .in('event_type', ['midterm', 'exam', 'final'])
        .order('event_date', { ascending: true });

    if (examsError) {
        console.error("Failed to fetch exams:", examsError);
        process.exit(1);
    }

    // 3. Fetch all topics with dates
    const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('id, title, scheduled_date, course_pack_id')
        .not('scheduled_date', 'is', null)
        .order('scheduled_date', { ascending: true });

    if (topicsError) {
        console.error("Failed to fetch topics:", topicsError);
        process.exit(1);
    }

    console.log(`Found ${exams.length} exams and ${topics.length} dated topics.`);

    // 4. Distribute
    for (let i = 0; i < exams.length; i++) {
        const exam = exams[i];
        // Previous exam date logic: 
        // If it's the first exam, we might want to capture EVERYTHING before it?
        // User said "all topics covered before the exam date are set as covered in that exam".
        // This implies Cumulative for the specific exam bucket. 
        // Usually midterms claim topics between (Prev, Current].

        // Let's deduce based on index.
        const prevExamDateStr = i > 0 ? exams[i - 1].event_date : null;
        const prevExamDate = prevExamDateStr ? new Date(prevExamDateStr) : new Date(0); // Epoch 0 if first

        const relevantTopics = topics.filter(t => {
            // Must match course pack
            if (t.course_pack_id !== exam.course_pack_id) return false;

            const tDate = new Date(t.scheduled_date!); // we filtered nulls
            const eDate = new Date(exam.event_date);

            // Strict logic: Topics covered AFTER previous exam AND BEFORE/ON current exam
            const isAfterPrev = tDate > prevExamDate;
            const isBeforeOrOnCurrent = tDate <= eDate;

            return isAfterPrev && isBeforeOrOnCurrent;
        });

        const topicTitles = relevantTopics.map(t => t.title);

        if (topicTitles.length > 0) {
            // Update the exam event
            // We merge with existing topics just in case
            const existing = exam.topics_covered || [];
            const merged = Array.from(new Set([...existing, ...topicTitles]));

            console.log(`Exam "${exam.title}" (${exam.event_date}): Assigning ${relevantTopics.length} new topics (Total: ${merged.length})`);

            const { error: updateError } = await supabase
                .from('calendar_events')
                .update({ topics_covered: merged })
                .eq('id', exam.id);

            if (updateError) {
                console.error(`Failed to update exam ${exam.title}:`, updateError);
            }
        } else {
            console.log(`Exam "${exam.title}" (${exam.event_date}): No new topics found in window.`);
        }
    }

    console.log("Done.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
