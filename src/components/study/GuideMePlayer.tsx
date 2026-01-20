import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle2, XCircle, Lightbulb, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MathRenderer } from "./MathRenderer";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";
import { GuideMe, GuideStep } from "@/types/guide";

interface GuideMePlayerProps {
  guide: GuideMe;
  originalPrompt: string;
  topicName: string;
  onComplete: () => void;
  onBackToQuestion: () => void;
}

export function GuideMePlayer({
  guide,
  originalPrompt,
  topicName,
  onComplete,
  onBackToQuestion,
}: GuideMePlayerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  
  const prefersReducedMotion = useReducedMotion();
  
  const steps = guide.steps || [];
  const currentStep = steps[currentStepIndex] as GuideStep | undefined;
  const totalSteps = steps.length;
  const isLastStep = currentStepIndex === totalSteps - 1;
  
  // Find correct choice for current step
  const correctChoice = useMemo(() => {
    if (!currentStep?.choices) return null;
    return currentStep.choices.find(c => c.isCorrect);
  }, [currentStep]);
  
  const isCorrect = selectedChoice === correctChoice?.id;
  
  // Get available hints for this step
  const availableHints = currentStep?.hints || [];
  const hintsCount = availableHints.length;
  const visibleHints = availableHints.slice(0, hintsRevealed);
  
  const handleSelect = useCallback((choiceId: string) => {
    if (!isSubmitted) {
      setSelectedChoice(choiceId);
    }
  }, [isSubmitted]);
  
  const handleSubmit = useCallback(() => {
    if (selectedChoice) {
      setIsSubmitted(true);
      if (isCorrect) {
        setCompletedSteps(prev => new Set([...prev, currentStepIndex]));
      }
    }
  }, [selectedChoice, isCorrect, currentStepIndex]);
  
  const handleNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex(prev => prev + 1);
      setSelectedChoice(null);
      setIsSubmitted(false);
      setHintsRevealed(0);
    }
  }, [isLastStep, onComplete]);
  
  const handleRevealHint = useCallback(() => {
    if (hintsRevealed < hintsCount) {
      setHintsRevealed(prev => prev + 1);
    }
  }, [hintsRevealed, hintsCount]);
  
  if (!currentStep) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No guide steps available.</p>
        <Button variant="outline" onClick={onBackToQuestion} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Question
        </Button>
      </div>
    );
  }
  
  // Progress bar
  const progress = ((currentStepIndex + (isSubmitted && isCorrect ? 1 : 0)) / totalSteps) * 100;
  
  const stepContent = (
    <div className="space-y-6">
      {/* Header with back button and step indicator */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onBackToQuestion}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Question
        </Button>
        
        <Badge variant="secondary" className="gap-1.5">
          <Sparkles className="h-3 w-3" />
          Guide Me · Step {currentStepIndex + 1}/{totalSteps}
        </Badge>
      </div>
      
      {/* Progress bar */}
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      
      {/* Step title and micro goal */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            {currentStepIndex + 1}
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {currentStep.stepTitle || `Step ${currentStepIndex + 1}`}
          </h2>
        </div>
        
        {currentStep.microGoal && (
          <p className="text-sm text-muted-foreground pl-9">
            {currentStep.microGoal}
          </p>
        )}
      </div>
      
      {/* Topic badge */}
      <div className="flex items-center gap-2 pl-9">
        <Badge variant="outline" className="text-xs">
          {topicName}
        </Badge>
      </div>
      
      {/* Prompt / Socratic question */}
      <Card className="p-5 bg-card border-2 border-primary/20 shadow-sm">
        <div className="text-base leading-relaxed font-medium">
          <MathRenderer content={currentStep.prompt || ''} />
        </div>
      </Card>
      
      {/* Separator between question and choices */}
      <div className="h-px bg-border" />
      
      {/* Choices */}
      {currentStep.choices && currentStep.choices.length > 0 && (
        <div className="space-y-2">
          {currentStep.choices.map((choice) => {
            const isSelected = selectedChoice === choice.id;
            const isThisCorrect = choice.isCorrect;
            const showResult = isSubmitted;
            
            let borderClass = "border-border hover:border-primary/50";
            let bgClass = "bg-card";
            
            if (showResult) {
              if (isThisCorrect) {
                borderClass = "border-success";
                bgClass = "bg-success/10";
              } else if (isSelected && !isThisCorrect) {
                borderClass = "border-destructive";
                bgClass = "bg-destructive/10";
              }
            } else if (isSelected) {
              borderClass = "border-primary";
              bgClass = "bg-primary/5";
            }
            
            return (
              <button
                key={choice.id}
                onClick={() => handleSelect(choice.id)}
                disabled={isSubmitted}
                className={`w-full p-4 rounded-lg border-2 text-left transition-all ${borderClass} ${bgClass} ${
                  isSubmitted ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium ${
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                  }`}>
                    {choice.id.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <MathRenderer content={choice.text} />
                  </div>
                  {showResult && isThisCorrect && (
                    <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
                  )}
                  {showResult && isSelected && !isThisCorrect && (
                    <XCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
      
      {/* Hints section */}
      <AnimatePresence>
        {visibleHints.length > 0 && (
          <motion.div
            initial={prefersReducedMotion ? {} : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {visibleHints.map((hint, index) => (
              <Card key={index} className="p-3 bg-primary/5 border-primary/20">
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <span className="font-medium text-primary">Hint {index + 1}: </span>
                    <MathRenderer content={hint.text} />
                  </div>
                </div>
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Feedback after submission */}
      <AnimatePresence>
        {isSubmitted && (
          <motion.div
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* Correct/incorrect feedback */}
            <Card className={`p-4 ${isCorrect ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                {isCorrect ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span className="font-semibold text-success">Correct!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <span className="font-semibold text-destructive">Not quite</span>
                  </>
                )}
              </div>
              
              {/* Show explanation */}
              {currentStep.explanation && (
                <div className="text-sm text-muted-foreground">
                  <MathRenderer content={currentStep.explanation} />
                </div>
              )}
            </Card>
            
            {/* Key takeaway - improved readability */}
            {currentStep.keyTakeaway && (
              <Card className="p-4 bg-accent/20 border-accent">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💡</span>
                    <span className="font-semibold text-accent-foreground text-sm uppercase tracking-wide">Key Takeaway</span>
                  </div>
                  <div className="text-base leading-relaxed text-foreground pl-7">
                    <MathRenderer content={currentStep.keyTakeaway} />
                  </div>
                </div>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Actions */}
      <div className="flex flex-col gap-3 pt-2">
        {/* Hint button - only show if not submitted and hints available */}
        {!isSubmitted && hintsCount > 0 && hintsRevealed < hintsCount && (
          <Button
            variant="outline"
            onClick={handleRevealHint}
            className="w-full gap-2"
          >
            <Lightbulb className="h-4 w-4" />
            Need a hint? ({hintsCount - hintsRevealed} left)
          </Button>
        )}
        
        {/* Submit / Next button */}
        {!isSubmitted ? (
          <Button 
            size="lg" 
            className="w-full gap-2" 
            onClick={handleSubmit}
            disabled={!selectedChoice}
          >
            Check Answer
          </Button>
        ) : (
          <Button size="lg" className="w-full gap-2" onClick={handleNext}>
            {isLastStep ? 'Finish Guide' : 'Next Step'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
  
  if (prefersReducedMotion) {
    return <div key={currentStepIndex}>{stepContent}</div>;
  }
  
  return (
    <motion.div
      key={currentStepIndex}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
    >
      {stepContent}
    </motion.div>
  );
}
