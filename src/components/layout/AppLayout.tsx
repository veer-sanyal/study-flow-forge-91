import { Outlet } from "react-router-dom";
import { DesktopNav } from "./DesktopNav";
import { MobileBottomNav } from "./MobileBottomNav";
import { useSidebar } from "@/hooks/use-sidebar";
import { Button } from "@/components/ui/button";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { isCollapsed, toggle } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop: Left rail navigation */}
      <DesktopNav />
      
      {/* Sidebar toggle button when collapsed */}
      {isCollapsed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="hidden md:flex fixed left-4 top-4 z-50 h-10 w-10 rounded-lg bg-card border border-border shadow-sm hover:bg-accent"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
      )}
      
      {/* Main content area */}
      <main className={cn(
        "pb-20 md:pb-0 transition-all duration-200",
        isCollapsed ? "md:pl-0" : "md:pl-64"
      )}>
        <div className={cn(
          "mx-auto px-4 py-6",
          isCollapsed ? "container max-w-4xl" : "container max-w-3xl"
        )}>
          <Outlet />
        </div>
      </main>
      
      {/* Mobile: Bottom navigation */}
      <MobileBottomNav />
    </div>
  );
}
