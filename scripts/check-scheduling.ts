#!/usr/bin/env tsx
/**
 * Script to check if the scheduling algorithm (FSRS) is working correctly
 * Checks:
 * 1. If srs_state table has data
 * 2. If build_daily_plan function works
 * 3. If FSRS columns are populated
 * 
 * Usage: npx tsx scripts/check-scheduling.ts [user_id]
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('  VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkScheduling() {
  const userId = process.argv[2];

  if (!userId) {
    console.log('Usage: npx tsx scripts/check-scheduling.ts <user_id>');
    console.log('\nTo get a user_id, check the auth.users table or use a test user.');
    process.exit(1);
  }

  console.log(`Checking scheduling algorithm for user: ${userId}\n`);

  // 1. Check if user exists
  const { data: user, error: userError } = await supabase.auth.admin.getUserById(userId);
  if (userError || !user) {
    console.error('❌ User not found:', userError?.message);
    process.exit(1);
  }
  console.log('✓ User found:', user.user.email || user.user.id);

  // 2. Check srs_state table
  console.log('\n=== SRS State Check ===');
  const { data: srsStates, error: srsError } = await supabase
    .from('srs_state')
    .select('*')
    .eq('user_id', userId)
    .limit(10);

  if (srsError) {
    console.error('❌ Error fetching srs_state:', srsError);
  } else {
    console.log(`✓ Found ${srsStates?.length || 0} SRS states`);
    
    if (srsStates && srsStates.length > 0) {
      const sample = srsStates[0];
      console.log('\nSample SRS state:');
      console.log('  - Question ID:', sample.question_id);
      console.log('  - Due at:', sample.due_at);
      console.log('  - Last reviewed:', sample.last_reviewed_at);
      console.log('  - Reps:', sample.reps);
      console.log('  - Stability:', sample.stability);
      console.log('  - Difficulty:', sample.difficulty);
      console.log('  - State:', sample.state);
      console.log('  - Scheduled days:', sample.scheduled_days);
      
      // Check if FSRS columns are populated
      const hasFsrsData = sample.stability !== null && sample.difficulty !== null && sample.state !== null;
      console.log('\n  FSRS data populated:', hasFsrsData ? '✓' : '❌');
      
      // Check overdue questions
      const now = new Date();
      const overdue = srsStates.filter(s => new Date(s.due_at) < now);
      console.log(`  Overdue questions: ${overdue.length}`);
    } else {
      console.log('⚠️  No SRS states found. User may not have attempted any questions yet.');
    }
  }

  // 3. Check attempts
  console.log('\n=== Attempts Check ===');
  const { data: attempts, error: attemptsError } = await supabase
    .from('attempts')
    .select('id, question_id, is_correct, created_at, fsrs_rating')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (attemptsError) {
    console.error('❌ Error fetching attempts:', attemptsError);
  } else {
    console.log(`✓ Found ${attempts?.length || 0} recent attempts`);
    if (attempts && attempts.length > 0) {
      const withFsrsRating = attempts.filter(a => a.fsrs_rating !== null).length;
      console.log(`  Attempts with FSRS rating: ${withFsrsRating}/${attempts.length}`);
    }
  }

  // 4. Test build_daily_plan function
  console.log('\n=== Testing build_daily_plan Function ===');
  const { data: dailyPlan, error: planError } = await supabase
    .rpc('build_daily_plan', {
      p_user_id: userId,
      p_limit: 10,
      p_pace_offset: 1,
    });

  if (planError) {
    console.error('❌ Error calling build_daily_plan:', planError);
    console.error('  Details:', JSON.stringify(planError, null, 2));
  } else {
    console.log(`✓ build_daily_plan returned ${dailyPlan?.length || 0} questions`);
    
    if (dailyPlan && dailyPlan.length > 0) {
      console.log('\nDaily plan breakdown:');
      const categories = dailyPlan.reduce((acc: Record<string, number>, q: any) => {
        acc[q.category] = (acc[q.category] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(categories).forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
      
      console.log('\nSample question from plan:');
      const sample = dailyPlan[0];
      console.log('  - Category:', sample.category);
      console.log('  - Why selected:', sample.why_selected);
      console.log('  - Priority score:', sample.priority_score);
    } else {
      console.log('⚠️  No questions in daily plan. This could mean:');
      console.log('    - No questions match the criteria');
      console.log('    - No SRS states exist (user needs to attempt questions first)');
      console.log('    - All questions are filtered out (published/approved check)');
    }
  }

  // 5. Check topic mastery
  console.log('\n=== Topic Mastery Check ===');
  const { data: mastery, error: masteryError } = await supabase
    .from('topic_mastery')
    .select('*')
    .eq('user_id', userId)
    .limit(5);

  if (masteryError) {
    console.error('❌ Error fetching topic_mastery:', masteryError);
  } else {
    console.log(`✓ Found ${mastery?.length || 0} topic mastery records`);
  }

  console.log('\n=== Summary ===');
  console.log('✓ All checks completed');
  console.log('\nIf build_daily_plan returns 0 questions, possible issues:');
  console.log('  1. User has not attempted any questions yet (no SRS states)');
  console.log('  2. No questions are published/approved');
  console.log('  3. No questions match the topic schedule criteria');
  console.log('  4. FSRS data not being saved correctly (check useSubmitAttempt)');
}

checkScheduling()
  .then(() => {
    console.log('\n✓ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Error:', error);
    process.exit(1);
  });
