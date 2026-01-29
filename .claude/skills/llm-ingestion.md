# LLM Ingestion Skill

This skill guides PDF ingestion and LLM-based content extraction for Study Flow Forge.

---

## Overview

The ingestion pipeline extracts questions from exam PDFs using Gemini AI and stores them in the database with full provenance tracking.

**Flow:**
1. Admin uploads PDF → Storage bucket
2. Edge function downloads and processes
3. Gemini extracts questions via function calling
4. Questions saved with provenance metadata
5. Job status updated for realtime UI feedback

---

## Deduplication with File Hash

**Always check for duplicates BEFORE spending LLM tokens:**

```typescript
import { createHash } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

async function computeFileHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// In handler
const pdfData = await downloadPdf(url);
const fileHash = await computeFileHash(pdfData);

// Check for existing ingestion with same hash
const { data: existing } = await supabase
  .from('source_materials')
  .select('id')
  .eq('file_hash', fileHash)
  .maybeSingle();

if (existing) {
  return new Response(
    JSON.stringify({
      error: 'This file has already been processed',
      existingId: existing.id,
    }),
    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**Anti-pattern:** Never call LLM before hash check. LLM tokens are expensive.

---

## Gemini API Integration

### Function Calling for Structured Extraction

```typescript
const EXTRACTION_SCHEMA = {
  name: 'extract_exam_questions',
  description: 'Extract all questions from an exam PDF with structured metadata',
  parameters: {
    type: 'object',
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['prompt', 'questionType', 'pageNumber'],
          properties: {
            prompt: {
              type: 'string',
              description: 'Full question text with LaTeX formatting preserved',
            },
            questionType: {
              type: 'string',
              enum: ['mcq', 'short_answer', 'numeric', 'multi_part'],
            },
            choices: {
              type: 'array',
              items: { type: 'string' },
              description: 'For MCQ: list of answer choices',
            },
            correctAnswer: {
              type: 'string',
              description: 'Correct answer if visible in solution key',
            },
            difficulty: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              description: 'Estimated difficulty: 1=easy, 5=very hard',
            },
            pageNumber: {
              type: 'integer',
              description: 'Page number where question appears',
            },
            questionNumber: {
              type: 'string',
              description: 'Original question number (e.g., "1", "2a", "3.ii")',
            },
            subparts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  prompt: { type: 'string' },
                  points: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
};
```

### API Call Pattern

```typescript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
        ],
      }],
      tools: [{ functionDeclarations: [EXTRACTION_SCHEMA] }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['extract_exam_questions'],
        },
      },
      generationConfig: {
        temperature: 0.1,  // Very low for consistent extraction
        maxOutputTokens: 32000,
      },
    }),
  }
);
```

---

## Retry Logic with Repair Prompt

**One retry policy:** If extraction fails or returns invalid data, try once more with a repair prompt.

```typescript
async function extractWithRetry(pdfBase64: string): Promise<ExtractedData> {
  // First attempt
  let result = await callGemini(pdfBase64, INITIAL_PROMPT);

  const validation = validateExtraction(result);
  if (validation.isValid) {
    return result;
  }

  // One retry with repair prompt
  console.log('[Ingestion] First extraction invalid, retrying with repair prompt');
  console.log('[Ingestion] Validation errors:', validation.errors);

  const repairPrompt = buildRepairPrompt(validation.errors, result);
  result = await callGemini(pdfBase64, repairPrompt);

  const retryValidation = validateExtraction(result);
  if (!retryValidation.isValid) {
    throw new Error(`Extraction failed after retry: ${retryValidation.errors.join(', ')}`);
  }

  return result;
}

function buildRepairPrompt(errors: string[], previousResult: unknown): string {
  return `
The previous extraction had these issues:
${errors.map(e => `- ${e}`).join('\n')}

Previous attempt (partial):
${JSON.stringify(previousResult, null, 2).slice(0, 2000)}

Please re-extract with corrections. Ensure:
1. All LaTeX is properly formatted
2. All required fields are present
3. Question numbers match the original
`;
}
```

**Anti-pattern:** Never retry more than once. If it fails twice, it needs human review.

---

## Provenance Tracking

Every extracted question must include provenance:

```typescript
interface QuestionProvenance {
  source_material_id: string;     // FK to source_materials table
  source_exam: string;            // "Spring 2024 Midterm 1"
  source_locator: string;         // "page:3,question:4a"
  extraction_model: string;       // "gemini-3-flash-preview"
  extraction_timestamp: string;   // ISO timestamp
}

