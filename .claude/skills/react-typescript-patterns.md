# React TypeScript Patterns Skill

This skill guides all React and TypeScript development for Study Flow Forge.

---

## Component File Structure

### Directory Organization
```
src/components/
├── admin/          # Admin-only components (dashboard, ingestion)
├── layout/         # Layout wrappers (AppLayout, ProtectedRoute, AdminRoute)
├── motion/         # Animation wrapper components
├── progress/       # Progress tracking components
├── settings/       # User settings components
├── study/          # Study flow components (questions, answers, guide-me)
└── ui/             # ShadCN UI primitives (50+ reusable components)
```

### File Naming
- Components: `PascalCase.tsx` (e.g., `QuestionPrompt.tsx`)
- Hooks: `use-kebab-case.ts` (e.g., `use-study.ts`)
- Types: Inline or in component file (avoid separate `.types.ts`)
- Utilities: `kebab-case.ts` in `src/lib/`

---

## Functional Component Pattern

### Standard Component
```typescript
interface QuestionPromptProps {
  prompt: string;
  topicName: string;
  questionType: string;
  difficulty: number;
  questionNumber: number;
  totalQuestions?: number;
  imageUrl?: string | null;
}

export function QuestionPrompt({
  prompt,
  topicName,
  questionType,
  difficulty,
  questionNumber,
  totalQuestions,
  imageUrl,
}: QuestionPromptProps): JSX.Element {
  return (
    <div className="space-y-5">
      {/* Component content */}
    </div>
  );
}
```

**Key patterns:**
- Named exports (not default)
- Interface for props (not type)
- Explicit return type optional but allowed
- Destructure props in function signature

### Component with Children
```typescript
interface CardWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function CardWrapper({ children, className }: CardWrapperProps) {
  return (
    <div className={cn('rounded-lg border bg-card p-6', className)}>
      {children}
    </div>
  );
}
```

---

## Custom Hook Patterns

All hooks live in `src/hooks/` with `use-` prefix.

### Data Fetching Hook (React Query)
```typescript
// src/hooks/use-study.ts
export function useStudyQuestions(params: RecommendationParams = {}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['study-questions', user?.id, params.limit, params.courseId],
    queryFn: async (): Promise<StudyQuestion[]> => {
      const { data, error } = await supabase
        .rpc('get_recommended_questions', {
          p_user_id: user!.id,
          p_limit: params.limit ?? 10,
        });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}
```

### Mutation Hook
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
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-mastery'] });
      queryClient.invalidateQueries({ queryKey: ['srs-state'] });
    },
    onError: (error) => {
      console.error('[useSubmitAttempt] Error:', error);
      toast({
        title: 'Failed to save progress',
        description: 'Your answer was not recorded.',
        variant: 'destructive',
      });
    },
  });
}
```

### State Management Hook
```typescript
export function useFocus() {
  const [filters, setFilters] = useState<FocusFilters>(DEFAULT_FILTERS);
  const [narrowBy, setNarrowBy] = useState<NarrowByOption>(null);

  // Memoized setters to prevent unnecessary re-renders
  const setCourseIds = useCallback((courseIds: string[]) => {
    setFilters(prev => ({ ...DEFAULT_FILTERS, courseIds }));
    setNarrowBy(null);
  }, []);

  // Computed values with useMemo
  const hasActiveFilters = useMemo(() => {
    return filters.courseIds.length > 0 || filters.examNames.length > 0;
  }, [filters]);

  return {
    filters,
    setCourseIds,
    hasActiveFilters,
    // ... other values
  };
}
```

---

## React Query Patterns

### Query Keys
Use multi-dimensional arrays for granular invalidation:
```typescript
queryKey: ['study-questions', user?.id, limit, courseId, examName]
queryKey: ['topic-mastery', user?.id]
queryKey: ['ingestion-jobs', 'processing']
```

### Stale Time Configuration
```typescript
staleTime: 2 * 60 * 1000,   // 2 min - frequently changing data
staleTime: 5 * 60 * 1000,   // 5 min - semi-static data
staleTime: Infinity,        // Static reference data
```

### Cache Invalidation
```typescript
onSuccess: () => {
  // Invalidate related queries after mutation
  queryClient.invalidateQueries({ queryKey: ['topic-mastery'] });
  queryClient.invalidateQueries({ queryKey: ['srs-state'] });
  queryClient.invalidateQueries({ queryKey: ['study-dashboard'] });
},
```

### Conditional Queries
```typescript
enabled: !!user,                    // Only when authenticated
enabled: courseIds.length > 0,      // Only with valid filters
enabled: !isSubmitting,             // Pause during mutation
```

---

## Form Handling Pattern

Use react-hook-form with Zod validation:

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const formSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormData = z.infer<typeof formSchema>;

export function LoginForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: FormData) => {
    // Handle submission
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* More fields */}
      </form>
    </Form>
  );
}
```

