import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MathRenderer } from "./MathRenderer";
import { Check, X } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { stagger, duration, easing } from "@/lib/motion";

interface Choice {
  id: string;
  text: string;
  isCorrect?: boolean;
}

interface ChoiceListProps {
  choices: Choice[];
  selectedChoice: string | null;
  correctAnswer: string;
  isSubmitted: boolean;
  onSelect: (key: string) => void;
}

export function ChoiceList({
  choices,
  selectedChoice,
  correctAnswer,
  isSubmitted,
  onSelect,
}: ChoiceListProps) {
  const prefersReducedMotion = useReducedMotion();

  const getChoiceState = (id: string) => {
    if (!isSubmitted) {
      return selectedChoice === id ? "selected" : "default";
    }
    if (id === correctAnswer) return "correct";
    if (id === selectedChoice && id !== correctAnswer) return "incorrect";
    return "disabled";
  };

  const stateStyles = {
    default: "border-border hover:border-primary/50 hover:bg-accent cursor-pointer",
    selected: "border-primary bg-primary/10 cursor-pointer",
    correct: "border-success bg-success/10",
    incorrect: "border-destructive bg-destructive/10",
    disabled: "border-border opacity-50",
  };

  return (
    <div className="space-y-3">
      {choices.map((choice, index) => {
        const state = getChoiceState(choice.id);
        const isCorrect = isSubmitted && choice.id === correctAnswer;
        const isIncorrect = isSubmitted && choice.id === selectedChoice && choice.id !== correctAnswer;

        const content = (
          <button
            key={choice.id}
            onClick={() => !isSubmitted && onSelect(choice.id)}
            disabled={isSubmitted}
            className={cn(
              "w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-colors",
              stateStyles[state]
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-medium text-sm",
                state === "selected" && "border-primary bg-primary text-primary-foreground",
                state === "correct" && "border-success bg-success text-success-foreground",
                state === "incorrect" && "border-destructive bg-destructive text-destructive-foreground",
                state === "default" && "border-muted-foreground/30",
                state === "disabled" && "border-muted-foreground/20"
              )}
            >
              {isCorrect ? (
                <Check className="h-4 w-4" />
              ) : isIncorrect ? (
                <X className="h-4 w-4" />
              ) : (
                choice.id.toUpperCase()
              )}
            </span>
            <span className="flex-1">
              <MathRenderer content={choice.text} />
            </span>
          </button>
        );

        if (prefersReducedMotion) {
          return <div key={choice.id}>{content}</div>;
        }

        return (
          <motion.div
            key={choice.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: index * stagger.normal,
              duration: duration.normal,
              ease: easing.easeOut,
            }}
          >
            {content}
          </motion.div>
        );
      })}
    </div>
  );
}
