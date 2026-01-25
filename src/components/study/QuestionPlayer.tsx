import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StudyQuestion } from "@/types/study";
import { QuestionPrompt } from "./QuestionPrompt";
import { ChoiceList } from "./ChoiceList";
import { PlayerControls } from "./PlayerControls";
import { AnswerFeedback } from "./AnswerFeedback";
import { ConfidenceTaps } from "./ConfidenceTaps";
import { GuideMePlayer } from "./GuideMePlayer";
import { QuestionCategoryBadge } from "./QuestionCategoryBadge";
import { WhySelectedChip } from "./WhySelectedChip";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";
import { generateGuideStepsFromSolution, GuideMe } from "@/types/guide";

interface QuestionPlayerProps {
  question: StudyQuestion;
  questionNumber: number;
  totalQuestions?: number; // Optional for infinite mode
  onComplete: (result: {
    isCorrect: boolean;
    confidence: number | null;
    hintsUsed: boolean;
    guideUsed: boolean;
    skipped: boolean;
    selectedChoiceId: string | null;
  }) => void;
  onSimilar: () => void;
}

export function QuestionPlayer({
  question,
  questionNumber,
  totalQuestions,
  onComplete,
  onSimilar,
}: QuestionPlayerProps) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [guideUsed, setGuideUsed] = useState(false);
  const [guideMode, setGuideMode] = useState(false);
  
  const prefersReducedMotion = useReducedMotion();
  const isCorrect = selectedChoice === question.correctChoiceId;

  // Use AI-generated guide steps if available, otherwise fallback to generated from solution
  const guideSteps = useMemo((): GuideMe | null => {
    // Check if question has AI-generated guide_me_steps
    if (question.guideMeSteps && 
        typeof question.guideMeSteps === 'object' && 
        'steps' in question.guideMeSteps &&
        Array.isArray(question.guideMeSteps.steps) && 
        question.guideMeSteps.steps.length > 0) {
      return question.guideMeSteps;
    }
    
    // Fallback to generated steps from solution
    const fallbackSteps = generateGuideStepsFromSolution(question.solutionSteps, question.prompt);
    if (fallbackSteps.length > 0) {
      return { steps: fallbackSteps, methodSummary: { bullets: [] } };
    }
    
    return null;
  }, [question.guideMeSteps, question.solutionSteps, question.prompt]);

  const handleSubmit = useCallback(() => {
    if (selectedChoice) {
      setIsSubmitted(true);
    }
  }, [selectedChoice]);

  const handleSkip = useCallback(() => {
    onComplete({
      isCorrect: false,
      confidence: null,
      hintsUsed: false,
      guideUsed,
      skipped: true,
      selectedChoiceId: null,
    });
  }, [guideUsed, onComplete]);

  const handleNext = useCallback(() => {
    onComplete({
      isCorrect,
      confidence,
      hintsUsed: false,
      guideUsed,
      skipped: false,
      selectedChoiceId: selectedChoice,
    });
  }, [isCorrect, confidence, guideUsed, selectedChoice, onComplete]);

  const handleGuideMe = useCallback(() => {
    setGuideUsed(true);
    setGuideMode(true);
  }, []);

  const handleGuideComplete = useCallback(() => {
    setGuideMode(false);
  }, []);

  const handleBackToQuestion = useCallback(() => {
    setGuideMode(false);
  }, []);

  // Render Guide Me mode
  if (guideMode && guideSteps) {
    const guideContent = (
      <GuideMePlayer
        guide={guideSteps}
        originalPrompt={question.prompt}
        topicName={question.topicNames[0] || 'General'}
        onComplete={handleGuideComplete}
        onBackToQuestion={handleBackToQuestion}
      />
    );

    if (prefersReducedMotion) {
      return <div key={`guide-${question.id}`}>{guideContent}</div>;
    }

    return (
      <motion.div
        key={`guide-${question.id}`}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: duration.normal, ease: easing.easeOut }}
      >
        {guideContent}
      </motion.div>
    );
  }

  const questionContent = (
    <div className="space-y-6">
      {/* Category badge and why selected */}
      {(question.category || question.whySelected) && (
        <div className="flex items-center gap-2 flex-wrap">
          {question.category && (
            <QuestionCategoryBadge category={question.category} />
          )}
          {question.whySelected && (
            <WhySelectedChip reason={question.whySelected} />
          )}
        </div>
      )}

      {/* Question prompt */}
      <QuestionPrompt
        prompt={question.prompt}
        topicName={question.topicNames[0] || 'General'}
        questionType={question.questionType}
        difficulty={question.difficulty}
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        imageUrl={question.imageUrl}
      />


      {/* Choices */}
      {question.choices && (
        <ChoiceList
          choices={question.choices}
          selectedChoice={selectedChoice}
          correctAnswer={question.correctChoiceId || ''}
          isSubmitted={isSubmitted}
          onSelect={setSelectedChoice}
        />
      )}

      {/* Feedback after submission */}
      <AnimatePresence>
        {isSubmitted && selectedChoice && (
          <AnswerFeedback
            isCorrect={isCorrect}
            correctAnswer={question.correctChoiceId || ''}
            selectedAnswer={selectedChoice}
            solutionRevealed={solutionRevealed}
            solution={question.solutionSteps}
          />
        )}
      </AnimatePresence>

      {/* Confidence taps */}
      <AnimatePresence>
        {isSubmitted && <ConfidenceTaps selectedConfidence={confidence} onSelect={setConfidence} />}
      </AnimatePresence>

      {/* Controls */}
      <PlayerControls
        isSubmitted={isSubmitted}
        hasSelection={selectedChoice !== null}
        solutionRevealed={solutionRevealed}
        hasGuide={guideSteps !== null}
        onSubmit={handleSubmit}
        onGuideMe={handleGuideMe}
        onExplain={() => setSolutionRevealed(true)}
        onSimilar={onSimilar}
        onSkip={handleSkip}
      />

      {/* Next button after submission */}
      {isSubmitted && (
        <Button size="lg" className="w-full gap-2" onClick={handleNext}>
          Next Question
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  if (prefersReducedMotion) {
    return <div key={question.id}>{questionContent}</div>;
  }

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
    >
      {questionContent}
    </motion.div>
  );
}
