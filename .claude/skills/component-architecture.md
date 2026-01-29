# Component Architecture Skill

This skill guides component design and composition patterns for Study Flow Forge.

---

## Component Categories

### 1. UI Primitives (`src/components/ui/`)
Low-level, reusable building blocks from ShadCN:
- Button, Input, Label, Badge
- Card, Dialog, Drawer, Sheet
- Select, Checkbox, Radio
- Toast, Tooltip, Popover

**Characteristics:**
- No business logic
- Fully controlled via props
- Styled with Tailwind
- Accessible by default

### 2. Feature Components (`src/components/study/`, etc.)
Domain-specific components with business logic:
- QuestionPrompt, AnswerInput, GuideMeDrawer
- FocusPill, FocusDrawer
- TopicMasteryCard, ProgressChart

**Characteristics:**
- Combine UI primitives
- May use hooks for data
- Handle user interactions
- Contain domain logic

### 3. Layout Components (`src/components/layout/`)
Structural wrappers:
- AppLayout, ProtectedRoute, AdminRoute
- Sidebar, Header, Footer

**Characteristics:**
- Define page structure
- Handle routing logic
- Provide context providers

### 4. Page Components (`src/pages/`)
Top-level route components:
- StudyPage, ProgressPage, SettingsPage
- AdminDashboard, IngestionPage

**Characteristics:**
- Compose feature components
- Connect to route params
- Handle page-level state

---

## Feature Component Pattern

Standard pattern for feature components:

```typescript
// src/components/study/StudySession.tsx

// 1. Imports
import { useState, useCallback, useMemo } from 'react';
import { useStudyQuestions, useSubmitAttempt } from '@/hooks/use-study';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QuestionPrompt } from './QuestionPrompt';
import { AnswerInput } from './AnswerInput';
import type { StudyQuestion } from '@/types/study';

// 2. Props interface
interface StudySessionProps {
  limit?: number;
  courseId?: string;
  onComplete?: () => void;
}

// 3. Component
export function StudySession({
  limit = 10,
  courseId,
  onComplete,
}: StudySessionProps) {
  // 4. Local state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // 5. Hooks (data fetching, mutations)
  const { data: questions, isLoading, isError } = useStudyQuestions({ limit, courseId });
  const submitAttempt = useSubmitAttempt();

  // 6. Computed values
  const currentQuestion = useMemo(() => {
    return questions?.[currentIndex] ?? null;
  }, [questions, currentIndex]);

  const progress = useMemo(() => {
    if (!questions?.length) return 0;
    return ((currentIndex + 1) / questions.length) * 100;
  }, [questions, currentIndex]);

  // 7. Event handlers
  const handleSelect = useCallback((answer: string) => {
    if (!isSubmitted) {
      setSelectedAnswer(answer);
    }
  }, [isSubmitted]);

  const handleSubmit = useCallback(async () => {
    if (!currentQuestion || !selectedAnswer) return;

    const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

    await submitAttempt.mutateAsync({
      questionId: currentQuestion.id,
      isCorrect,
      selectedAnswer,
    });

    setIsSubmitted(true);
  }, [currentQuestion, selectedAnswer, submitAttempt]);

  const handleNext = useCallback(() => {
    if (currentIndex < (questions?.length ?? 0) - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsSubmitted(false);
    } else {
      onComplete?.();
    }
  }, [currentIndex, questions, onComplete]);

  // 8. Render: loading state
  if (isLoading) {
    return <SessionSkeleton />;
  }

  // 9. Render: error state
  if (isError || !questions?.length) {
    return <EmptyState onRetry={() => {}} />;
  }

  // 10. Render: main content
  return (
    <Card className="p-6 space-y-6">
      <ProgressBar value={progress} />

      {currentQuestion && (
        <>
          <QuestionPrompt
            prompt={currentQuestion.prompt}
            topicName={currentQuestion.topicName}
            questionType={currentQuestion.questionType}
            difficulty={currentQuestion.difficulty}
            questionNumber={currentIndex + 1}
            totalQuestions={questions.length}
          />

          <AnswerInput
            questionType={currentQuestion.questionType}
            choices={currentQuestion.choices}
            selectedAnswer={selectedAnswer}
            correctAnswer={isSubmitted ? currentQuestion.correctAnswer : undefined}
            onSelect={handleSelect}
            disabled={isSubmitted}
          />

          <div className="flex justify-end gap-2">
            {!isSubmitted ? (
              <Button onClick={handleSubmit} disabled={!selectedAnswer}>
                Submit
              </Button>
            ) : (
              <Button onClick={handleNext}>
                {currentIndex < questions.length - 1 ? 'Next' : 'Finish'}
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
```

