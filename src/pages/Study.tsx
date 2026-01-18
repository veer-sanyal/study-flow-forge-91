import { useState, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { QuestionPlayer } from "@/components/study/QuestionPlayer";
import { Play, Calendar, Trophy, ArrowRight, Loader2 } from "lucide-react";
import { useStudyQuestions, useSubmitAttempt } from "@/hooks/use-study";
import { useAuth } from "@/hooks/use-auth";
import { StudyQuestion } from "@/types/study";

type StudyState = "home" | "playing" | "complete";

export default function Study() {
  const [studyState, setStudyState] = useState<StudyState>("home");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{
    correct: number;
    total: number;
  }>({ correct: 0, total: 0 });
  const questionStartTime = useRef<number>(Date.now());

  const { user } = useAuth();
  const { data: questions, isLoading, error } = useStudyQuestions();
  const submitAttempt = useSubmitAttempt();

  // Derived data
  const todayRemaining = questions?.length || 0;
  const nextExamName = "MT1";
  const daysUntilExam = 5;

  const handleStart = useCallback(() => {
    setStudyState("playing");
    setCurrentIndex(0);
    setResults({ correct: 0, total: 0 });
    questionStartTime.current = Date.now();
  }, []);

  const handleQuestionComplete = useCallback(
    async (result: { 
      isCorrect: boolean; 
      confidence: number | null; 
      hintsUsed: boolean; 
      guideUsed: boolean;
      skipped: boolean;
      selectedChoiceId: string | null;
    }) => {
      if (!questions) return;
      
      const currentQuestion = questions[currentIndex];
      const timeSpentMs = Date.now() - questionStartTime.current;

      // Submit attempt to database (trigger will update SRS + mastery)
      if (!result.skipped) {
        submitAttempt.mutate({
          questionId: currentQuestion.id,
          selectedChoiceId: result.selectedChoiceId,
          isCorrect: result.isCorrect,
          confidence: result.confidence,
          hintUsed: result.hintsUsed,
          guideUsed: result.guideUsed,
          timeSpentMs,
        });
      }

      setResults((prev) => ({
        correct: prev.correct + (result.isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));

      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        setStudyState("complete");
      }
    },
    [currentIndex, questions, submitAttempt]
  );

  const handleSimilar = useCallback(() => {
    // Will be implemented later
    console.log("Similar clicked");
  }, []);

  // Study Home state
  if (studyState === "home") {
    return (
      <PageTransition className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Study</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Today: {todayRemaining} left • Next exam: {nextExamName} in {daysUntilExam} days
          </p>
        </div>

        <div className="flex flex-col items-center justify-center py-12 space-y-6">
          <div className="rounded-full bg-primary/10 p-6">
            <Play className="h-12 w-12 text-primary" />
          </div>

          <Button size="lg" className="gap-2 text-lg px-8 py-6" onClick={handleStart}>
            <Play className="h-5 w-5" />
            Start Today's Plan
          </Button>

          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Change focus
          </Button>
        </div>
      </PageTransition>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <PageTransition className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </PageTransition>
    );
  }

  // Error state
  if (error) {
    return (
      <PageTransition className="space-y-4 text-center py-12">
        <p className="text-destructive">Failed to load questions</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </PageTransition>
    );
  }

  // No questions available
  if (!questions || questions.length === 0) {
    return (
      <PageTransition className="space-y-4 text-center py-12">
        <p className="text-muted-foreground">No questions available yet</p>
        <p className="text-sm text-muted-foreground">Check back after your instructor uploads content</p>
      </PageTransition>
    );
  }

  // Question Player state
  if (studyState === "playing") {
    const currentQuestion = questions[currentIndex];
    return (
      <PageTransition className="space-y-6">
        <AnimatePresence mode="wait">
          <QuestionPlayer
            key={currentQuestion.id}
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={questions.length}
            onComplete={handleQuestionComplete}
            onSimilar={handleSimilar}
          />
        </AnimatePresence>
      </PageTransition>
    );
  }

  // Daily Complete state
  return (
    <PageTransition className="space-y-8">
      <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
        <div className="rounded-full bg-green-500/10 p-6">
          <Trophy className="h-12 w-12 text-green-500" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Daily Plan Complete! 🎉</h1>
          <p className="text-muted-foreground">
            You got {results.correct} out of {results.total} correct
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button size="lg" className="gap-2" onClick={handleStart}>
            <ArrowRight className="h-5 w-5" />
            Keep Practicing
          </Button>
          <Button variant="outline" onClick={() => setStudyState("home")}>
            Back to Home
          </Button>
        </div>
      </div>
    </PageTransition>
  );
}
