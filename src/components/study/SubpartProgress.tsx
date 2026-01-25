import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubpartProgressProps {
  totalParts: number;
  currentPartIndex: number;
  completedParts: boolean[];  // Array of completion status per part
}

export function SubpartProgress({ 
  totalParts, 
  currentPartIndex, 
  completedParts 
}: SubpartProgressProps) {
  const partLabels = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalParts }).map((_, index) => {
        const isCompleted = completedParts[index];
        const isCurrent = index === currentPartIndex;
        const label = partLabels[index] || String(index + 1);
        
        return (
          <div 
            key={index} 
            className="flex flex-col items-center gap-1"
          >
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-200",
                isCompleted && "bg-primary text-primary-foreground",
                isCurrent && !isCompleted && "bg-primary/20 text-primary ring-2 ring-primary ring-offset-2 ring-offset-background",
                !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
              )}
            >
              {isCompleted ? (
                <Check className="h-4 w-4" />
              ) : (
                label
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
