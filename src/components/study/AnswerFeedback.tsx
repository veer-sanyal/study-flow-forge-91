import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { MathRenderer } from "./MathRenderer";

interface AnswerFeedbackProps {
  isCorrect: boolean;
  correctAnswer: string;
  selectedAnswer: string;
  solutionRevealed: boolean;
  solution: string[] | null;
}

export function AnswerFeedback({
  isCorrect,
  correctAnswer,
  selectedAnswer,
  solutionRevealed,
  solution,
}: AnswerFeedbackProps) {
  const prefersReducedMotion = useReducedMotion();

  const content = (
    <div className="space-y-4">
      {/* Correctness indicator — compact left-border strip */}
      <div
        className={cn(
          "pl-4 py-3 border-l-4 rounded-r-lg",
          isCorrect
            ? "border-success bg-success/5 text-success"
            : "border-destructive bg-destructive/5 text-destructive"
        )}
      >
        <div className="flex items-center gap-2">
          {isCorrect ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <span className="text-body font-semibold">
            {isCorrect ? "Correct" : "Not quite"}
          </span>
        </div>
      </div>

      {/* Solution steps */}
      {solutionRevealed && solution && solution.length > 0 && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <h4 className="font-semibold mb-3">Solution</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            {solution.map((step, index) => (
              <li key={index}>
                <MathRenderer content={step} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );

  if (prefersReducedMotion) {
    return content;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
    >
      {content}
    </motion.div>
  );
}
