import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

/**
 * validate-taxonomy
 *
 * Reports taxonomy health: missing descriptions, proposed types, orphaned questions.
 *
 * Usage:
 *   bun run scripts/validate-taxonomy.ts
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main(): Promise<void> {
  console.log('validate-taxonomy');
  console.log('='.repeat(60));

  // 1. Topics with empty/null description
  const { data: topicsNoDesc, error: topicsErr } = await supabase
    .from('topics')
    .select('id, title')
    .or('description.is.null,description.eq.');

  if (topicsErr) {
    console.error('Failed to query topics:', topicsErr);
    process.exit(1);
  }
  console.log(`\nTopics with empty description: ${topicsNoDesc.length}`);
  if (topicsNoDesc.length > 0 && topicsNoDesc.length <= 20) {
    for (const t of topicsNoDesc) {
      console.log(`  - ${t.title} (${t.id})`);
    }
  }

  // 2. Question types with empty/null description
  const { data: qtNoDesc, error: qtErr } = await supabase
    .from('question_types')
    .select('id, name, status')
    .or('description.is.null,description.eq.');

  if (qtErr) {
    console.error('Failed to query question_types:', qtErr);
    process.exit(1);
  }
  console.log(`\nQuestion types with empty description: ${qtNoDesc.length}`);
  if (qtNoDesc.length > 0 && qtNoDesc.length <= 20) {
    for (const qt of qtNoDesc) {
      console.log(`  - ${qt.name} [${qt.status}] (${qt.id})`);
    }
  }

  // 3. Question types with status='proposed' awaiting review
  const { data: proposed, error: proposedErr } = await supabase
    .from('question_types')
    .select('id, name')
    .eq('status', 'proposed');

  if (proposedErr) {
    console.error('Failed to query proposed types:', proposedErr);
    process.exit(1);
  }
  console.log(`\nQuestion types with status='proposed': ${proposed.length}`);
  if (proposed.length > 0 && proposed.length <= 20) {
    for (const qt of proposed) {
      console.log(`  - ${qt.name} (${qt.id})`);
    }
  }

  // 4. Questions with null question_type_id
  const { count: orphanedCount, error: orphanedErr } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .is('question_type_id', null);

  if (orphanedErr) {
    console.error('Failed to query orphaned questions:', orphanedErr);
    process.exit(1);
  }
  console.log(`\nQuestions with null question_type_id: ${orphanedCount ?? 0}`);

  // Summary
  const totalIssues = topicsNoDesc.length + qtNoDesc.length + proposed.length + (orphanedCount ?? 0);
  console.log(`\nTotal taxonomy issues: ${totalIssues}`);
  if (totalIssues === 0) {
    console.log('Taxonomy is healthy!');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