---

## State Management Decision Tree

1. **Server state** (API data) → React Query
2. **Form state** → react-hook-form
3. **Local UI state** (open/closed, current step) → useState
4. **Shared app state** (filters, preferences) → Context API
5. **URL state** (page, filters in URL) → React Router

**Anti-pattern:** Never use Redux or Zustand. This project uses React Query + Context.

---

## Type Patterns

### Prefer Interfaces for Props
```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  onClick: () => void;
  children: React.ReactNode;
}
```

### Use Type for Unions/Aliases
```typescript
type NarrowByOption = 'course' | 'exam' | 'topic' | null;
type ConfidenceLevel = 'low' | 'medium' | 'high';
```

### Infer from Zod Schemas
```typescript
const schema = z.object({ name: z.string() });
type FormData = z.infer<typeof schema>;
```

### Import Database Types
```typescript
import type { Tables } from '@/integrations/supabase/types';
type Question = Tables<'questions'>;
```

---

## Import Order

```typescript
// 1. React
import { useState, useEffect, useCallback, useMemo } from 'react';

// 2. External libraries
import { useQuery, useMutation } from '@tanstack/react-query';

// 3. Internal hooks
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

// 4. Internal components
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// 5. Types
import type { Question } from '@/integrations/supabase/types';

// 6. Utils/lib
import { cn } from '@/lib/utils';
```

---

## Anti-Patterns

### Never Use `any`
```typescript
// Bad
const handleData = (data: any) => { ... }

// Good
const handleData = (data: Question[]) => { ... }
```

### Never Use `.then()` Chains
```typescript
// Bad
supabase.from('questions').select('*').then(({ data }) => { ... });

// Good
const { data } = await supabase.from('questions').select('*');
```

### Never Use Class Components
```typescript
// Bad
class MyComponent extends React.Component { ... }

// Good
function MyComponent() { ... }
```

### Never Mutate State Directly
```typescript
// Bad
filters.courseIds.push(newId);

// Good
setFilters(prev => ({ ...prev, courseIds: [...prev.courseIds, newId] }));
```

### Avoid Inline Objects in Deps
```typescript
// Bad - creates new object every render
useEffect(() => { ... }, [{ limit, offset }]);

// Good - use primitives
useEffect(() => { ... }, [limit, offset]);
```

---

## Component Composition

### Prefer Composition Over Props
```typescript
// Bad - prop drilling
<Card showHeader showFooter headerTitle="..." footerActions={[...]} />

// Good - composition
<Card>
  <CardHeader>
    <CardTitle>...</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>
```

### Use Render Props Sparingly
Only when polymorphic rendering is needed (e.g., FormField render prop).

---

## Performance Patterns

### Memoize Expensive Computations
```typescript
const groupedTopics = useMemo(() => {
  return topics.reduce((acc, topic) => {
    // Expensive grouping logic
  }, {});
}, [topics]);
```

### Memoize Callbacks Passed to Children
```typescript
const handleSelect = useCallback((id: string) => {
  setSelectedId(id);
}, []);
```

### Avoid Inline Functions in JSX
```typescript
// Bad - creates new function every render
<Button onClick={() => handleClick(id)} />

// Good - use useCallback or define outside
<Button onClick={handleClick} />
```
