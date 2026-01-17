import { PageTransition } from "@/components/motion/PageTransition";
import { BarChart3 } from "lucide-react";

export default function Progress() {
  return (
    <PageTransition className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <p className="text-muted-foreground">Track your mastery across topics</p>
      </div>

      {/* Placeholder - will be built in Step 1.6 */}
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
        <p>Topic mastery overview coming soon</p>
      </div>
    </PageTransition>
  );
}
