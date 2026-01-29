import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubpartProgressProps {
  totalParts: number;
  currentPartIndex: number;
  completedParts: boolean[];
  onPartSelect?: (index: number) => void;
}

export function SubpartProgress({
  totalParts,
  currentPartIndex,
  completedParts,
  onPartSelect,
}: SubpartProgressProps) {
  const partLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalParts }).map((_, index) => {
        const isCompleted = completedParts[index];
        const isCurrent = index === currentPartIndex;
        const isNavigable = onPartSelect && (isCompleted || isCurrent);
        const label = partLabels[index] || String(index + 1);

        return (
          <button
            key={index}
            type="button"
            disabled={!isNavigable}
            onClick={() => isNavigable && onPartSelect(index)}
            className={cn(
              "flex flex-col items-center gap-1",
              isNavigable && "cursor-pointer",
              !isNavigable && "cursor-default"
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-200",
                isCompleted && "bg-primary text-primary-foreground",
                isCurrent && !isCompleted && "bg-primary/20 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background",
                !isCompleted && !isCurrent && "bg-muted text-muted-foreground",
                isNavigable && !isCurrent && "hover:ring-2 hover:ring-primary/50 hover:ring-offset-2 hover:ring-offset-background",
              )}
            >
              {isCompleted ? (
                <Check className="h-4 w-4" />
              ) : (
                label
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
