import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MathRenderer } from "./MathRenderer";
import { 
  Compass, 
  Lightbulb, 
  ChevronRight, 
  Check, 
  X,
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";
import { GuideStep, GuideHint } from "@/types/guide";

interface GuideMeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: GuideStep[];
  onComplete: () => void;
}

export function GuideMeDrawer({ 
  open, 
  onOpenChange, 
  steps,
  onComplete 
}: GuideMeDrawerProps) {
  const prefersReducedMotion = useReducedMotion();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState<number>(0);
  const [stepsCompleted, setStepsCompleted] = useState<Set<string>>(new Set());

  const currentStep = steps[currentStepIndex];
  const progress = steps.length > 0 ? ((currentStepIndex + (isSubmitted ? 1 : 0)) / steps.length) * 100 : 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const resetStep = useCallback(() => {
    setSelectedChoice(null);
    setIsSubmitted(false);
    setHintsRevealed(0);
  }, []);

  const handleSelect = useCallback((choiceId: string) => {
    if (!isSubmitted) {
      setSelectedChoice(choiceId);
    }
  }, [isSubmitted]);

  const handleSubmit = useCallback(() => {
    if (selectedChoice) {
      setIsSubmitted(true);
      setStepsCompleted(prev => new Set(prev).add(currentStep.id));
    }
  }, [selectedChoice, currentStep]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
      onOpenChange(false);
      // Reset state for next time
      setCurrentStepIndex(0);
      resetStep();
      setStepsCompleted(new Set());
    } else {
      setCurrentStepIndex(prev => prev + 1);
      resetStep();
    }
  }, [isLastStep, onComplete, onOpenChange, resetStep]);

  const handleRevealHint = useCallback(() => {
    if (hintsRevealed < 3) {
      setHintsRevealed(prev => prev + 1);
    }
  }, [hintsRevealed]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset state
    setCurrentStepIndex(0);
    resetStep();
    setStepsCompleted(new Set());
  }, [onOpenChange, resetStep]);

  if (steps.length === 0) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary" />
              Guide Me
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-6 text-center text-muted-foreground">
            <p>No guided walkthrough available for this question.</p>
            <Button variant="outline" className="mt-4" onClick={handleClose}>
              Close
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const isCorrect = selectedChoice === currentStep.choices.find(c => c.isCorrect)?.id;
  const visibleHints = currentStep.hints.slice(0, hintsRevealed);

  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary" />
              Guide Me
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
          </DrawerTitle>
          <Progress value={progress} className="h-1.5 mt-2" />
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Step prompt */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep.id}
              initial={prefersReducedMotion ? {} : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
              transition={{ duration: duration.normal / 1000, ease: easing.easeOut }}
              className="space-y-4"
            >
              <div className="p-4 rounded-lg bg-muted/50">
                <MathRenderer content={currentStep.prompt} className="text-sm" />
              </div>

              {/* Choices */}
              <div className="space-y-2">
                {currentStep.choices.map((choice) => {
                  const isSelected = selectedChoice === choice.id;
                  const showCorrect = isSubmitted && choice.isCorrect;
                  const showIncorrect = isSubmitted && isSelected && !choice.isCorrect;

                  return (
                    <button
                      key={choice.id}
                      onClick={() => handleSelect(choice.id)}
                      disabled={isSubmitted}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-colors text-sm",
                        !isSubmitted && isSelected && "border-primary bg-primary/10",
                        !isSubmitted && !isSelected && "border-border hover:border-primary/50 hover:bg-accent/50",
                        showCorrect && "border-green-500 bg-green-500/10",
                        showIncorrect && "border-destructive bg-destructive/10",
                        isSubmitted && !showCorrect && !showIncorrect && "border-border opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium",
                          !isSubmitted && isSelected && "border-primary bg-primary text-primary-foreground",
                          !isSubmitted && !isSelected && "border-muted-foreground/30",
                          showCorrect && "border-green-500 bg-green-500 text-white",
                          showIncorrect && "border-destructive bg-destructive text-destructive-foreground"
                        )}
                      >
                        {showCorrect ? (
                          <Check className="h-3 w-3" />
                        ) : showIncorrect ? (
                          <X className="h-3 w-3" />
                        ) : (
                          choice.id.toUpperCase()
                        )}
                      </span>
                      <span className="flex-1">
                        <MathRenderer content={choice.text} />
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Hints section */}
              {!isSubmitted && (
                <div className="space-y-2">
                  {visibleHints.map((hint, index) => (
                    <motion.div
                      key={hint.tier}
                      initial={prefersReducedMotion ? {} : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
                    >
                      <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-700 dark:text-amber-300">
                        <span className="font-medium">Hint {hint.tier}: </span>
                        <MathRenderer content={hint.text} />
                      </div>
                    </motion.div>
                  ))}
                  
                  {hintsRevealed < 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground text-xs"
                      onClick={handleRevealHint}
                    >
                      <HelpCircle className="h-3 w-3 mr-1" />
                      {hintsRevealed === 0 ? "Need a hint?" : "Another hint?"}
                      <span className="ml-1 text-muted-foreground/60">
                        ({3 - hintsRevealed} left)
                      </span>
                    </Button>
                  )}
                </div>
              )}

              {/* Explanation after submission */}
              {isSubmitted && (
                <motion.div
                  initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-4 rounded-lg border",
                    isCorrect 
                      ? "bg-green-500/10 border-green-500/20" 
                      : "bg-amber-500/10 border-amber-500/20"
                  )}
                >
                  <p className={cn(
                    "text-sm font-medium mb-2",
                    isCorrect ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"
                  )}>
                    {isCorrect ? "Correct!" : "Not quite, but that's okay!"}
                  </p>
                  <div className="text-sm text-muted-foreground">
                    <MathRenderer content={currentStep.explanation} />
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            {!isSubmitted ? (
              <Button 
                className="flex-1" 
                onClick={handleSubmit}
                disabled={!selectedChoice}
              >
                Check Answer
              </Button>
            ) : (
              <Button 
                className="flex-1 gap-2" 
                onClick={handleNext}
              >
                {isLastStep ? "Finish" : "Next Step"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
