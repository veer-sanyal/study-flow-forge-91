import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ParentContextCard } from "./ParentContextCard";
import { SubpartProgress } from "./SubpartProgress";
import { MathRenderer } from "./MathRenderer";
import { QuestionImage } from "./QuestionImage";
import { ChoiceList } from "./ChoiceList";
import { AnswerFeedback } from "./AnswerFeedback";
import { ConfidenceTaps } from "./ConfidenceTaps";
import { HintPanel } from "./HintPanel";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { StudyQuestion, StudySubpart, SubpartResult } from "@/types/study";
import { ChevronRight, SkipForward, Lightbulb } from "lucide-react";

interface MultiPartQuestionPlayerProps {
  question: StudyQuestion;
  questionNumber: number;
  totalQuestions?: number;
  onComplete: (results: SubpartResult[]) => void;
  onSimilar: () => void;
}

export function MultiPartQuestionPlayer({
  question,
  questionNumber,
  totalQuestions,
  onComplete,
  onSimilar,
}: MultiPartQuestionPlayerProps) {
  const prefersReducedMotion = useReducedMotion();
  const subparts = question.subparts || [];
  
  // State for current subpart
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [partResults, setPartResults] = useState<SubpartResult[]>([]);
  const [completedParts, setCompletedParts] = useState<boolean[]>(
    new Array(subparts.length).fill(false)
  );
  
  // State for current subpart interaction
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  
  const currentSubpart = subparts[currentPartIndex];
  const isLastPart = currentPartIndex === subparts.length - 1;
  const partLabel = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][currentPartIndex] || String(currentPartIndex + 1);
  
  // Determine if current subpart has choices (MCQ) or is free response
  const isMCQ = question.choices && question.choices.length > 0 && currentPartIndex === 0;
  
  // Check if answer is correct (simplified for now - can be enhanced with AI grading)
  const checkAnswer = useCallback(() => {
    if (isMCQ && selectedChoice) {
      const choice = question.choices?.find(c => c.id === selectedChoice);
      return choice?.isCorrect || false;
    }
    // For free response, we'll mark as correct if they provided an answer
    // Real grading would happen via AI
    return answerText.trim().length > 0;
  }, [isMCQ, selectedChoice, answerText, question.choices]);
  
  const handleSubmit = useCallback(() => {
    const isCorrect = checkAnswer();
    setIsSubmitted(true);
    
    // Record result for this subpart
    const result: SubpartResult = {
      subpartId: currentSubpart.id,
      isCorrect,
      confidence,
      hintsUsed: hintUsed,
      guideUsed: false,
      skipped: false,
      answerText: answerText || undefined,
      selectedChoiceId: selectedChoice,
      pointsEarned: isCorrect ? currentSubpart.points : 0,
      maxPoints: currentSubpart.points,
    };
    
    setPartResults(prev => [...prev, result]);
    setCompletedParts(prev => {
      const updated = [...prev];
      updated[currentPartIndex] = true;
      return updated;
    });
  }, [checkAnswer, currentSubpart, confidence, hintUsed, answerText, selectedChoice, currentPartIndex]);
  
  const handleSkip = useCallback(() => {
    const result: SubpartResult = {
      subpartId: currentSubpart.id,
      isCorrect: false,
      confidence: null,
      hintsUsed: hintUsed,
      guideUsed: false,
      skipped: true,
      maxPoints: currentSubpart.points,
    };
    
    setPartResults(prev => [...prev, result]);
    setCompletedParts(prev => {
      const updated = [...prev];
      updated[currentPartIndex] = true;
      return updated;
    });
    
    // Move to next part or complete
    if (isLastPart) {
      onComplete([...partResults, result]);
    } else {
      advanceToNextPart();
    }
  }, [currentSubpart, hintUsed, isLastPart, partResults, onComplete, currentPartIndex]);
  
  const handleNext = useCallback(() => {
    if (isLastPart) {
      onComplete(partResults);
    } else {
      advanceToNextPart();
    }
  }, [isLastPart, partResults, onComplete]);
  
  const advanceToNextPart = useCallback(() => {
    setCurrentPartIndex(prev => prev + 1);
    setSelectedChoice(null);
    setAnswerText("");
    setIsSubmitted(false);
    setConfidence(null);
    setHintUsed(false);
    setShowHint(false);
  }, []);
  
  const handleHintToggle = useCallback(() => {
    if (!hintUsed) setHintUsed(true);
    setShowHint(prev => !prev);
  }, [hintUsed]);
  
  // Animation variants
  const containerVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 },
        transition: { duration: 0.22, ease: "easeOut" },
      };
  
  const subpartVariants = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, x: 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -20 },
        transition: { duration: 0.2, ease: "easeOut" },
      };

  return (
    <motion.div
      className="space-y-5 max-w-3xl mx-auto"
      {...containerVariants}
    >
      {/* Meta info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {question.topicNames[0] || "Topic"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {question.questionType}
          </Badge>
          <Badge variant="outline" className="text-xs font-medium">
            Part {partLabel} of {subparts.length}
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground">
          {totalQuestions ? `Q${questionNumber} / ${totalQuestions}` : `#${questionNumber}`}
        </span>
      </div>
      
      {/* Subpart progress indicator */}
      <SubpartProgress
        totalParts={subparts.length}
        currentPartIndex={currentPartIndex}
        completedParts={completedParts}
      />
      
      {/* Parent context - always visible */}
      <ParentContextCard 
        prompt={question.prompt} 
        imageUrl={question.imageUrl}
      />
      
      {/* Current subpart */}
      <motion.div
        key={currentPartIndex}
        className="space-y-4"
        {...subpartVariants}
      >
        {/* Subpart prompt */}
        <div className="p-4 rounded-lg border-2 border-primary/20 bg-card shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
              {partLabel}
            </div>
            <div className="flex-1 space-y-3">
              <div className="text-base leading-relaxed">
                <MathRenderer content={currentSubpart.prompt} />
              </div>
              
              {/* Points indicator */}
              <div className="text-xs text-muted-foreground">
                {currentSubpart.points} point{currentSubpart.points !== 1 ? 's' : ''}
              </div>
              
              {/* Subpart image */}
              {currentSubpart.imageUrl && (
                <QuestionImage src={currentSubpart.imageUrl} alt={`Part ${partLabel} diagram`} />
              )}
            </div>
          </div>
        </div>
        
        {/* Hint panel */}
        {showHint && question.hint && (
          <HintPanel hint={question.hint} />
        )}
        
        {/* Answer input area */}
        {!isSubmitted ? (
          <div className="space-y-4">
            {/* For MCQ subparts - show choices */}
            {isMCQ && question.choices ? (
              <ChoiceList
                choices={question.choices}
                selectedChoice={selectedChoice}
                correctAnswer={question.correctChoiceId || ""}
                isSubmitted={false}
                onSelect={setSelectedChoice}
              />
            ) : (
              /* For free response - show text area */
              <Textarea
                placeholder="Type your answer here..."
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                className="min-h-[100px] text-base"
              />
            )}
            
            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleSubmit}
                disabled={isMCQ ? !selectedChoice : !answerText.trim()}
                className="flex-1"
              >
                Submit Part {partLabel.toUpperCase()}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              
              {question.hint && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleHintToggle}
                  className={hintUsed ? "text-amber-500" : ""}
                >
                  <Lightbulb className="h-4 w-4" />
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkip}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          /* After submission - show feedback */
          <div className="space-y-4">
            <AnswerFeedback
              isCorrect={partResults[currentPartIndex]?.isCorrect ?? false}
              correctAnswer={currentSubpart.correctAnswer || currentSubpart.modelAnswer || "See solution"}
              selectedAnswer={answerText || selectedChoice || ""}
              solutionRevealed={true}
              solution={currentSubpart.solutionSteps || question.solutionSteps}
            />
            
            {/* Confidence taps */}
            <ConfidenceTaps
              selectedConfidence={confidence}
              onSelect={setConfidence}
            />
            
            {/* Next button */}
            <Button
              onClick={handleNext}
              className="w-full"
            >
              {isLastPart ? "Complete Question" : `Next: Part ${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][currentPartIndex + 1] || currentPartIndex + 2}`}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
