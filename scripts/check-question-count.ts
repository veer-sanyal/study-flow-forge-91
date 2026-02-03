#!/usr/bin/env tsx
/**
 * Script to check actual question counts for courses
 * Usage: bun run scripts/check-question-count.ts
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

async function checkQuestionCounts() {
  console.log('Checking question counts for all courses...\n');

  // Get all courses
  const { data: courses, error: coursesError } = await supabase
    .from('course_packs')
    .select('id, title')
    .order('title');

  if (coursesError) {
    console.error('Error fetching courses:', coursesError);
    process.exit(1);
  }

  if (!courses || courses.length === 0) {
    console.log('No courses found.');
    return;
  }

  // Get all questions
  const { data: questions, error: questionsError } = await supabase
    .from('questions')
    .select('id, course_pack_id, needs_review, status, is_published, source');

  if (questionsError) {
    console.error('Error fetching questions:', questionsError);
    process.exit(1);
  }

  console.log('Question counts by course:\n');
  console.log('Course Title'.padEnd(20), 'Total'.padEnd(8), 'Approved'.padEnd(10), 'Needs Review'.padEnd(15), 'Published'.padEnd(12), 'Draft');
  console.log('-'.repeat(90));

  for (const course of courses) {
    const courseQuestions = questions?.filter(q => q.course_pack_id === course.id) || [];
    const total = courseQuestions.length;
    const approved = courseQuestions.filter(q => q.status === 'approved' || !q.status).length;
    const needsReview = courseQuestions.filter(q => q.needs_review).length;
    const published = courseQuestions.filter(q => q.is_published !== false).length;
    const draft = courseQuestions.filter(q => q.status === 'draft').length;

    console.log(
      course.title.padEnd(20),
      total.toString().padEnd(8),
      approved.toString().padEnd(10),
      needsReview.toString().padEnd(15),
      published.toString().padEnd(12),
      draft.toString()
    );
  }

  console.log('\n' + '-'.repeat(90));
  const totalQuestions = questions?.length || 0;
  console.log(`\nTotal questions across all courses: ${totalQuestions}`);

  // Check for IE23000 specifically
  const ie23000 = courses.find(c => c.title === 'IE23000' || c.title.includes('IE23000'));
  if (ie23000) {
    console.log(`\n=== IE23000 Details ===`);
    const ieQuestions = questions?.filter(q => q.course_pack_id === ie23000.id) || [];
    console.log(`Course ID: ${ie23000.id}`);
    console.log(`Total questions: ${ieQuestions.length}`);
    console.log(`By status:`);
    const statusCounts = new Map<string, number>();
    ieQuestions.forEach(q => {
      const status = q.status || 'approved';
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    });
    statusCounts.forEach((count, status) => {
      console.log(`  ${status}: ${count}`);
    });
    console.log(`By source:`);
    const sourceCounts = new Map<string, number>();
    ieQuestions.forEach(q => {
      const source = q.source || 'exam';
      sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    });
    sourceCounts.forEach((count, source) => {
      console.log(`  ${source}: ${count}`);
    });
    console.log(`Needs review: ${ieQuestions.filter(q => q.needs_review).length}`);
    console.log(`Published: ${ieQuestions.filter(q => q.is_published !== false).length}`);
  }
}

checkQuestionCounts()
  .then(() => {
    console.log('\n✓ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Error:', error);
    process.exit(1);
  });
