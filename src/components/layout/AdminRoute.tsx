import { Navigate, Outlet } from "react-router-dom";
import { useIsAdmin } from "@/hooks/use-admin";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminRoute() {
  const { data: isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-full max-w-md p-8">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/study" replace />;
  }

  return <Outlet />;
}
