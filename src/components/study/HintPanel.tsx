import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";

interface HintPanelProps {
  hint: string;
}

export function HintPanel({ hint }: HintPanelProps) {
  const prefersReducedMotion = useReducedMotion();

  const content = (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <Lightbulb className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-700 dark:text-amber-300">{hint}</p>
    </div>
  );

  if (prefersReducedMotion) {
    return content;
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
    >
      {content}
    </motion.div>
  );
}
