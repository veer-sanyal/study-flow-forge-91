import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

/**
 * validate-question-quality
 *
 * Repeatable validation script for question data consistency.
 * Checks align with canonical rules in docs/data-model.md.
 *
 * Usage:
 *   bun run scripts/validate-question-quality.ts           # report only
 *   bun run scripts/validate-question-quality.ts --fix      # report + fix
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const shouldFix = process.argv.includes('--fix');

interface QuestionRow {
  id: string;
  prompt: string;
  choices: Array<{ isCorrect?: boolean }> | null;
  correct_answer: string | null;
  question_format: string | null;
  topic_ids: string[];
  needs_review: boolean;
  needs_review_reason: string | null;
}

interface CheckResult {
  name: string;
  failCount: number;
  ids: string[];
}

async function main(): Promise<void> {
  console.log(`validate-question-quality${shouldFix ? ' (--fix mode)' : ''}`);
  console.log('='.repeat(60));

  const { data: questions, error } = await supabase
    .from('questions')
    .select('id, prompt, choices, correct_answer, question_format, topic_ids, needs_review, needs_review_reason');

  if (error) {
    console.error('Failed to fetch questions:', error);
    process.exit(1);
  }

  const rows = questions as QuestionRow[];
  console.log(`Total questions: ${rows.length}\n`);

  const results: CheckResult[] = [];

  // CHECK 1: MCQ exactly-one-correct
  const mcqBad: string[] = [];
  for (const q of rows) {
    const isMcq = (q.question_format ?? 'multiple_choice') === 'multiple_choice';
    if (!isMcq || !Array.isArray(q.choices) || q.choices.length === 0) continue;
    const correctCount = q.choices.filter(c => c.isCorrect === true).length;
    if (correctCount !== 1) {
      mcqBad.push(q.id);
    }
  }
  results.push({ name: 'CHECK 1: MCQ exactly-one-correct', failCount: mcqBad.length, ids: mcqBad });

  // CHECK 2: Non-MCQ has correct_answer set
  const nonMcqBad: string[] = [];
  for (const q of rows) {
    const format = q.question_format ?? 'multiple_choice';
    if (format === 'multiple_choice') continue;
    if (!q.correct_answer) {
      nonMcqBad.push(q.id);
    }
  }
  results.push({ name: 'CHECK 2: Non-MCQ has correct_answer', failCount: nonMcqBad.length, ids: nonMcqBad });

  // CHECK 3: topic_ids not empty
  const noTopics: string[] = [];
  for (const q of rows) {
    if (!q.topic_ids || q.topic_ids.length === 0) {
      noTopics.push(q.id);
    }
  }
  results.push({ name: 'CHECK 3: topic_ids not empty', failCount: noTopics.length, ids: noTopics });

  // CHECK 4: question_format in allowed set
  const allowedFormats = new Set(['multiple_choice', 'short_answer', 'numeric']);
  const badFormat: string[] = [];
  for (const q of rows) {
    if (q.question_format && !allowedFormats.has(q.question_format)) {
      badFormat.push(q.id);
    }
  }
  results.push({ name: 'CHECK 4: question_format in allowed set', failCount: badFormat.length, ids: badFormat });

  // CHECK 5: needs_review=true but needs_review_reason is null
  const orphanedFlags: string[] = [];
  for (const q of rows) {
    if (q.needs_review && !q.needs_review_reason) {
      orphanedFlags.push(q.id);
    }
  }
  results.push({ name: 'CHECK 5: needs_review=true without reason', failCount: orphanedFlags.length, ids: orphanedFlags });

  // Print results
  let totalIssues = 0;
  for (const r of results) {
    const status = r.failCount === 0 ? 'PASS' : 'FAIL';
    console.log(`${status}  ${r.name}: ${r.failCount} issues`);
    if (r.failCount > 0 && r.failCount <= 10) {
      console.log(`       IDs: ${r.ids.join(', ')}`);
    }
    totalIssues += r.failCount;
  }

  console.log(`\nTotal issues: ${totalIssues}`);

  // Fix mode
  if (shouldFix && totalIssues > 0) {
    console.log('\nApplying fixes...');

    // Fix CHECK 1 + CHECK 3: flag for review
    const toFlag = [...new Set([...mcqBad, ...noTopics])];
    if (toFlag.length > 0) {
      for (const id of toFlag) {
        const reasons: string[] = [];
        if (mcqBad.includes(id)) reasons.push('mcq_incorrect_count');
        if (noTopics.includes(id)) reasons.push('missing_topics');
        const reasonStr = reasons.join('; ');

        const { error: updateErr } = await supabase
          .from('questions')
          .update({ needs_review: true, needs_review_reason: reasonStr })
          .eq('id', id);

        if (updateErr) {
          console.error(`  Failed to flag ${id}:`, updateErr.message);
        }
      }
      console.log(`  Flagged ${toFlag.length} questions for review.`);
    }

    console.log('Fixes applied.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
