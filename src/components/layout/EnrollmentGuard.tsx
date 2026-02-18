import { Navigate, Outlet } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEnrollments } from "@/hooks/use-enrollments";

export function EnrollmentGuard() {
    const { loading: authLoading, user } = useAuth();
    const { enrollments, isLoadingEnrollments, isFetchingEnrollments } = useEnrollments();

    // Dev bypass: ?skip_onboarding=true in dev mode skips enrollment check
    const searchParams = new URLSearchParams(window.location.search);
    const devSkip = import.meta.env.DEV && searchParams.get('skip_onboarding') === 'true';

    if (devSkip) {
        return <Outlet />;
    }

    // Wait for auth + enrollments to resolve before gating.
    // Important: if enrollments are being refetched and the current cached value is empty,
    // don't redirect yet—show a spinner until the fetch resolves.
    const waitingOnEnrollments = isLoadingEnrollments || (isFetchingEnrollments && enrollments.length === 0);

    if (authLoading || !user || waitingOnEnrollments) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // If user has NO enrollments, force them to /onboarding
    if (enrollments.length === 0) {
        return <Navigate to="/onboarding" replace />;
    }

    // Otherwise, render the child routes (the main app)
    return <Outlet />;
}