// When inserting questions
const questionInsert = {
  prompt: extracted.prompt,
  choices: extracted.choices,
  correct_answer: extracted.correctAnswer,
  difficulty: extracted.difficulty,
  // Provenance fields
  source_material_id: materialId,
  source_exam: examName,
  source_locator: `page:${extracted.pageNumber},question:${extracted.questionNumber}`,
  extraction_model: 'gemini-3-flash-preview',
  extraction_timestamp: new Date().toISOString(),
};
```

---

## Job Status Tracking

### Status Flow
```
pending → processing → completed
                    → failed
```

### Progress Steps
```typescript
const STEPS = {
  A1: { name: 'Downloading PDF', pct: 5 },
  A2: { name: 'Computing hash', pct: 10 },
  A3: { name: 'Checking duplicates', pct: 15 },
  B1: { name: 'Calling Gemini', pct: 25 },
  B2: { name: 'Parsing response', pct: 50 },
  B3: { name: 'Validating data', pct: 60 },
  C1: { name: 'Mapping topics', pct: 70 },
  C2: { name: 'Saving questions', pct: 85 },
  C3: { name: 'Updating counts', pct: 95 },
  DONE: { name: 'Complete', pct: 100 },
};

async function updateJobStep(jobId: string, step: keyof typeof STEPS) {
  await supabase
    .from('ingestion_jobs')
    .update({
      current_step: step,
      progress_pct: STEPS[step].pct,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}
```

### Error Capture
```typescript
try {
  await processExam(jobId);
} catch (error) {
  await supabase
    .from('ingestion_jobs')
    .update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
      // Preserve last step for debugging
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  // Re-throw for edge function error handling
  throw error;
}
```

---

## Rate Limit Handling

Gemini has rate limits. Handle gracefully:

```typescript
async function callGeminiWithBackoff(
  request: GeminiRequest,
  maxRetries = 3
): Promise<GeminiResponse> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;

      console.log(`[Ingestion] Rate limited, waiting ${waitMs}ms`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    return response.json();
  }

  throw new Error('Max retries exceeded for Gemini API');
}
```

---

## Prompt Engineering Guidelines

### LaTeX Normalization
```typescript
const LATEX_INSTRUCTIONS = `
When extracting mathematical content:
1. Use \\( ... \\) for inline math, \\[ ... \\] for display math
2. Preserve original LaTeX commands (\\frac, \\sum, \\int, etc.)
3. Don't convert to plaintext or Unicode
4. Escape backslashes properly in JSON

Example:
- Original: "Find ∫₀¹ x² dx"
- Extracted: "Find \\\\( \\\\int_0^1 x^2 \\\\, dx \\\\)"
`;
```

### Question Type Detection
```typescript
const TYPE_DETECTION = `
Classify each question:
- mcq: Has explicit choices (A, B, C, D) or (a), (b), (c), (d)
- short_answer: Requires written explanation or derivation
- numeric: Expects a numerical answer with units
- multi_part: Has subparts (a), (b), (c) or i, ii, iii

For multi_part: extract each subpart as a separate entry in the subparts array
`;
```

### Difficulty Estimation
```typescript
const DIFFICULTY_GUIDELINES = `
Estimate difficulty (1-5):
1 = Direct application of single concept
2 = Application with minor variations
3 = Requires combining 2-3 concepts
4 = Complex multi-step reasoning
5 = Novel approach or proof required

Consider: computational complexity, conceptual depth, time expected
`;
```

---

## Validation Rules

```typescript
function validateExtraction(data: unknown): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Invalid response structure'] };
  }

  const { questions } = data as { questions?: unknown[] };

  if (!Array.isArray(questions) || questions.length === 0) {
    errors.push('No questions extracted');
  }

  for (let i = 0; i < (questions?.length ?? 0); i++) {
    const q = questions![i] as Record<string, unknown>;

    if (!q.prompt || typeof q.prompt !== 'string') {
      errors.push(`Question ${i}: missing prompt`);
    }

    if (!q.questionType || !['mcq', 'short_answer', 'numeric', 'multi_part'].includes(q.questionType as string)) {
      errors.push(`Question ${i}: invalid questionType`);
    }

    if (q.questionType === 'mcq' && (!Array.isArray(q.choices) || q.choices.length < 2)) {
      errors.push(`Question ${i}: MCQ needs at least 2 choices`);
    }

    if (q.difficulty && (q.difficulty < 1 || q.difficulty > 5)) {
      errors.push(`Question ${i}: difficulty must be 1-5`);
    }
  }

  return { isValid: errors.length === 0, errors };
}
```

---

## Anti-Patterns

1. **Never skip hash check** - Always deduplicate before LLM call
2. **Never retry infinitely** - One retry max, then fail
3. **Never lose provenance** - Every question needs source tracking
4. **Never skip validation** - Always validate before database insert
5. **Never ignore rate limits** - Implement exponential backoff
6. **Never hardcode model** - Store model version in provenance
7. **Never truncate prompts** - Use full content for accurate extraction
