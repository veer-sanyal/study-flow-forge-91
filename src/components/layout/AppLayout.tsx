import { Outlet } from "react-router-dom";
import { DesktopNav } from "./DesktopNav";
import { MobileBottomNav } from "./MobileBottomNav";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop: Left rail navigation */}
      <DesktopNav />
      
      {/* Main content area */}
      <main className="md:pl-64 pb-20 md:pb-0">
        <div className="container max-w-3xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
      
      {/* Mobile: Bottom navigation */}
      <MobileBottomNav />
    </div>
  );
}
