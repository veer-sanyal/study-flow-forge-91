# Error Handling Skill

This skill guides consistent error handling across Study Flow Forge.

---

## Overview

Error handling follows a layered approach:
1. **Query/Mutation level**: Handle Supabase errors
2. **Component level**: React Query error states
3. **User level**: Toast notifications
4. **System level**: Console logging for debugging

---

## Supabase Query Error Handling

### Standard Pattern
```typescript
const { data, error } = await supabase
  .from('questions')
  .select('*')
  .eq('needs_review', false);

if (error) {
  console.error('[useQuestions] Query error:', error);
  throw error; // Let React Query handle it
}

return data ?? [];
```

### RPC Error with Fallback
```typescript
const { data: recommended, error: recError } = await supabase
  .rpc('get_recommended_questions', {
    p_user_id: user.id,
    p_limit: limit,
  });

if (recError) {
  console.error('[useStudyQuestions] RPC error:', recError);

  // Fallback to simple query
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('questions')
    .select('*')
    .eq('needs_review', false)
    .limit(limit);

  if (fallbackError) throw fallbackError;
  return fallbackData ?? [];
}

return recommended ?? [];
```

### Insert/Update Error
```typescript
const { error } = await supabase
  .from('attempts')
  .insert({
    user_id: user.id,
    question_id: questionId,
    is_correct: true,
  });

if (error) {
  console.error('[useSubmitAttempt] Insert error:', error);
  throw error;
}
```

---

## Mutation Error Handling with Cleanup

### Standard Mutation Pattern
```typescript
export function useSubmitAttempt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: SubmitAttemptParams) => {
      const { error } = await supabase.from('attempts').insert({
        user_id: user!.id,
        question_id: params.questionId,
        is_correct: params.isCorrect,
        confidence: params.confidence,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['topic-mastery'] });
      queryClient.invalidateQueries({ queryKey: ['srs-state'] });
    },
    onError: (error) => {
      console.error('[useSubmitAttempt] Mutation error:', error);
      toast({
        title: 'Failed to save progress',
        description: 'Your answer was not recorded. Please try again.',
        variant: 'destructive',
      });
    },
  });
}
```

### Optimistic Update with Rollback
```typescript
export function useToggleBookmark() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ questionId, bookmarked }: { questionId: string; bookmarked: boolean }) => {
      const { error } = await supabase
        .from('bookmarks')
        [bookmarked ? 'insert' : 'delete']({ question_id: questionId });

      if (error) throw error;
    },
    onMutate: async ({ questionId, bookmarked }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['bookmarks'] });

      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData(['bookmarks']);

      // Optimistically update
      queryClient.setQueryData(['bookmarks'], (old: string[]) =>
        bookmarked
          ? [...(old ?? []), questionId]
          : (old ?? []).filter(id => id !== questionId)
      );

      return { previousBookmarks };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['bookmarks'], context?.previousBookmarks);

      console.error('[useToggleBookmark] Error:', error);
      toast({
        title: 'Failed to update bookmark',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });
}
```

---

## Edge Function Error Handling

### Rate Limit Errors
```typescript
if (!response.ok) {
  if (response.status === 429) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: response.headers.get('Retry-After') ?? '60',
      }),
      {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}
```

### API Errors
```typescript
if (!response.ok) {
  const errorText = await response.text();
  console.error('[Edge Function] API error:', response.status, errorText);

  // Don't expose internal errors to client
  return new Response(
    JSON.stringify({ error: 'Service temporarily unavailable' }),
    {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
```

### Auth Errors
```typescript
const authHeader = req.headers.get('authorization');
if (!authHeader) {
  return new Response(
    JSON.stringify({ error: 'Authorization required' }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

const { data: { user }, error: authError } = await supabase.auth.getUser(token);

if (authError || !user) {
  return new Response(
    JSON.stringify({ error: 'Invalid or expired token' }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}
```

---

## User-Facing Error States

### React Query isError Pattern
```typescript
export function StudyDashboard() {
  const { data, isLoading, isError, error, refetch } = useStudyQuestions();

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (isError) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h3 className="text-lg font-medium">Failed to load questions</h3>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An unexpected error occurred'}
          </p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  return <QuestionList questions={data} />;
}
```