---

## Compound Component Pattern

For components with related sub-components:

```typescript
// src/components/study/GuideMe/index.tsx
import { createContext, useContext, useState, useCallback } from 'react';

// 1. Context for shared state
interface GuideMeContextValue {
  currentStep: number;
  totalSteps: number;
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
}

const GuideMeContext = createContext<GuideMeContextValue | null>(null);

function useGuideMeContext() {
  const context = useContext(GuideMeContext);
  if (!context) {
    throw new Error('GuideMe components must be used within GuideMe.Root');
  }
  return context;
}

// 2. Root component (provider)
interface RootProps {
  children: React.ReactNode;
  totalSteps: number;
  onComplete?: () => void;
}

function Root({ children, totalSteps, onComplete }: RootProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(Math.max(0, Math.min(step, totalSteps - 1)));
  }, [totalSteps]);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete?.();
    }
  }, [currentStep, totalSteps, onComplete]);

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  return (
    <GuideMeContext.Provider value={{ currentStep, totalSteps, goToStep, nextStep, prevStep }}>
      {children}
    </GuideMeContext.Provider>
  );
}

// 3. Step component
interface StepProps {
  index: number;
  children: React.ReactNode;
}

function Step({ index, children }: StepProps) {
  const { currentStep } = useGuideMeContext();

  if (index !== currentStep) return null;

  return <div className="animate-in fade-in">{children}</div>;
}

// 4. Navigation component
function Navigation() {
  const { currentStep, totalSteps, nextStep, prevStep } = useGuideMeContext();

  return (
    <div className="flex justify-between mt-4">
      <Button
        variant="outline"
        onClick={prevStep}
        disabled={currentStep === 0}
      >
        Previous
      </Button>
      <Button onClick={nextStep}>
        {currentStep < totalSteps - 1 ? 'Next' : 'Complete'}
      </Button>
    </div>
  );
}

// 5. Progress component
function Progress() {
  const { currentStep, totalSteps } = useGuideMeContext();

  return (
    <div className="flex gap-1">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded',
            i <= currentStep ? 'bg-primary' : 'bg-muted'
          )}
        />
      ))}
    </div>
  );
}

// 6. Export compound component
export const GuideMe = {
  Root,
  Step,
  Navigation,
  Progress,
};

// Usage:
// <GuideMe.Root totalSteps={3} onComplete={handleComplete}>
//   <GuideMe.Progress />
//   <GuideMe.Step index={0}>Step 1 content</GuideMe.Step>
//   <GuideMe.Step index={1}>Step 2 content</GuideMe.Step>
//   <GuideMe.Step index={2}>Step 3 content</GuideMe.Step>
//   <GuideMe.Navigation />
// </GuideMe.Root>
```

---

## Props Design

### Required vs Optional Props
```typescript
interface QuestionCardProps {
  // Required: essential for component to function
  question: Question;
  onAnswer: (answer: string) => void;

  // Optional: have sensible defaults
  showHint?: boolean;           // Default: false
  className?: string;           // Default: undefined
  testId?: string;              // Default: undefined
}
```

### Children Pattern
```typescript
// For wrapper components
interface CardWrapperProps {
  children: React.ReactNode;
  className?: string;
}

// For render props
interface DataListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyState?: React.ReactNode;
}
```

### Discriminated Unions
```typescript
// For components with mode-dependent props
type AnswerInputProps =
  | { type: 'mcq'; choices: string[]; onSelect: (choice: string) => void }
  | { type: 'numeric'; unit?: string; onSubmit: (value: number) => void }
  | { type: 'text'; placeholder?: string; onSubmit: (text: string) => void };

function AnswerInput(props: AnswerInputProps) {
  switch (props.type) {
    case 'mcq':
      return <MCQInput choices={props.choices} onSelect={props.onSelect} />;
    case 'numeric':
      return <NumericInput unit={props.unit} onSubmit={props.onSubmit} />;
    case 'text':
      return <TextInput placeholder={props.placeholder} onSubmit={props.onSubmit} />;
  }
}
```

---

## State Colocation

### Local State (useState)
Keep state close to where it's used:
```typescript
function QuestionCard({ question }: QuestionCardProps) {
  // Local UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  return (
    <Card>
      {/* Component uses local state */}
    </Card>
  );
}
```

