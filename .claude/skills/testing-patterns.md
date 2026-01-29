# Testing Patterns Skill

This skill guides unit, integration, and E2E testing for Study Flow Forge.

---

## Directory Structure

```
project/
├── src/
│   └── test/
│       └── setup.ts          # Vitest global setup
├── tests/
│   ├── unit/                 # Unit tests
│   │   └── hooks/
│   │       └── use-auth.test.ts
│   └── integration/          # Integration tests
│       └── study-flow.test.ts
├── e2e/                      # Playwright E2E tests
│   └── study.spec.ts
├── vitest.config.ts
└── playwright.config.ts
```

---

## Vitest Configuration

### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### src/test/setup.ts
```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

---

## Unit Testing Hooks

### Testing with @testing-library/react

```typescript
// tests/unit/hooks/use-auth.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuth } from '@/hooks/use-auth';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: null }, error: null })
      ),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with loading state', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBe(null);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should update state when session exists', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };
    const mockSession = { user: mockUser, access_token: 'token' };

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: mockSession },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should handle sign in', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const { error } = await result.current.signIn('test@example.com', 'password');
      expect(error).toBe(null);
    });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    });
  });
});
```

### Testing Hooks with React Query

```typescript
// tests/unit/hooks/use-study.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { useStudyQuestions } from '@/hooks/use-study';

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useStudyQuestions', () => {
  it('should fetch questions when user is authenticated', async () => {
    // Mock useAuth to return authenticated user
    vi.mock('@/hooks/use-auth', () => ({
      useAuth: () => ({
        user: { id: 'user-123' },
        isAuthenticated: true,
      }),
    }));

    // Mock Supabase RPC
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: [{ id: 'q1', prompt: 'Test question' }],
      error: null,
    });

    const { result } = renderHook(() => useStudyQuestions({ limit: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].prompt).toBe('Test question');
  });

  it('should not fetch when user is not authenticated', () => {
    vi.mock('@/hooks/use-auth', () => ({
      useAuth: () => ({
        user: null,
        isAuthenticated: false,
      }),
    }));

    const { result } = renderHook(() => useStudyQuestions(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});
```

---

## Mocking Supabase Client

### Mock Factory Pattern
```typescript
// tests/mocks/supabase.ts
import { vi } from 'vitest';

export function createMockSupabase() {
  return {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      getSession: vi.fn(),
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    })),
    rpc: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
}

// Usage
vi.mock('@/integrations/supabase/client', () => ({
  supabase: createMockSupabase(),
}));
```

### Mocking Specific Queries
```typescript
import { supabase } from '@/integrations/supabase/client';

// Mock a specific query chain
vi.mocked(supabase.from).mockImplementation((table) => {
  if (table === 'questions') {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: 'q1', prompt: 'Question 1' }],
        error: null,
      }),
    } as any;
  }
  return createMockSupabase().from(table);
});
```

---

## Component Testing

```typescript
// tests/unit/components/QuestionPrompt.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QuestionPrompt } from '@/components/study/QuestionPrompt';

