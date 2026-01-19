import { useState, useCallback, useMemo } from "react";
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
  HelpCircle,
  BookOpen,
  Target,
  Sparkles,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";
import { GuideStep, GuideMe, MethodSummary, MiniVariant } from "@/types/guide";

interface GuideMeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: GuideStep[] | GuideMe;
  onComplete: () => void;
}

// Helper to normalize old and new data formats
function normalizeGuideData(data: GuideStep[] | GuideMe): {
  steps: GuideStep[];
  methodSummary?: MethodSummary;
  miniVariant?: MiniVariant;
} {
  if (Array.isArray(data)) {
    return { steps: data };
  }
  return {
    steps: data.steps || [],
    methodSummary: data.methodSummary,
    miniVariant: data.miniVariant,
  };
}

export function GuideMeDrawer({ 
  open, 
  onOpenChange, 
  steps: rawSteps,
  onComplete 
}: GuideMeDrawerProps) {
  const prefersReducedMotion = useReducedMotion();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState<number>(0);
  const [stepsCompleted, setStepsCompleted] = useState<Set<number>>(new Set());
  const [showSummary, setShowSummary] = useState(false);
  const [showMiniVariant, setShowMiniVariant] = useState(false);
  const [miniVariantRevealed, setMiniVariantRevealed] = useState(false);

  const { steps, methodSummary, miniVariant } = useMemo(() => normalizeGuideData(rawSteps), [rawSteps]);
  
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
      setStepsCompleted(prev => new Set(prev).add(currentStepIndex));
    }
  }, [selectedChoice, currentStepIndex]);

  const handleNext = useCallback(() => {
    if (isLastStep) {
      // Show summary instead of immediately closing
      if (methodSummary?.bullets?.length) {
        setShowSummary(true);
      } else {
        onComplete();
        onOpenChange(false);
        setCurrentStepIndex(0);
        resetStep();
        setStepsCompleted(new Set());
        setShowSummary(false);
        setShowMiniVariant(false);
        setMiniVariantRevealed(false);
      }
    } else {
      setCurrentStepIndex(prev => prev + 1);
      resetStep();
    }
  }, [isLastStep, methodSummary, onComplete, onOpenChange, resetStep]);

  const handleFinish = useCallback(() => {
    onComplete();
    onOpenChange(false);
    setCurrentStepIndex(0);
    resetStep();
    setStepsCompleted(new Set());
    setShowSummary(false);
    setShowMiniVariant(false);
    setMiniVariantRevealed(false);
  }, [onComplete, onOpenChange, resetStep]);

  const handleRevealHint = useCallback(() => {
    if (hintsRevealed < 3) {
      setHintsRevealed(prev => prev + 1);
    }
  }, [hintsRevealed]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setCurrentStepIndex(0);
    resetStep();
    setStepsCompleted(new Set());
    setShowSummary(false);
    setShowMiniVariant(false);
    setMiniVariantRevealed(false);
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

  // Summary view
  if (showSummary) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Method Summary
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-4 overflow-y-auto">
            {/* Method bullets */}
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Key Steps for Similar Problems
              </h3>
              <ol className="space-y-2 pl-4">
                {methodSummary?.bullets?.map((bullet, index) => (
                  <li key={index} className="text-sm flex gap-2">
                    <span className="font-semibold text-primary shrink-0">{index + 1}.</span>
                    <MathRenderer content={bullet} />
                  </li>
                ))}
              </ol>
            </div>

            {/* Pro tip */}
            {methodSummary?.proTip && (
              <motion.div
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20"
              >
                <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-300 mb-2">
                  <Sparkles className="h-4 w-4" />
                  Pro Tip
                </h3>
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  <MathRenderer content={methodSummary.proTip} />
                </div>
              </motion.div>
            )}

            {/* Mini variant section */}
            {miniVariant && !showMiniVariant && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowMiniVariant(true)}
              >
                <RefreshCw className="h-4 w-4" />
                Try a Practice Variant
              </Button>
            )}

            {showMiniVariant && miniVariant && (
              <motion.div
                initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-lg bg-muted/50 space-y-3"
              >
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  Practice Variant
                </h3>
                <div className="text-sm">
                  <MathRenderer content={miniVariant.prompt} />
                </div>
                
                {!miniVariantRevealed ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setMiniVariantRevealed(true)}
                  >
                    Show Answer
                  </Button>
                ) : (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                      Answer:
                    </p>
                    <div className="text-sm">
                      <MathRenderer content={miniVariant.answer} />
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Finish button */}
            <Button className="w-full gap-2" onClick={handleFinish}>
              Finish Guide
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  const correctChoice = currentStep.choices.find(c => c.isCorrect);
  const isCorrect = selectedChoice === correctChoice?.id;
  const visibleHints = currentStep.hints?.slice(0, hintsRevealed) || [];
  const selectedFeedback = currentStep.choiceFeedback?.find(
    f => f.choiceId === selectedChoice
  );

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
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepIndex}
              initial={prefersReducedMotion ? {} : { opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
              transition={{ duration: duration.normal / 1000, ease: easing.easeOut }}
              className="space-y-4"
            >
              {/* Step header with title and micro goal */}
              <div className="space-y-2">
                {currentStep.stepTitle && (
                  <div className="flex items-center gap-2">
                    {currentStep.isMisconceptionCheck && (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="text-xs font-medium text-primary uppercase tracking-wide">
                      {currentStep.stepTitle}
                    </span>
                  </div>
                )}
                {currentStep.microGoal && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Goal:</span> {currentStep.microGoal}
                  </p>
                )}
              </div>

              {/* Step prompt */}
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

              {/* Hints section - only before submission */}
              {!isSubmitted && (
                <div className="space-y-2">
                  {visibleHints.map((hint) => (
                    <motion.div
                      key={hint.tier}
                      initial={prefersReducedMotion ? {} : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
                    >
                      <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-700 dark:text-amber-300">
                        <span className="font-medium">
                          {hint.tier === 1 ? "Recall: " : hint.tier === 2 ? "Setup: " : "Step: "}
                        </span>
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

              {/* Feedback after submission */}
              {isSubmitted && (
                <motion.div
                  initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Choice-specific feedback */}
                  {selectedFeedback && (
                    <div className={cn(
                      "p-3 rounded-lg border",
                      isCorrect 
                        ? "bg-green-500/10 border-green-500/20" 
                        : "bg-amber-500/10 border-amber-500/20"
                    )}>
                      <p className={cn(
                        "text-sm font-medium mb-1",
                        isCorrect ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"
                      )}>
                        {isCorrect ? "Correct!" : "Not quite..."}
                      </p>
                      <div className="text-sm text-muted-foreground">
                        <MathRenderer content={selectedFeedback.feedback} />
                      </div>
                    </div>
                  )}

                  {/* Full explanation */}
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Explanation:</p>
                    <div className="text-sm">
                      <MathRenderer content={currentStep.explanation} />
                    </div>
                  </div>

                  {/* Key takeaway */}
                  {currentStep.keyTakeaway && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-xs font-medium text-primary mb-1 flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        Key Takeaway
                      </p>
                      <div className="text-sm">
                        <MathRenderer content={currentStep.keyTakeaway} />
                      </div>
                    </div>
                  )}
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
                {isLastStep ? (methodSummary?.bullets?.length ? "View Summary" : "Finish") : "Next Step"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
