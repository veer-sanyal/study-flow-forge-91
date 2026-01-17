import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";

interface ConfidenceTapsProps {
  selectedConfidence: number | null;
  onSelect: (level: number) => void;
}

const confidenceLevels = [
  { level: 1, label: "Guessed", emoji: "😅" },
  { level: 2, label: "Unsure", emoji: "🤔" },
  { level: 3, label: "Knew it", emoji: "😎" },
];

export function ConfidenceTaps({ selectedConfidence, onSelect }: ConfidenceTapsProps) {
  const prefersReducedMotion = useReducedMotion();

  const content = (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground text-center">
        How confident were you?
      </p>
      <div className="flex gap-2 justify-center">
        {confidenceLevels.map((item) => (
          <button
            key={item.level}
            onClick={() => onSelect(item.level)}
            className={cn(
              "flex flex-col items-center gap-1 px-4 py-3 rounded-lg border-2 transition-all",
              selectedConfidence === item.level
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-accent/50"
            )}
          >
            <span className="text-xl">{item.emoji}</span>
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  if (prefersReducedMotion) {
    return content;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
    >
      {content}
    </motion.div>
  );
}
