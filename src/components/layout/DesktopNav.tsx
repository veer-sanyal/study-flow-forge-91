import { BookOpen, BarChart3, Settings, GraduationCap, Moon, Sun, Calendar, Shield, Upload, FileQuestion, PanelLeftClose } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useIsAdmin } from "@/hooks/use-admin";
import { useSidebar } from "@/hooks/use-sidebar";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { to: "/study", label: "Study", icon: BookOpen },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const adminNavItems = [
  { to: "/admin/calendar", label: "Calendar", icon: Calendar },
  { to: "/admin/ingestion", label: "Ingestion", icon: Upload },
  { to: "/admin/questions", label: "Questions", icon: FileQuestion },
];

export function DesktopNav() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { data: isAdmin } = useIsAdmin();
  const { isCollapsed, toggle } = useSidebar();

  if (isCollapsed) {
    return null;
  }

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col border-r border-border bg-sidebar z-40">
      {/* Logo / Brand */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg text-sidebar-foreground">Study Hub</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to || 
            (item.to === "/study" && location.pathname === "/");
          
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          );
        })}

        {/* Admin Section */}
        {isAdmin && (
          <>
            <Separator className="my-3" />
            <div className="px-3 py-1">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                Admin
              </span>
            </div>
            {adminNavItems.map((item) => {
              const isActive = location.pathname === item.to;
              
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              );
            })}
          </>
        )}
      </nav>

      {/* Theme Toggle */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground"
        >
          {theme === "dark" ? (
            <>
              <Sun className="h-5 w-5" />
              Light Mode
            </>
          ) : (
            <>
              <Moon className="h-5 w-5" />
              Dark Mode
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
