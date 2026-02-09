import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Study from '@/pages/Study';

// ---- Mocks ----

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/study', state: null }),
  };
});

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

vi.mock('@/hooks/use-diagnostic', () => ({
  useDiagnosticData: () => ({ data: null, isLoading: false, error: null }),
  useSubmitDiagnostic: () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/use-settings', () => ({
  useUserSettings: () => ({
    settings: { daily_goal: 10, daily_plan_mode: 'single_course', pace_offset: 0 },
  }),
}));

interface MockEnrollmentsReturn {
  enrollments: Array<{ course_pack_id: string }>;
  enrolledCourseIdsArray: string[];
  isLoadingEnrollments: boolean;
}
const mockEnrollments = vi.fn<() => MockEnrollmentsReturn>();
vi.mock('@/hooks/use-enrollments', () => ({
  useEnrollments: () => mockEnrollments(),
}));

vi.mock('@/hooks/use-study-dashboard', () => ({
  useStudyDashboard: () => ({
    data: {
      todayPlan: {
        totalQuestions: 10,
        completedQuestions: 0,
        correctCount: 0,
        estimatedMinutes: 15,
        primaryCourse: null,
        alsoDueCourses: [],
        progressPercent: 0,
      },
      stats: { streak: 0, weeklyAccuracy: 0, reviewsDue: 0, questionsToday: 0 },
      practiceRecommendations: [],
      lastSession: null,
      presets: [],
    },
    isLoading: false,
  }),
  PracticeRecommendation: {},
}));

vi.mock('@/hooks/use-study', () => ({
  useStudyQuestions: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useSubmitAttempt: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/contexts/FocusContext', () => ({
  useFocusContext: () => ({
    filters: { courseIds: [], examNames: [], topicIds: [], questionTypeId: null, midtermNumber: null },
    setCourseIds: vi.fn(),
    setTopicIds: vi.fn(),
    applyPreset: vi.fn(),
    clearFilters: vi.fn(),
    hasActiveFilters: false,
  }),
  FocusPreset: {},
}));

vi.mock('@/hooks/use-sidebar', () => ({
  useSidebar: () => ({ collapse: vi.fn(), expand: vi.fn() }),
}));


// Stub child components to isolate gating logic
vi.mock('@/components/study/TodayPlanCard', () => ({
  TodayPlanCard: () => <div data-testid="today-plan-card">Today Plan</div>,
}));
vi.mock('@/components/study/StudyFocusBar', () => ({
  StudyFocusBar: () => <div data-testid="study-focus-bar">Focus Bar</div>,
}));
vi.mock('@/components/study/StatsStrip', () => ({
  StatsStrip: () => <div data-testid="stats-strip">Stats Strip</div>,
}));
vi.mock('@/components/study/RecommendationCards', () => ({
  RecommendationCards: () => <div data-testid="recommendation-cards">Recommendations</div>,
}));
vi.mock('@/components/study/ContinueSessionCard', () => ({
  ContinueSessionCard: () => <div data-testid="continue-session-card" />,
}));
vi.mock('@/components/study/FocusBar', () => ({
  FocusBar: () => <div data-testid="focus-bar" />,
}));
vi.mock('@/components/study/QuestionPlayer', () => ({
  QuestionPlayer: () => <div data-testid="question-player" />,
}));
vi.mock('@/components/study/MultiPartQuestionPlayer', () => ({
  MultiPartQuestionPlayer: () => <div data-testid="multi-part-player" />,
}));
vi.mock('@/components/study/CompletionCard', () => ({
  CompletionCard: () => <div data-testid="completion-card" />,
}));
vi.mock('@/components/study/StudyLoadingScreen', () => ({
  StudyLoadingScreen: () => <div data-testid="loading-screen" />,
}));
vi.mock('@/components/study/QuestionNav', () => ({
  QuestionNav: () => <div data-testid="question-nav" />,
}));
vi.mock('@/components/motion/PageTransition', () => ({
  PageTransition: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

// ---- Helpers ----

function renderStudy(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/study']}>
        <Study />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---- Tests ----

describe('Study page enrollment gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when user has 0 enrollments', () => {
    mockEnrollments.mockReturnValue({
      enrollments: [],
      enrolledCourseIdsArray: [],
      isLoadingEnrollments: false,
    });

    renderStudy();

    // Empty state should be visible
    expect(screen.getByText(/not enrolled in any courses/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enroll in courses/i })).toBeInTheDocument();

    // Dashboard widgets should NOT be visible
    expect(screen.queryByTestId('today-plan-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('study-focus-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stats-strip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recommendation-cards')).not.toBeInTheDocument();
  });

  it('renders normal dashboard when user has >= 1 enrollment', () => {
    mockEnrollments.mockReturnValue({
      enrollments: [{ course_pack_id: 'course-1' }],
      enrolledCourseIdsArray: ['course-1'],
      isLoadingEnrollments: false,
    });

    renderStudy();

    // Dashboard widgets should be visible
    expect(screen.getByTestId('today-plan-card')).toBeInTheDocument();
    expect(screen.getByTestId('study-focus-bar')).toBeInTheDocument();
    expect(screen.getByTestId('stats-strip')).toBeInTheDocument();
    expect(screen.getByTestId('recommendation-cards')).toBeInTheDocument();

    // Empty state should NOT be visible
    expect(screen.queryByText(/not enrolled in any courses/i)).not.toBeInTheDocument();
  });

  it('does not flash dashboard while enrollment is loading', () => {
    mockEnrollments.mockReturnValue({
      enrollments: [],
      enrolledCourseIdsArray: [],
      isLoadingEnrollments: true,
    });

    renderStudy();

    // Neither empty state nor dashboard widgets should be visible during loading
    expect(screen.queryByText(/not enrolled in any courses/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('today-plan-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('study-focus-bar')).not.toBeInTheDocument();
  });
});