### Lifted State
Lift when sibling components need to share:
```typescript
function StudySession() {
  // Lifted state - shared between children
  const [currentIndex, setCurrentIndex] = useState(0);

  return (
    <>
      <ProgressBar current={currentIndex} />
      <QuestionCard
        question={questions[currentIndex]}
        onNext={() => setCurrentIndex(prev => prev + 1)}
      />
    </>
  );
}
```

### Context State
Use for deeply nested or app-wide state:
```typescript
// Filter state used by many components
<FocusProvider>
  <FocusPill />      {/* Uses context */}
  <QuestionList />   {/* Uses context */}
  <FilterDrawer />   {/* Uses context */}
</FocusProvider>
```

---

## Component Size Guidelines

### Small Components (<100 lines)
Single responsibility, focused:
- UI primitives
- Simple presentational components
- Single-purpose helpers

### Medium Components (100-200 lines)
Feature components with moderate complexity:
- Forms with validation
- Interactive widgets
- Data display with actions

### Large Components (200-300 lines)
Complex features, consider splitting:
- Multi-step workflows
- Complex forms
- Dashboard sections

### Too Large (>300 lines)
**Split immediately:**
- Extract sub-components
- Extract hooks
- Split into compound components

---

## Anti-Patterns

### God Components
```typescript
// Bad: Component does everything
function StudyPage() {
  // 500+ lines of state, effects, handlers, rendering
}

// Good: Composed of smaller components
function StudyPage() {
  return (
    <PageLayout>
      <StudyHeader />
      <StudySession />
      <StudySidebar />
    </PageLayout>
  );
}
```

### Prop Drilling
```typescript
// Bad: Passing props through many layers
<GrandParent user={user}>
  <Parent user={user}>
    <Child user={user}>
      <GrandChild user={user} />
    </Child>
  </Parent>
</GrandParent>

// Good: Use context for deeply shared data
<UserProvider value={user}>
  <GrandParent>
    <Parent>
      <Child>
        <GrandChild /> {/* Uses useUser() */}
      </Child>
    </Parent>
  </GrandParent>
</UserProvider>
```

### Logic in Render
```typescript
// Bad: Complex logic inline
return (
  <div>
    {data.filter(x => x.active).map(x => x.value).reduce((a, b) => a + b, 0)}
  </div>
);

// Good: Extract to useMemo or helper
const total = useMemo(() => {
  return data.filter(x => x.active).reduce((sum, x) => sum + x.value, 0);
}, [data]);

return <div>{total}</div>;
```

### Inconsistent Naming
```typescript
// Bad: Mixed naming conventions
<UserCard />
<user-profile />
<USER_AVATAR />

// Good: Consistent PascalCase
<UserCard />
<UserProfile />
<UserAvatar />
```

---

## File Organization

### Co-locate Related Files
```
src/components/study/
├── QuestionCard/
│   ├── index.tsx           # Main component
│   ├── QuestionCard.tsx    # Component implementation
│   ├── QuestionCardSkeleton.tsx
│   └── types.ts            # If many types
├── AnswerInput.tsx         # Simple component
└── index.ts                # Barrel export
```

### Barrel Exports
```typescript
// src/components/study/index.ts
export { QuestionCard } from './QuestionCard';
export { AnswerInput } from './AnswerInput';
export { GuideMeDrawer } from './GuideMeDrawer';
```

### Import Pattern
```typescript
// Prefer specific imports
import { QuestionCard, AnswerInput } from '@/components/study';

// Avoid deep imports
import { QuestionCard } from '@/components/study/QuestionCard/QuestionCard';
```

---

## Performance Patterns

### Memoization
```typescript
// Memoize expensive computations
const groupedQuestions = useMemo(() => {
  return questions.reduce((acc, q) => {
    const topic = q.topicName;
    acc[topic] = [...(acc[topic] ?? []), q];
    return acc;
  }, {} as Record<string, Question[]>);
}, [questions]);

// Memoize callbacks passed to children
const handleSelect = useCallback((id: string) => {
  setSelectedId(id);
}, []);
```

### React.memo
```typescript
// For expensive components that receive stable props
const QuestionCard = React.memo(function QuestionCard({ question }: Props) {
  // Expensive render
  return <Card>...</Card>;
});
```

### Lazy Loading
```typescript
// Lazy load heavy components
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));

// Use with Suspense
<Suspense fallback={<DashboardSkeleton />}>
  <AdminDashboard />
</Suspense>
```
