import { useState } from "react";
import { PageTransition } from "@/components/motion/PageTransition";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { 
  Moon, 
  Sun, 
  LogOut, 
  User, 
  Gauge, 
  Target,
  Bell,
  BookOpen
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  // Local state for settings (would be persisted to DB in production)
  const [dailyGoal, setDailyGoal] = useState(10);
  const [paceOffset, setPaceOffset] = useState(1);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: 'Sign out failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Signed out',
        description: 'See you next time!',
      });
      navigate('/auth', { replace: true });
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: prefersReducedMotion ? 0 : 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.2, ease: "easeOut" }
    },
  };

  return (
    <PageTransition>
      <div className="max-w-2xl mx-auto">
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Account */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Account</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="p-3 rounded-full bg-primary/10">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {user?.user_metadata?.full_name || 'Student'}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
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
              </CardContent>
            </Card>
          </motion.div>

          {/* Study Preferences */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Study Preferences</CardTitle>
                <CardDescription>Customize your daily learning</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Daily Goal */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Daily Goal</Label>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {dailyGoal} questions
                    </span>
                  </div>
                  <Slider
                    value={[dailyGoal]}
                    onValueChange={([value]) => setDailyGoal(value)}
                    min={5}
                    max={30}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Questions in your daily plan
                  </p>
                </div>

                {/* Pace Offset */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Learning Pace</Label>
                    </div>
                    <span className="text-sm font-semibold">
                      {paceOffset === 0 ? 'On schedule' : paceOffset > 0 ? `${paceOffset} week${paceOffset > 1 ? 's' : ''} ahead` : `${Math.abs(paceOffset)} week${Math.abs(paceOffset) > 1 ? 's' : ''} behind`}
                    </span>
                  </div>
                  <Slider
                    value={[paceOffset]}
                    onValueChange={([value]) => setPaceOffset(value)}
                    min={-2}
                    max={3}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    How far ahead of the syllabus you want to study
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Appearance */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Appearance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {theme === "dark" ? (
                      <Moon className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Sun className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <Label htmlFor="dark-mode" className="text-sm font-medium cursor-pointer">
                        Dark Mode
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Use dark theme
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="dark-mode"
                    checked={theme === "dark"}
                    onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Gauge className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="reduced-motion" className="text-sm font-medium cursor-pointer">
                        Reduce Motion
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Minimize animations
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="reduced-motion"
                    checked={reducedMotion}
                    onCheckedChange={setReducedMotion}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Notifications */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Notifications</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <Label htmlFor="notifications" className="text-sm font-medium cursor-pointer">
                        Study Reminders
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Get reminded to complete your daily plan
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="notifications"
                    checked={notificationsEnabled}
                    onCheckedChange={setNotificationsEnabled}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Enrollment Placeholder */}
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Enrollment</CardTitle>
                <CardDescription>Your course packs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground rounded-lg border border-dashed">
                  <BookOpen className="h-8 w-8 mb-3 opacity-50" />
                  <p className="text-sm">Course enrollment coming soon</p>
                  <p className="text-xs mt-1">You'll be able to join course packs here</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </PageTransition>
  );
}