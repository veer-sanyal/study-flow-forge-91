import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Circle, ChevronLeft, ChevronRight } from "lucide-react";

interface QuestionNavProps {
  totalQuestions: number;
  currentIndex: number;
  completedIndices: number[];
  onNavigate: (index: number) => void;
}

export function QuestionNav({
  totalQuestions,
  currentIndex,
  completedIndices,
  onNavigate,
}: QuestionNavProps) {
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < totalQuestions - 1;

  return (
    <div className="flex items-center gap-2 py-2 px-1">
      {/* Previous button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onNavigate(currentIndex - 1)}
        disabled={!canGoPrev}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Question pills */}
      <div className="flex-1 overflow-x-auto overflow-y-visible">
        <div className="flex gap-1.5 px-1 py-1">
          {Array.from({ length: totalQuestions }, (_, i) => {
            const isCompleted = completedIndices.includes(i);
            const isCurrent = i === currentIndex;

            return (
              <button
                key={i}
                onClick={() => onNavigate(i)}
                className={cn(
                  "relative h-8 min-w-8 px-2 rounded-full text-xs font-medium transition-all",
                  "flex items-center justify-center gap-1",
                  isCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : isCompleted
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {isCompleted && !isCurrent && (
                  <Check className="h-3 w-3" />
                )}
                <span>{i + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Next button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onNavigate(currentIndex + 1)}
        disabled={!canGoNext}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
