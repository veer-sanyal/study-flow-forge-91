import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { Play, Calendar } from "lucide-react";

export default function Study() {
  // Mock data - will be replaced with real data from Supabase
  const todayRemaining = 8;
  const nextExamName = "MT1";
  const daysUntilExam = 5;
  const isComplete = false;

  return (
    <PageTransition className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Study</h1>
        <p className="text-muted-foreground">
          {isComplete ? (
            <span className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20 text-green-500">
                ✓
              </span>
              Daily plan complete • Keep practicing
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Today: {todayRemaining} left • Next exam: {nextExamName} in {daysUntilExam} days
            </span>
          )}
        </p>
      </div>

      {/* Primary CTA */}
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="rounded-full bg-primary/10 p-6">
          <Play className="h-12 w-12 text-primary" />
        </div>
        
        <Button size="lg" className="gap-2 text-lg px-8 py-6">
          <Play className="h-5 w-5" />
          {isComplete ? "Keep Practicing" : "Start Today's Plan"}
        </Button>

        {!isComplete && (
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Change focus
          </Button>
        )}
      </div>
    </PageTransition>
  );
}
