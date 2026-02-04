#!/usr/bin/env tsx
/**
 * Dry-run test harness for the 3-stage question generation pipeline (v3).
 * Runs generate -> judge -> repair against real material data WITHOUT inserting into DB.
 *
 * Usage:
 *   bun run scripts/test-question-generation.ts --material-id <uuid>
 *   bun run scripts/test-question-generation.ts --material-id <uuid> --topic-limit 2
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('  VITE_SUPABASE_URL:', supabaseUrl ? 'set' : 'MISSING');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'set' : 'MISSING');
  process.exit(1);
}

if (!geminiApiKey) {
  console.error('GEMINI_API_KEY not set in .env.local');
  process.exit(1);
}

// ---------- Parse CLI args ----------
const args = process.argv.slice(2);
let materialId = '';
let topicLimit = 2;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--material-id' && args[i + 1]) {
    materialId = args[i + 1];
    i++;
  } else if (args[i] === '--topic-limit' && args[i + 1]) {
    topicLimit = parseInt(args[i + 1], 10);
    i++;
  }
}

if (!materialId) {
  console.error('Usage: bun run scripts/test-question-generation.ts --material-id <uuid> [--topic-limit <n>]');
  process.exit(1);
}

// ---------- Pipeline config (mirrors edge function) ----------
const PIPELINE_CONFIG = {
  TEMP_GENERATE: 0.5,
  TEMP_JUDGE: 0.2,
  TEMP_REPAIR: 0.4,
  KEEP_THRESHOLD: 7,
  REPAIR_THRESHOLD: 4,
  MAX_QUESTIONS_PER_TOPIC: 8,
  OVERGENERATE_FACTOR: 1.5,
} as const;

interface JudgeBinary {
  answerable_from_context: number;
  has_single_clear_correct: number;
  format_justified: number;
}

interface JudgeLikert {
  distractors_plausible: number;
  clarity: number;
  difficulty_appropriate: number;
}

interface JudgeResult {
  original_index: number;
  binary: JudgeBinary;
  likert: JudgeLikert;
  verdict: string;
  issues: string[];
}

function computeTotalScore(binary: JudgeBinary, likert: JudgeLikert): number {
  const binaryScore =
    (binary.answerable_from_context + binary.has_single_clear_correct + binary.format_justified) * 2;
  const avgLikert =
    (likert.distractors_plausible + likert.clarity + likert.difficulty_appropriate) / 3;
  const likertScore = (avgLikert / 5) * 4;
  return Math.round((binaryScore + likertScore) * 10) / 10;
}

function resolveVerdict(llmVerdict: string, score: number): 'keep' | 'repair' | 'reject' {
  if (score >= PIPELINE_CONFIG.KEEP_THRESHOLD) return 'keep';
  if (score >= PIPELINE_CONFIG.REPAIR_THRESHOLD) return 'repair';
  return 'reject';
}

// ---------- Gemini helper ----------
const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`;

async function callGemini(prompt: string, temperature: number, maxTokens: number): Promise<string | null> {
  const response = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        response_mime_type: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', errorText.slice(0, 500));
    return null;
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? text.replace(/```json\n?|\n?```/g, '').trim() : null;
}

// ---------- Main ----------
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TopicReport {
  topicTitle: string;
  candidates: number;
  kept: number;
  repaired: number;
  rejected: number;
  typeDistribution: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  scores: number[];
  sampleQuestions: Array<{
    stem: string;
    type: string;
    difficulty: number;
    score: number;
    verdict: string;
    issues: string[];
  }>;
}

async function run(): Promise<void> {
  console.log(`\nTest Question Generation Pipeline v3`);
  console.log(`Material ID: ${materialId}`);
  console.log(`Topic limit: ${topicLimit}\n`);

  // Fetch material
  const { data: material, error: matErr } = await supabase
    .from('course_materials')
    .select('*')
    .eq('id', materialId)
    .single();

  if (matErr || !material) {
    console.error('Material not found:', matErr?.message);
    process.exit(1);
  }

  if (!material.analysis_json) {
    console.error('Material has no analysis_json');
    process.exit(1);
  }

  console.log(`Material: ${material.title}`);
  const analysis = material.analysis_json as { topics: Array<Record<string, unknown>>; chunk_summaries: Array<Record<string, unknown>> };

  // Fetch DB topics
  const { data: dbTopics } = await supabase
    .from('topics')
    .select('id, title, description, topic_code')
    .eq('course_pack_id', material.course_pack_id)
    .limit(topicLimit);

  if (!dbTopics || dbTopics.length === 0) {
    console.error('No topics found for this course pack');
    process.exit(1);
  }

  // Fetch objectives
  const { data: objectives } = await supabase
    .from('objectives')
    .select('*')
    .eq('source_material_id', materialId);

  const reports: TopicReport[] = [];

  for (const dbTopic of dbTopics) {
    console.log(`\n--- Processing topic: ${dbTopic.title} ---`);

    const topicObjectives = objectives?.filter((o: Record<string, unknown>) => o.topic_id === dbTopic.id).map((o: Record<string, unknown>) => o.objective_text as string) || [];

    // Find matching analysis topic (simplified matching)
    const analysisTopic = analysis.topics.find((t: Record<string, unknown>) => {
      const title = (t.title as string || '').toLowerCase().trim();
      const dbTitle = dbTopic.title.toLowerCase().trim();
      return title === dbTitle || title.includes(dbTitle) || dbTitle.includes(title);
    });

    if (!analysisTopic) {
      console.log(`  No matching analysis topic found, skipping`);
      continue;
    }

    const allObjectives = [...topicObjectives, ...((analysisTopic.objectives as string[]) || [])];
    const candidateCount = Math.ceil(3 * PIPELINE_CONFIG.OVERGENERATE_FACTOR);

    // Stage A: Generate
    console.log(`  Stage A: Generating ${candidateCount} candidates...`);
    const generatePrompt = `You are generating practice questions for a specific topic.

TOPIC: ${dbTopic.title}
DESCRIPTION: ${dbTopic.description || (analysisTopic.description as string) || 'N/A'}

LEARNING OBJECTIVES:
${allObjectives.length > 0 ? allObjectives.map((o, idx) => `[${idx}] ${o}`).join('\n') : '- General understanding'}

Generate ${candidateCount} candidate questions.

QUESTION TYPE DISTRIBUTION (CRITICAL - MCQ FIRST):
- 80-90% must be mcq_single (standard 4-choice MCQ)
- mcq_multi ONLY for "select all that apply" concepts
- short_answer ONLY for formula derivations / proofs where MCQ would trivialize

The "type" field valid values: "mcq_single", "mcq_multi", "short_answer"

DIFFICULTY DISTRIBUTION TARGET:
- ~40% easy (difficulty 1-2), ~40% medium (difficulty 3), ~20% hard (difficulty 4-5)

Return JSON: { "questions": [ { "stem": "...", "topic_title": "...", "type": "mcq_single|mcq_multi|short_answer", "choices": [...], "correct_answer": "...", "correct_choice_index": 0, "full_solution": "...", "solution_steps": [...], "hints": [...], "common_mistakes": [...], "distractor_rationales": {...}, "tags": [...], "difficulty": 1-5, "objective_index": 0, "source_refs": {...}, "why_this_question": "..." } ] }`;

    const genText = await callGemini(generatePrompt, PIPELINE_CONFIG.TEMP_GENERATE, 16384);
    if (!genText) {
      console.log('  Stage A failed (no response)');
      continue;
    }

    let candidates: Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(genText);
      candidates = parsed.questions;
    } catch {
      console.log('  Stage A failed (parse error)');
      continue;
    }

    console.log(`  Stage A complete: ${candidates.length} candidates`);

    // Stage B: Judge
    console.log(`  Stage B: Judging...`);
    const judgePrompt = `You are a strict quality judge. Score each question on 6 dimensions.

BINARY (0/1): answerable_from_context, has_single_clear_correct, format_justified
LIKERT (1-5): distractors_plausible, clarity, difficulty_appropriate

VERDICT RULES:
- "keep": ALL binary=1 AND avg Likert >= 3.5
- "repair": 2+ binary=1 AND avg Likert >= 2.0
- "reject": everything else

LEARNING OBJECTIVES:
${allObjectives.length > 0 ? allObjectives.map((o, idx) => `[${idx}] ${o}`).join('\n') : '- General understanding'}

GENERATED QUESTIONS:
${JSON.stringify(candidates, null, 2)}

Return JSON: { "judged_questions": [ { "original_index": 0, "binary": { "answerable_from_context": 0/1, "has_single_clear_correct": 0/1, "format_justified": 0/1 }, "likert": { "distractors_plausible": 1-5, "clarity": 1-5, "difficulty_appropriate": 1-5 }, "verdict": "keep|repair|reject", "issues": [...] } ] }`;

    const kept: Array<{ question: Record<string, unknown>; judge: JudgeResult; score: number }> = [];
    const toRepair: Array<{ question: Record<string, unknown>; judge: JudgeResult; score: number }> = [];
    let rejectedCount = 0;

    const judgeText = await callGemini(judgePrompt, PIPELINE_CONFIG.TEMP_JUDGE, 8192);
    if (judgeText) {
      try {
        const judgeData = JSON.parse(judgeText) as { judged_questions: JudgeResult[] };
        for (const j of judgeData.judged_questions || []) {
          const idx = j.original_index;
          if (idx < 0 || idx >= candidates.length) continue;
          const binary = j.binary || { answerable_from_context: 0, has_single_clear_correct: 0, format_justified: 0 };
          const likert = j.likert || { distractors_plausible: 1, clarity: 1, difficulty_appropriate: 1 };
          const score = computeTotalScore(binary, likert);
          const verdict = resolveVerdict(j.verdict, score);

          if (verdict === 'keep') {
            kept.push({ question: candidates[idx], judge: { ...j, verdict }, score });
          } else if (verdict === 'repair') {
            toRepair.push({ question: candidates[idx], judge: { ...j, verdict }, score });
          } else {
            rejectedCount++;
          }
        }
      } catch {
        console.log('  Stage B parse error, keeping all');
        for (const q of candidates) {
          kept.push({
            question: q,
            judge: {
              original_index: 0,
              binary: { answerable_from_context: 1, has_single_clear_correct: 1, format_justified: 1 },
              likert: { distractors_plausible: 3, clarity: 3, difficulty_appropriate: 3 },
              verdict: 'keep',
              issues: ['judge_parse_failed'],
            },
            score: 8.4,
          });
        }
      }
    }

    console.log(`  Stage B complete: ${kept.length} kept, ${toRepair.length} repair, ${rejectedCount} rejected`);

    // Stage C: Repair
    let repairedCount = 0;
    if (toRepair.length > 0) {
      console.log(`  Stage C: Repairing ${toRepair.length} questions...`);
      const repairText = await callGemini(
        `Repair these questions. Fix only the listed issues. Return JSON: { "repaired_questions": [...] }

QUESTIONS: ${JSON.stringify(toRepair.map(r => r.question), null, 2)}

ISSUES: ${toRepair.map((r, i) => `[${i}] ${r.judge.issues.join('; ')}`).join('\n')}`,
        PIPELINE_CONFIG.TEMP_REPAIR,
        16384,
      );

      if (repairText) {
        try {
          const repairData = JSON.parse(repairText) as { repaired_questions: Array<Record<string, unknown>> };
          for (let i = 0; i < (repairData.repaired_questions || []).length; i++) {
            const rq = repairData.repaired_questions[i];
            const stem = rq.stem as string;
            const steps = rq.solution_steps as string[];
            if (stem && stem.length > 10 && Array.isArray(steps) && steps.length > 0) {
              const origScore = toRepair[i]?.score || 5;
              kept.push({ question: rq, judge: toRepair[i].judge, score: origScore });
              repairedCount++;
            } else {
              rejectedCount++;
            }
          }
        } catch {
          rejectedCount += toRepair.length;
        }
      } else {
        rejectedCount += toRepair.length;
      }
      console.log(`  Stage C complete: ${repairedCount} repaired`);
    }

    // Build report
    const typeDistribution: Record<string, number> = {};
    const difficultyDistribution: Record<string, number> = {};
    const scores: number[] = [];

    const finalQuestions = kept
      .sort((a, b) => b.score - a.score)
      .slice(0, PIPELINE_CONFIG.MAX_QUESTIONS_PER_TOPIC);

    for (const { question, score } of finalQuestions) {
      const qType = (question.type as string) || 'mcq_single';
      typeDistribution[qType] = (typeDistribution[qType] || 0) + 1;

      const diff = (question.difficulty as number) || 3;
      const diffBucket = diff <= 2 ? 'easy (1-2)' : diff === 3 ? 'medium (3)' : 'hard (4-5)';
      difficultyDistribution[diffBucket] = (difficultyDistribution[diffBucket] || 0) + 1;

      scores.push(score);
    }

    const sampleQuestions = finalQuestions.slice(0, 3).map(({ question, judge, score }) => ({
      stem: ((question.stem as string) || '').slice(0, 120),
      type: (question.type as string) || 'mcq_single',
      difficulty: (question.difficulty as number) || 3,
      score,
      verdict: judge.verdict,
      issues: judge.issues,
    }));

    reports.push({
      topicTitle: dbTopic.title,
      candidates: candidates.length,
      kept: kept.length - repairedCount,
      repaired: repairedCount,
      rejected: rejectedCount,
      typeDistribution,
      difficultyDistribution,
      scores,
      sampleQuestions,
    });
  }

  // ---------- Print report ----------
  console.log('\n' + '='.repeat(80));
  console.log('PIPELINE TEST REPORT');
  console.log('='.repeat(80));

  for (const r of reports) {
    console.log(`\n--- ${r.topicTitle} ---`);
    console.log(`  Candidates: ${r.candidates} | Kept: ${r.kept} | Repaired: ${r.repaired} | Rejected: ${r.rejected}`);
    console.log(`  Type distribution:`, r.typeDistribution);
    console.log(`  Difficulty distribution:`, r.difficultyDistribution);
    if (r.scores.length > 0) {
      const mean = r.scores.reduce((a, b) => a + b, 0) / r.scores.length;
      const min = Math.min(...r.scores);
      const max = Math.max(...r.scores);
      console.log(`  Quality scores: mean=${mean.toFixed(1)} min=${min} max=${max}`);
    }
    console.log(`  Sample questions:`);
    for (const sq of r.sampleQuestions) {
      console.log(`    [${sq.type}, diff=${sq.difficulty}, score=${sq.score}, ${sq.verdict}]`);
      console.log(`    "${sq.stem}..."`);
      if (sq.issues.length > 0) console.log(`    Issues: ${sq.issues.join('; ')}`);
    }
  }

  // Aggregate stats
  const totalCandidates = reports.reduce((s, r) => s + r.candidates, 0);
  const totalKept = reports.reduce((s, r) => s + r.kept, 0);
  const totalRepaired = reports.reduce((s, r) => s + r.repaired, 0);
  const totalRejected = reports.reduce((s, r) => s + r.rejected, 0);
  const allScores = reports.flatMap(r => r.scores);

  console.log(`\n--- AGGREGATE ---`);
  console.log(`  Total candidates: ${totalCandidates}`);
  console.log(`  Total kept: ${totalKept} | repaired: ${totalRepaired} | rejected: ${totalRejected}`);
  if (allScores.length > 0) {
    const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    console.log(`  Quality scores: mean=${mean.toFixed(1)} min=${Math.min(...allScores)} max=${Math.max(...allScores)}`);
  }

  // Aggregate type distribution
  const aggTypes: Record<string, number> = {};
  for (const r of reports) {
    for (const [k, v] of Object.entries(r.typeDistribution)) {
      aggTypes[k] = (aggTypes[k] || 0) + v;
    }
  }
  console.log(`  Aggregate type distribution:`, aggTypes);

  const mcqCount = (aggTypes['mcq_single'] || 0) + (aggTypes['mcq_multi'] || 0);
  const total = Object.values(aggTypes).reduce((a, b) => a + b, 0);
  if (total > 0) {
    console.log(`  MCQ percentage: ${((mcqCount / total) * 100).toFixed(0)}%`);
  }
}

run()
  .then(() => {
    console.log('\nDone');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFatal error:', error);
    process.exit(1);
  });