### Empty State vs Error State
```typescript
// Empty state (no error, just no data)
if (!data || data.length === 0) {
  return (
    <Card className="p-6 text-center">
      <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <h3 className="text-lg font-medium">No questions available</h3>
      <p className="text-sm text-muted-foreground">
        Check back later or adjust your filters
      </p>
    </Card>
  );
}

// Error state
if (isError) {
  return <ErrorCard error={error} onRetry={refetch} />;
}
```

---

## Toast Notifications

### Success Toast
```typescript
toast({
  title: 'Progress saved',
  description: 'Your answer has been recorded.',
});
```

### Error Toast
```typescript
toast({
  title: 'Failed to save progress',
  description: 'Your answer was not recorded. Please try again.',
  variant: 'destructive',
});
```

### Warning Toast
```typescript
toast({
  title: 'Connection issue',
  description: 'Some data may be outdated. Pull to refresh.',
  variant: 'default', // Yellow warning style via custom class
  className: 'border-warning bg-warning/10',
});
```

### Toast with Action
```typescript
toast({
  title: 'Session expired',
  description: 'Please sign in again to continue.',
  action: (
    <ToastAction altText="Sign in" onClick={() => navigate('/auth')}>
      Sign In
    </ToastAction>
  ),
});
```

---

## Job-Based Error Tracking

For long-running operations like ingestion:

### Error Capture
```typescript
try {
  await processExam(jobId);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  await supabase
    .from('ingestion_jobs')
    .update({
      status: 'failed',
      error_message: errorMessage,
      error_details: {
        stack: errorStack,
        step: currentStep,
        timestamp: new Date().toISOString(),
      },
    })
    .eq('id', jobId);

  console.error('[process-exam-pdf] Job failed:', {
    jobId,
    step: currentStep,
    error: errorMessage,
  });
}
```

### UI Error Display
```typescript
export function IngestionJobStatus({ jobId }: { jobId: string }) {
  const { data: job } = useIngestionJob(jobId);

  if (job?.status === 'failed') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Processing Failed</AlertTitle>
        <AlertDescription>
          {job.error_message || 'An unexpected error occurred during processing.'}
          <br />
          <span className="text-xs text-muted-foreground">
            Failed at step: {job.current_step}
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  // ... render other states
}
```

---

## Logging Standards

### Console Log Format
```typescript
// Use consistent prefix format
console.log('[ComponentName] Action:', data);
console.error('[ComponentName] Error:', error);
console.warn('[ComponentName] Warning:', message);

// Include context for debugging
console.log('[useStudyQuestions] Fetching:', {
  userId: user?.id,
  limit,
  courseId,
});

console.error('[useSubmitAttempt] Failed:', {
  questionId,
  error: error.message,
  code: error.code,
});
```

### Never Log Sensitive Data
```typescript
// Bad - logs sensitive data
console.log('User session:', session);
console.log('Auth token:', token);

// Good - log only identifiers
console.log('[Auth] Session established for user:', user?.id);
```

---

## Error Boundary Pattern

For catching React rendering errors:

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <Card className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-medium">Something went wrong</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {this.state.error?.message ?? 'An unexpected error occurred'}
          </p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}
```

---

## Anti-Patterns

1. **Never swallow errors silently**
```typescript
// Bad
try { ... } catch (e) { }

// Good
try { ... } catch (e) {
  console.error('[Context] Error:', e);
  throw e; // or handle appropriately
}
```

2. **Never show raw error messages to users**
```typescript
// Bad
toast({ title: error.message });

// Good
toast({ title: 'Failed to save', description: 'Please try again.' });
console.error('[Context] Detailed error:', error);
```

3. **Never ignore failed mutations**
```typescript
// Bad
useMutation({ mutationFn: async () => { ... } });

// Good
useMutation({
  mutationFn: async () => { ... },
  onError: (error) => {
    console.error('[Context] Mutation failed:', error);
    toast({ title: 'Action failed', variant: 'destructive' });
  },
});
```

4. **Always invalidate after mutations**
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['related-data'] });
},
```
