import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";
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
      {/* Correctness indicator */}
      <div
        className={`flex items-center gap-4 p-5 rounded-xl border ${
          isCorrect
            ? "bg-green-500/10 border-green-500/20 text-green-600 dark:text-green-400"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        }`}
      >
        {isCorrect ? (
          <CheckCircle2 className="h-8 w-8 shrink-0" />
        ) : (
          <XCircle className="h-8 w-8 shrink-0" />
        )}
        <div>
          <p className="text-lg font-bold">
            {isCorrect ? "Correct!" : "Incorrect"}
          </p>
          {!isCorrect && (
            <p className="text-sm opacity-80 mt-0.5">
              The correct answer is {correctAnswer}
            </p>
          )}
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
