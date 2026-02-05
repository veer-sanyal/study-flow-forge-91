import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StudentCalendar from '@/pages/StudentCalendar';
import type { CalendarDayReviewData } from '@/types/progress';

// ---- Mocks ----

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

interface MockEnrollmentsReturn {
  enrollments: Array<{ course_pack_id: string }>;
  isLoadingEnrollments: boolean;
  enrolledCourseIdsArray: string[];
  enrolledCourseIds: Set<string>;
  coursePacks: unknown[];
  isLoadingCoursePacks: boolean;
  enroll: () => void;
  unenroll: () => void;
  isEnrolling: boolean;
  isUnenrolling: boolean;
}
const mockEnrollments = vi.fn<() => MockEnrollmentsReturn>();
vi.mock('@/hooks/use-enrollments', () => ({
  useEnrollments: () => mockEnrollments(),
}));

interface MockCalendarReviewReturn {
  data: Map<string, CalendarDayReviewData>;
  isLoading: boolean;
  hasAnyReviews: boolean;
}
const mockCalendarReviewData = vi.fn<() => MockCalendarReviewReturn>();
vi.mock('@/hooks/use-calendar', () => ({
  useStudentCalendarEvents: () => ({ data: [] }),
  useUpcomingExams: () => ({ data: [] }),
  useCalendarReviewData: () => mockCalendarReviewData(),
  getEventTypeColor: () => '',
}));

vi.mock('@/hooks/use-focus', () => ({
  useCourses: () => ({ data: [] }),
}));

vi.mock('@/contexts/FocusContext', () => ({
  useFocusContext: () => ({
    setTopicIds: vi.fn(),
    filters: { courseIds: [], examNames: [], midtermNumber: null, topicIds: [], questionTypeId: null },
  }),
}));

// Stub subcomponents that don't matter for gating
vi.mock('@/components/calendar/CalendarGrid', () => ({
  CalendarGrid: () => <div data-testid="calendar-grid" />,
}));
vi.mock('@/components/calendar/CalendarControls', () => ({
  CalendarControls: () => <div data-testid="calendar-controls" />,
}));
vi.mock('@/components/calendar/DayDetailPanel', () => ({
  DayDetailPanel: () => <div data-testid="day-detail-panel" />,
}));
vi.mock('@/components/motion/PageTransition', () => ({
  PageTransition: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));
vi.mock('@/components/shared/NoCoursesEmptyState', () => ({
  NoCoursesEmptyState: () => <div data-testid="no-courses-empty-state">not enrolled in any courses</div>,
}));

// ---- Helpers ----

function defaultEnrollmentReturn(
  overrides: Partial<ReturnType<typeof mockEnrollments>> = {},
): ReturnType<typeof mockEnrollments> {
  return {
    enrollments: [],
    isLoadingEnrollments: false,
    enrolledCourseIdsArray: [],
    enrolledCourseIds: new Set<string>(),
    coursePacks: [],
    isLoadingCoursePacks: false,
    enroll: vi.fn(),
    unenroll: vi.fn(),
    isEnrolling: false,
    isUnenrolling: false,
    ...overrides,
  };
}

function renderCalendar(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <StudentCalendar />
    </MemoryRouter>,
  );
}

// ---- Tests ----

describe('Calendar page gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "not enrolled" empty state when user has 0 enrollments', () => {
    mockEnrollments.mockReturnValue(defaultEnrollmentReturn());
    mockCalendarReviewData.mockReturnValue({
      data: new Map(),
      isLoading: false,
      hasAnyReviews: false,
    });

    renderCalendar();

    expect(screen.getByTestId('no-courses-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('calendar-grid')).not.toBeInTheDocument();
  });

  it('shows grid + "No reviews scheduled yet" when enrolled but no FSRS data', () => {
    mockEnrollments.mockReturnValue(
      defaultEnrollmentReturn({
        enrollments: [{ course_pack_id: 'course-1' }],
        enrolledCourseIdsArray: ['course-1'],
        enrolledCourseIds: new Set(['course-1']),
      }),
    );
    mockCalendarReviewData.mockReturnValue({
      data: new Map(),
      isLoading: false,
      hasAnyReviews: false,
    });

    renderCalendar();

    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    expect(screen.getByText(/no reviews scheduled yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('no-courses-empty-state')).not.toBeInTheDocument();
  });

  it('shows grid without "no reviews" message when enrolled with review data', () => {
    mockEnrollments.mockReturnValue(
      defaultEnrollmentReturn({
        enrollments: [{ course_pack_id: 'course-1' }],
        enrolledCourseIdsArray: ['course-1'],
        enrolledCourseIds: new Set(['course-1']),
      }),
    );
    const reviewMap = new Map<string, CalendarDayReviewData>();
    reviewMap.set('2026-02-03', {
      date: '2026-02-03',
      totalDue: 5,
      overdueCount: 0,
      topTopics: [{ topicId: 't1', topicTitle: 'Limits', dueCount: 5 }],
    });
    mockCalendarReviewData.mockReturnValue({
      data: reviewMap,
      isLoading: false,
      hasAnyReviews: true,
    });

    renderCalendar();

    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    expect(screen.queryByText(/no reviews scheduled yet/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-courses-empty-state')).not.toBeInTheDocument();
  });

  it('shows spinner during loading without flash of content', () => {
    mockEnrollments.mockReturnValue(
      defaultEnrollmentReturn({ isLoadingEnrollments: true }),
    );
    mockCalendarReviewData.mockReturnValue({
      data: new Map(),
      isLoading: true,
      hasAnyReviews: false,
    });

    renderCalendar();

    // Spinner is present (the spinning div)
    expect(screen.getByText('', { selector: '.animate-spin' })).toBeInTheDocument();
    // No grid or empty state visible
    expect(screen.queryByTestId('calendar-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('no-courses-empty-state')).not.toBeInTheDocument();
  });
});
