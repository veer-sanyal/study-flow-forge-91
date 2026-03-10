import { motion } from "framer-motion";
import { CheckCircle2, XCircle, BookOpen } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { MathRenderer } from "./MathRenderer";
import type { DistractorRationale } from "@/types/study";

interface AnswerFeedbackProps {
  isCorrect: boolean;
  correctAnswer: string;
  selectedAnswer: string;
  solutionRevealed: boolean;
  solution: string[] | null;
  distractorRationales?: DistractorRationale[] | null;
  fullSolution?: string | null;
  sourcePages?: number[] | null;
}

export function AnswerFeedback({
  isCorrect,
  correctAnswer,
  selectedAnswer,
  solutionRevealed,
  solution,
  distractorRationales,
  fullSolution,
  sourcePages,
}: AnswerFeedbackProps) {
  const prefersReducedMotion = useReducedMotion();

  // Find rationale for the selected wrong answer
  const selectedRationale = !isCorrect && distractorRationales
    ? distractorRationales.find(r => r.id === selectedAnswer)
    : null;

  // Check if we have parsed structured feedback
  const hasParsedFeedback = selectedRationale && (selectedRationale.diagnosis || selectedRationale.fix);

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

      {/* Enhanced misconception feedback for wrong answers */}
      {selectedRationale && (
        <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2">
          {hasParsedFeedback ? (
            <>
              {/* Structured feedback: Diagnosis → Fix → Check */}
              {selectedRationale.diagnosis && (
                <div>
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wide">Diagnosis</span>
                  <p className="text-sm mt-0.5">
                    <MathRenderer content={selectedRationale.diagnosis} />
                  </p>
                </div>
              )}
              {selectedRationale.fix && (
                <div>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">How to fix</span>
                  <p className="text-sm mt-0.5">
                    <MathRenderer content={selectedRationale.fix} />
                  </p>
                </div>
              )}
              {selectedRationale.check && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Self-check</span>
                  <p className="text-sm mt-0.5 italic text-muted-foreground">
                    <MathRenderer content={selectedRationale.check} />
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Fallback: raw misconception string for old questions or unparseable */
            <p className="text-sm">
              <span className="font-medium text-destructive">Why {selectedAnswer} is incorrect: </span>
              <MathRenderer content={selectedRationale.misconception} />
            </p>
          )}
        </div>
      )}

      {/* Full solution explanation */}
      {fullSolution && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <h4 className="font-semibold mb-2">Explanation</h4>
          <div className="text-sm text-muted-foreground">
            <MathRenderer content={fullSolution} />
          </div>
        </div>
      )}

      {/* Solution steps (legacy) */}
      {solutionRevealed && solution && solution.length > 0 && !fullSolution && (
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

      {/* Source page reference */}
      {sourcePages && sourcePages.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          <span>Review: page{sourcePages.length > 1 ? "s" : ""} {sourcePages.join(", ")} of the material</span>
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
