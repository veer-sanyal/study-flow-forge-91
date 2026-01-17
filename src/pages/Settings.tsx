import { PageTransition } from "@/components/motion/PageTransition";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun, Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  const { theme, setTheme } = useTheme();

  return (
    <PageTransition className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your preferences</p>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
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

      {/* Placeholder for enrollment + pace settings - will be built in Step 1.7 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Enrollment</h2>
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
          <SettingsIcon className="h-8 w-8 mb-3 opacity-50" />
          <p className="text-sm">Course enrollment settings coming soon</p>
        </div>
      </div>
    </PageTransition>
  );
}
