import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface SessionProgressDotsProps {
  totalQuestions: number;
  currentIndex: number;
  outcomes: Record<number, 'correct' | 'incorrect' | 'skipped'>;
  onNavigate?: (index: number) => void;
  insertedIndices?: Set<number>;
}

export function SessionProgressDots({
  totalQuestions,
  currentIndex,
  outcomes,
  onNavigate,
  insertedIndices,
}: SessionProgressDotsProps) {
  return (
    <div className="flex flex-wrap gap-1 py-2 px-4 items-center">
      {Array.from({ length: totalQuestions }).map((_, i) => {
        const isInserted = insertedIndices?.has(i);
        return (
          <button
            key={i}
            onClick={() => onNavigate?.(i)}
            disabled={!onNavigate}
            aria-label={`Question ${i + 1}${isInserted ? ' (adaptive)' : ''}`}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all relative",
              i === currentIndex && "ring-2 ring-primary/40 bg-primary",
              outcomes[i] === 'correct' && "bg-success",
              outcomes[i] === 'incorrect' && "bg-destructive",
              outcomes[i] === 'skipped' && "bg-muted-foreground/40",
              !outcomes[i] && i !== currentIndex && "bg-muted border border-border",
              isInserted && !outcomes[i] && i !== currentIndex && "border-primary/50 border-dashed"
            )}
          />
        );
      })}
    </div>
  );
}