describe('QuestionPrompt', () => {
  const defaultProps = {
    prompt: 'What is 2 + 2?',
    topicName: 'Basic Arithmetic',
    questionType: 'numeric',
    difficulty: 2,
    questionNumber: 1,
  };

  it('should render question prompt', () => {
    render(<QuestionPrompt {...defaultProps} />);

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  it('should display topic name', () => {
    render(<QuestionPrompt {...defaultProps} />);

    expect(screen.getByText('Basic Arithmetic')).toBeInTheDocument();
  });

  it('should show difficulty indicator', () => {
    render(<QuestionPrompt {...defaultProps} difficulty={4} />);

    // Check for difficulty visual representation
    const difficultyBars = screen.getAllByTestId('difficulty-bar');
    expect(difficultyBars).toHaveLength(5);
  });

  it('should show question number with total', () => {
    render(<QuestionPrompt {...defaultProps} totalQuestions={10} />);

    expect(screen.getByText('1 of 10')).toBeInTheDocument();
  });

  it('should render image when provided', () => {
    render(
      <QuestionPrompt
        {...defaultProps}
        imageUrl="https://example.com/image.png"
      />
    );

    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', 'https://example.com/image.png');
  });
});
```

---

## Playwright E2E Testing

### Configuration
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### E2E Test for Study Flow
```typescript
// e2e/study.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Study Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('/study');
  });

  test('should display study dashboard', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /today's plan/i })).toBeVisible();
  });

  test('should load and display questions', async ({ page }) => {
    // Wait for questions to load
    await expect(page.getByTestId('question-card')).toBeVisible();

    // Check question content is displayed
    await expect(page.getByTestId('question-prompt')).toBeVisible();
  });

  test('should submit answer and show feedback', async ({ page }) => {
    // Wait for question
    await page.waitForSelector('[data-testid="question-card"]');

    // Select an answer (MCQ)
    await page.click('[data-testid="answer-choice-0"]');

    // Submit
    await page.click('[data-testid="submit-answer"]');

    // Check feedback is shown
    await expect(page.getByTestId('answer-feedback')).toBeVisible();
  });

  test('should navigate to next question', async ({ page }) => {
    // Answer first question
    await page.click('[data-testid="answer-choice-0"]');
    await page.click('[data-testid="submit-answer"]');

    // Click next
    await page.click('[data-testid="next-question"]');

    // Verify new question is shown
    const firstPrompt = await page.textContent('[data-testid="question-prompt"]');
    await page.click('[data-testid="answer-choice-0"]');
    await page.click('[data-testid="submit-answer"]');
    await page.click('[data-testid="next-question"]');
    const secondPrompt = await page.textContent('[data-testid="question-prompt"]');

    expect(firstPrompt).not.toBe(secondPrompt);
  });
});
```

### Auth E2E Test
```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/study');
    await expect(page).toHaveURL('/auth');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('[name="email"]', 'wrong@example.com');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.getByText(/invalid credentials/i)).toBeVisible();
  });

  test('should login successfully', async ({ page }) => {
    await page.goto('/auth');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/study');
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/auth');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'testpassword');
    await page.click('button[type="submit"]');
    await page.waitForURL('/study');

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    await expect(page).toHaveURL('/auth');
  });
});
```

---

## Decision Tree: What to Test

### Unit Test (Fast, Isolated)
- Pure functions
- Custom hooks (data fetching, state logic)
- Utility functions
- Component rendering with props

### Integration Test (Medium, Combined)
- Component interactions
- Form submission flows
- React Query + component integration
- Context providers with children

### E2E Test (Slow, Full Stack)
- Critical user flows (login, study session)
- Payment/checkout flows
- Multi-page workflows
- OAuth flows

### Skip Testing
- UI library components (ShadCN)
- Simple presentational components
- Type definitions
- Configuration files

---

## Running Tests

```bash
# Unit and integration tests
npm run test              # Watch mode
npm run test:run          # Single run
npm run test:coverage     # With coverage

# E2E tests
npm run test:e2e          # Run Playwright
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:debug    # Debug mode
```

---

## Anti-Patterns

1. **Don't test implementation details**
```typescript
// Bad - testing internal state
expect(result.current.internalState).toBe(5);

// Good - testing observable behavior
expect(screen.getByText('5 items')).toBeInTheDocument();
```

2. **Don't mock everything**
```typescript
// Bad - over-mocking
vi.mock('react');
vi.mock('react-dom');

// Good - mock only external dependencies
vi.mock('@/integrations/supabase/client');
```

3. **Don't use sleep/timeout**
```typescript
// Bad
await new Promise(r => setTimeout(r, 1000));

// Good
await waitFor(() => expect(result.current.data).toBeDefined());
```

4. **Don't forget cleanup**
```typescript
afterEach(() => {
  vi.clearAllMocks();
  // cleanup();  // @testing-library handles this
});
```
