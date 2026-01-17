import { PageTransition } from "@/components/motion/PageTransition";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Moon, Sun, Settings as SettingsIcon, LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: 'Sign out failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      navigate('/auth', { replace: true });
    }
  };

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences</p>
        </div>

        {/* Account */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user?.user_metadata?.full_name || 'Student'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {/* Appearance */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Appearance</h2>
          <div className="flex items-center justify-between rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <Label htmlFor="dark-mode" className="text-sm font-medium cursor-pointer">
                Dark Mode
              </Label>
            </div>
            <Switch
              id="dark-mode"
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </div>

        {/* Placeholder for enrollment + pace settings */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Enrollment</h2>
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground rounded-lg border border-dashed bg-card">
            <SettingsIcon className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm">Course enrollment settings coming soon</p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
