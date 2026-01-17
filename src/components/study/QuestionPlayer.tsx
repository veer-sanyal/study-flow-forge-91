import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StudyQuestion } from "@/types/study";
import { QuestionPrompt } from "./QuestionPrompt";
import { ChoiceList } from "./ChoiceList";
import { PlayerControls } from "./PlayerControls";
import { AnswerFeedback } from "./AnswerFeedback";
import { ConfidenceTaps } from "./ConfidenceTaps";
import { HintPanel } from "./HintPanel";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";

interface QuestionPlayerProps {
  question: StudyQuestion;
  questionNumber: number;
  totalQuestions: number;
  onComplete: (result: {
    isCorrect: boolean;
    confidence: number | null;
    hintsUsed: boolean;
    guideUsed: boolean;
    skipped: boolean;
    selectedChoiceId: string | null;
  }) => void;
  onGuideMe: () => void;
  onSimilar: () => void;
}

export function QuestionPlayer({
  question,
  questionNumber,
  totalQuestions,
  onComplete,
  onGuideMe,
  onSimilar,
}: QuestionPlayerProps) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [guideUsed, setGuideUsed] = useState(false);
  
  const prefersReducedMotion = useReducedMotion();
  const isCorrect = selectedChoice === question.correctChoiceId;

  const handleSubmit = useCallback(() => {
    if (selectedChoice) {
      setIsSubmitted(true);
    }
  }, [selectedChoice]);

  const handleSkip = useCallback(() => {
    onComplete({
      isCorrect: false,
      confidence: null,
      hintsUsed: hintRevealed,
      guideUsed,
      skipped: true,
      selectedChoiceId: null,
    });
  }, [hintRevealed, guideUsed, onComplete]);

  const handleNext = useCallback(() => {
    onComplete({
      isCorrect,
      confidence,
      hintsUsed: hintRevealed,
      guideUsed,
      skipped: false,
      selectedChoiceId: selectedChoice,
    });
  }, [isCorrect, confidence, hintRevealed, guideUsed, selectedChoice, onComplete]);

  const handleGuideMe = useCallback(() => {
    setGuideUsed(true);
    onGuideMe();
  }, [onGuideMe]);

  const questionContent = (
    <div className="space-y-6">
      {/* Question prompt */}
      <QuestionPrompt
        prompt={question.prompt}
        topicName={question.topicNames[0] || 'General'}
        questionType={question.questionType}
        difficulty={question.difficulty}
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
      />

      {/* Hint panel */}
      <AnimatePresence>
        {hintRevealed && question.hint && <HintPanel hint={question.hint} />}
      </AnimatePresence>

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
        hintRevealed={hintRevealed}
        solutionRevealed={solutionRevealed}
        onSubmit={handleSubmit}
        onGuideMe={handleGuideMe}
        onHint={() => setHintRevealed(true)}
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
