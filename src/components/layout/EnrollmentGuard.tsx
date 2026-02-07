import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEnrollments } from "@/hooks/use-enrollments";
import { Loader2 } from "lucide-react";

export function EnrollmentGuard() {
    const { enrollments, isLoadingEnrollments } = useEnrollments();
    const location = useLocation();

    if (isLoadingEnrollments) {
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
