import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEnrollments } from "@/hooks/use-enrollments";
import { useDiagnosticCompletions } from "@/hooks/use-diagnostic-completions";

/**
 * DiagnosticGuard ensures users complete diagnostic quizzes for all enrolled courses
 * before accessing the main study dashboard.
 *
 * Flow:
 * 1. If user has pending diagnostics (enrolled courses without completions) → redirect to /diagnostic
 * 2. If all enrolled courses have diagnostic completions → render children
 */
export function DiagnosticGuard(): JSX.Element {
  const location = useLocation();
  const { loading: authLoading, user } = useAuth();
  const { enrollments, isLoadingEnrollments, isFetchingEnrollments } = useEnrollments();
  const { completedCourseIds, isLoading: isLoadingCompletions } = useDiagnosticCompletions();

  // Dev bypass: ?skip_onboarding=true in dev mode skips diagnostic check
  const searchParams = new URLSearchParams(window.location.search);
  const devSkip = import.meta.env.DEV && searchParams.get('skip_onboarding') === 'true';

  if (devSkip) {
    return <Outlet />;
  }

  // Wait for all data to load
  const isLoading = authLoading || !user || isLoadingEnrollments || isLoadingCompletions;

  // Handle refetch case: if completions are being refetched, don't redirect prematurely
  const waitingOnData = isLoading || (isFetchingEnrollments && enrollments.length === 0);

  if (waitingOnData) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Find courses that need diagnostics
  const pendingDiagnosticCourses = enrollments.filter(
    enrollment => !completedCourseIds.has(enrollment.course_pack_id)
  );

  // If there are pending diagnostics, redirect to diagnostic page
  if (pendingDiagnosticCourses.length > 0) {
    // Preserve the intended destination so we can return after diagnostic
    return <Navigate to="/diagnostic" state={{ from: location }} replace />;
  }

  // All diagnostics complete - render children
  return <Outlet />;
}
