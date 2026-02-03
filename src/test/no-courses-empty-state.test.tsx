import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NoCoursesEmptyState } from '@/components/shared/NoCoursesEmptyState';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/components/motion/PageTransition', () => ({
  PageTransition: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

function renderComponent(props: Parameters<typeof NoCoursesEmptyState>[0] = {}): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <NoCoursesEmptyState {...props} />
    </MemoryRouter>,
  );
}

describe('NoCoursesEmptyState', () => {
  it('renders default title, subtitle, and button', () => {
    renderComponent();

    expect(screen.getByText(/not enrolled in any courses/i)).toBeInTheDocument();
    expect(screen.getByText(/enroll in a course to generate a study plan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enroll in courses/i })).toBeInTheDocument();
  });

  it('renders custom title and button label', () => {
    renderComponent({
      title: 'Custom title',
      buttonLabel: 'Custom button',
    });

    expect(screen.getByText('Custom title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom button' })).toBeInTheDocument();
  });

  it('navigates to /settings when button is clicked', () => {
    renderComponent();

    fireEvent.click(screen.getByRole('button', { name: /enroll in courses/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('renders the BookOpen icon', () => {
    const { container } = renderComponent();

    // lucide-react renders an svg with the lucide class
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
