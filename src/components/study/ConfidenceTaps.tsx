import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";

interface ConfidenceTapsProps {
  selectedConfidence: number | null;
  onSelect: (level: number) => void;
}

const confidenceLevels = [
  { level: 1, label: "Lucky guess" },
  { level: 2, label: "Unsure" },
  { level: 3, label: "Knew it" },
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
              "px-3 py-1.5 rounded-full border text-meta transition-all",
              selectedConfidence === item.level
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            )}
          >
            {item.label}
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
