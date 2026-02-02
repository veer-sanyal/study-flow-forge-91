import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export function ClearDataCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isClearing, setIsClearing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleClearData = async () => {
    if (!user) return;

    setIsClearing(true);
    try {
      // Delete in order to respect foreign key constraints
      // 1. Delete SRS state (question-level scheduling)
      const { error: srsError } = await supabase
        .from('srs_state')
        .delete()
        .eq('user_id', user.id);
      if (srsError) throw srsError;

      // 2. Delete attempts (answer history)
      const { error: attemptsError } = await supabase
        .from('attempts')
        .delete()
        .eq('user_id', user.id);
      if (attemptsError) throw attemptsError;

      // 3. Delete topic mastery records
      const { error: masteryError } = await supabase
        .from('topic_mastery')
        .delete()
        .eq('user_id', user.id);
      if (masteryError) throw masteryError;

      // 4. Delete course enrollments
      const { error: enrollmentError } = await supabase
        .from('user_enrollments')
        .delete()
        .eq('user_id', user.id);
      if (enrollmentError) throw enrollmentError;

      // 5. Reset user settings to defaults (but keep the row)
      const { error: settingsError } = await supabase
        .from('user_settings')
        .update({
          daily_goal: 10,
          pace_offset: 1,
          notifications_enabled: true,
          reduced_motion: false,
          daily_plan_mode: 'single_course',
        })
        .eq('user_id', user.id);
      if (settingsError) throw settingsError;

      // Invalidate all relevant queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['srs-state'] });
      queryClient.invalidateQueries({ queryKey: ['attempts'] });
      queryClient.invalidateQueries({ queryKey: ['topic-mastery'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      queryClient.invalidateQueries({ queryKey: ['daily-plan'] });
      queryClient.invalidateQueries({ queryKey: ['study-recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['progress-stats'] });
      queryClient.invalidateQueries({ queryKey: ['review-forecast'] });

      toast({
        title: 'Data cleared',
        description: 'All your study progress has been reset.',
      });
      setIsOpen(false);
    } catch (error: any) {
      console.error('Error clearing data:', error);
      toast({
        title: 'Error clearing data',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible actions that affect your data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All My Data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Clear all study data?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  This will permanently delete:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>All your question attempts and answer history</li>
                  <li>Your spaced repetition progress (SRS state)</li>
                  <li>Topic mastery scores</li>
                  <li>Course enrollments</li>
                  <li>Study preferences (reset to defaults)</li>
                </ul>
                <p className="font-medium text-foreground">
                  This action cannot be undone.
                </p>
                <p className="text-xs text-muted-foreground">
                  Note: Course content, questions, and exams will not be affected.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearData}
                disabled={isClearing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isClearing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Yes, clear my data
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

