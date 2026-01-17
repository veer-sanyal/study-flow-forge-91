import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { QuestionPlayer } from "@/components/study/QuestionPlayer";
import { Play, Calendar, Trophy, ArrowRight } from "lucide-react";
import { mockQuestions } from "@/data/mockQuestions";

type StudyState = "home" | "playing" | "complete";

export default function Study() {
  const [studyState, setStudyState] = useState<StudyState>("home");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{
    correct: number;
    total: number;
  }>({ correct: 0, total: 0 });

  // Mock data
  const todayRemaining = mockQuestions.length;
  const nextExamName = "MT1";
  const daysUntilExam = 5;

  const handleStart = useCallback(() => {
    setStudyState("playing");
    setCurrentIndex(0);
    setResults({ correct: 0, total: 0 });
  }, []);

  const handleQuestionComplete = useCallback(
    (result: { isCorrect: boolean; confidence: number | null; hintsUsed: boolean; skipped: boolean }) => {
      setResults((prev) => ({
        correct: prev.correct + (result.isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));

      if (currentIndex < mockQuestions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setStudyState("complete");
      }
    },
    [currentIndex]
  );

  const handleGuideMe = useCallback(() => {
    // Will be implemented in Step 1.3
    console.log("Guide Me clicked");
  }, []);

  const handleSimilar = useCallback(() => {
    // Will be implemented in Step 3.4
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

  // Question Player state
  if (studyState === "playing") {
    const currentQuestion = mockQuestions[currentIndex];
    return (
      <PageTransition className="space-y-6">
        <AnimatePresence mode="wait">
          <QuestionPlayer
            key={currentQuestion.id}
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={mockQuestions.length}
            onComplete={handleQuestionComplete}
            onGuideMe={handleGuideMe}
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
