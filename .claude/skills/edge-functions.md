# Edge Functions Skill

This skill guides Supabase Edge Function development for Study Flow Forge.

---

## Standard Boilerplate

Every edge function follows this structure:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Function logic here
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
```

---

## Environment Variables

Access via `Deno.env.get()`:

```typescript
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
```

**Required secrets (set via Supabase dashboard):**
- `SUPABASE_URL` - Auto-injected
- `SUPABASE_ANON_KEY` - Auto-injected
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-injected
- `GEMINI_API_KEY` - Custom secret

---

## Admin Authentication Pattern

Verify user is admin before processing:

```typescript
async function verifyAdmin(req: Request, supabase: SupabaseClient): Promise<{
  user: User | null;
  error: Response | null;
}> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  // Check admin role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  return { user, error: null };
}

// Usage in handler
const { user, error } = await verifyAdmin(req, supabase);
if (error) return error;
```

---

## Progress Tracking Pattern

For long-running operations, track progress in `ingestion_jobs` table:

### Job Table Structure
```sql
CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT,
  progress_pct INTEGER DEFAULT 0,
  error_message TEXT,
  questions_created INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Progress Update Pattern
```typescript
// Define steps with progress percentages
const STEPS = {
  A1: { name: 'Downloading PDF', pct: 5 },
  A2: { name: 'Converting to base64', pct: 15 },
  B1: { name: 'Extracting with Gemini', pct: 25 },
  B2: { name: 'Parsing response', pct: 50 },
  C1: { name: 'Saving questions', pct: 75 },
  C2: { name: 'Finalizing', pct: 95 },
};

async function updateProgress(
  supabase: SupabaseClient,
  jobId: string,
  step: keyof typeof STEPS,
  additionalData?: Record<string, unknown>
) {
  await supabase
    .from('ingestion_jobs')
    .update({
      current_step: step,
      progress_pct: STEPS[step].pct,
      updated_at: new Date().toISOString(),
      ...additionalData,
    })
    .eq('id', jobId);
}

// Usage
await updateProgress(supabase, jobId, 'A1');
const pdfData = await downloadPdf(url);

await updateProgress(supabase, jobId, 'A2');
const base64 = await convertToBase64(pdfData);
```

### Completion and Error Handling
```typescript
// Success
await supabase
  .from('ingestion_jobs')
  .update({
    status: 'completed',
    progress_pct: 100,
    questions_created: count,
    updated_at: new Date().toISOString(),
  })
  .eq('id', jobId);

// Failure
await supabase
  .from('ingestion_jobs')
  .update({
    status: 'failed',
    error_message: error instanceof Error ? error.message : 'Unknown error',
    updated_at: new Date().toISOString(),
  })
  .eq('id', jobId);
```

---

## Gemini API Integration

### Function Calling Mode
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
          { text: systemPrompt },
          { text: userPrompt },
          // Optional: inline image
          { inlineData: { mimeType: 'image/png', data: base64Image } },
        ],
      }],
      tools: [{
        functionDeclarations: [{
          name: 'extract_questions',
          description: 'Extract questions from exam PDF',
          parameters: {
            type: 'object',
            required: ['questions'],
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['prompt', 'type'],
                  properties: {
                    prompt: { type: 'string', description: 'Question text' },
                    type: { type: 'string', enum: ['mcq', 'short_answer', 'numeric'] },
                    choices: { type: 'array', items: { type: 'string' } },
                    correctAnswer: { type: 'string' },
                    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
                  },
                },
              },
            },
          },
        }],
      }],
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: ['extract_questions'],
        },
      },
      generationConfig: {
        temperature: 0.2,  // Low for consistent extraction
      },
    }),
  }
);
```

### Response Parsing
```typescript
const geminiData = await response.json();

// Extract function call from response
const functionCall = geminiData.candidates?.[0]?.content?.parts?.find(
  (part: any) => part.functionCall
)?.functionCall;

if (!functionCall || functionCall.name !== 'extract_questions') {
  throw new Error('Invalid Gemini response: no function call');
}

const extractedData = functionCall.args;
```

---

## Async/Background Processing

For operations that may exceed the 30s edge function timeout:

### Using waitUntil
```typescript
serve(async (req) => {
  const { jobId, asyncMode } = await req.json();

  if (asyncMode) {
    // Start background processing
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      processInBackground(jobId).catch(async (error) => {
        await supabase
          .from('ingestion_jobs')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', jobId);
      })
    );

    // Return immediately
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Processing started in background',
        jobId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Synchronous processing for smaller jobs
  const result = await processSync(jobId);
  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
```

### Client Polling Pattern
```typescript
// Client-side: poll for job status
export function useIngestionProgress(jobId: string) {
  return useQuery({
    queryKey: ['ingestion-job', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingestion_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 2000; // Poll every 2 seconds while processing
    },
  });
}
```

---

## Image Handling

Convert images to base64 for Gemini:

```typescript
async function fetchImageAsBase64(url: string): Promise<{
  data: string;
  mimeType: string;
} | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Convert to base64 in chunks (avoid stack overflow)
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    const data = btoa(binary);
    const mimeType = response.headers.get('content-type') || 'image/png';

    return { data, mimeType };
  } catch (err) {
    console.error('Error fetching image:', url, err);
    return null;
  }
}
```

---

## Rate Limit Handling

```typescript
if (!response.ok) {
  if (response.status === 429) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
      {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const errorText = await response.text();
  console.error('API error:', response.status, errorText);
  throw new Error(`API request failed: ${response.status}`);
}
```

---

## Anti-Patterns

### Never expose service key to client
```typescript
// Bad: Service key in response
return new Response(JSON.stringify({ key: SUPABASE_SERVICE_ROLE_KEY }));

// Good: Use service key only server-side
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

### Always include CORS headers
```typescript
// Bad: Missing CORS
return new Response(JSON.stringify(data));

// Good: Always include
return new Response(JSON.stringify(data), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
```

### Always handle preflight
```typescript
// Bad: Missing OPTIONS handler
serve(async (req) => {
  // Function logic
});

// Good: Handle preflight first
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  // Function logic
});
```

### Log errors with context
```typescript
// Bad: Silent failure
try { ... } catch (e) { }

// Good: Log with context
try {
  // ...
} catch (error) {
  console.error('[process-exam-pdf] Failed at step B1:', error);
  // Update job status
  await supabase.from('ingestion_jobs').update({
    status: 'failed',
    error_message: error instanceof Error ? error.message : 'Unknown error',
    current_step: 'B1',
  }).eq('id', jobId);
}
```

---

## Testing Edge Functions Locally

```bash
# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve --env-file .env.local

# Test with curl
curl -X POST http://localhost:54321/functions/v1/process-exam-pdf \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"jobId": "...", "asyncMode": true}'
```

---

## Deployment

```bash
# Deploy single function
supabase functions deploy process-exam-pdf

# Deploy all functions
supabase functions deploy

# Set secrets
supabase secrets set GEMINI_API_KEY=your-key
```
