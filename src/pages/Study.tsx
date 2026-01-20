import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { QuestionPlayer } from "@/components/study/QuestionPlayer";
import {
  Play,
  Calendar,
  Trophy,
  ArrowRight,
  Loader2,
  Flame
} from "lucide-react";
import { useStudyQuestions, useSubmitAttempt } from "@/hooks/use-study";
import { useAuth } from "@/hooks/use-auth";
import { useUserSettings } from "@/hooks/use-settings";
import { useQueryClient } from "@tanstack/react-query";
import { useSidebar } from "@/hooks/use-sidebar";

type StudyPhase = "today_plan" | "keep_practicing";
type StudyState = "home" | "playing" | "plan_complete" | "session_pause";

const KEEP_PRACTICING_BATCH = 5;

export default function Study() {
  const [studyState, setStudyState] = useState<StudyState>("home");
  const [studyPhase, setStudyPhase] = useState<StudyPhase>("today_plan");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionResults, setSessionResults] = useState<{
    correct: number;
    total: number;
  }>({ correct: 0, total: 0 });
  const [todayPlanResults, setTodayPlanResults] = useState<{
    correct: number;
    total: number;
  } | null>(null);
  const questionStartTime = useRef<number>(Date.now());

  const { user } = useAuth();
  const { settings } = useUserSettings();
  const queryClient = useQueryClient();
  const { collapse, expand } = useSidebar();

  // Collapse sidebar when playing, expand when not
  useEffect(() => {
    if (studyState === "playing") {
      collapse();
    } else {
      expand();
    }
  }, [studyState, collapse, expand]);

  // Use daily goal from settings
  const dailyGoal = settings.daily_goal || 10;

  // Fetch questions based on current phase
  const questionLimit = studyPhase === "today_plan" ? dailyGoal : KEEP_PRACTICING_BATCH;
  const { data: questions, isLoading, error, refetch } = useStudyQuestions({ 
    limit: questionLimit,
    paceOffset: settings.pace_offset,
  });
  const submitAttempt = useSubmitAttempt();

  // Derived data
  const todayRemaining = questions?.length || 0;
  const nextExamName = "MT1"; // TODO: Fetch from exam calendar
  const daysUntilExam = 5;

  const handleStart = useCallback(() => {
    setStudyPhase("today_plan");
    setStudyState("playing");
    setCurrentIndex(0);
    setSessionResults({ correct: 0, total: 0 });
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

      const newResults = {
        correct: sessionResults.correct + (result.isCorrect ? 1 : 0),
        total: sessionResults.total + 1,
      };
      setSessionResults(newResults);

      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        // Batch complete
        if (studyPhase === "today_plan") {
          // Save Today Plan results and show completion
          setTodayPlanResults(newResults);
          setStudyState("plan_complete");
        } else {
          // Keep Practicing: show pause screen to continue or stop
          setStudyState("session_pause");
        }
      }
    },
    [currentIndex, questions, submitAttempt, studyPhase, sessionResults]
  );

  const handleKeepPracticing = useCallback(async () => {
    setStudyPhase("keep_practicing");
    // Invalidate and refetch to get fresh recommendations
    await queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    await refetch();
    setCurrentIndex(0);
    setSessionResults({ correct: 0, total: 0 });
    setStudyState("playing");
    questionStartTime.current = Date.now();
  }, [queryClient, refetch]);

  const handleContinuePracticing = useCallback(async () => {
    // Invalidate and refetch to get fresh recommendations
    await queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    await refetch();
    setCurrentIndex(0);
    setSessionResults({ correct: 0, total: 0 });
    setStudyState("playing");
    questionStartTime.current = Date.now();
  }, [queryClient, refetch]);

  const handleSimilar = useCallback(() => {
    console.log("Similar clicked");
  }, []);

  const handleEndSession = useCallback(() => {
    setStudyState("home");
    setStudyPhase("today_plan");
  }, []);

  // Study Home state
  if (studyState === "home") {
    return (
      <PageTransition className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Study</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Today: {todayRemaining} questions ready • Next exam: {nextExamName} in {daysUntilExam} days
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

          {todayPlanResults && (
            <p className="text-sm text-green-600 dark:text-green-400">
              ✓ Completed today: {todayPlanResults.correct}/{todayPlanResults.total} correct
            </p>
          )}
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
        <Button variant="outline" onClick={() => setStudyState("home")}>
          Back to Home
        </Button>
      </PageTransition>
    );
  }

  // Question Player state
  if (studyState === "playing") {
    const currentQuestion = questions[currentIndex];
    // Show progress for Today's Plan, just counter for Keep Practicing
    const showTotalProgress = studyPhase === "today_plan";

    return (
      <PageTransition className="space-y-6">
        <AnimatePresence mode="wait">
          <QuestionPlayer
            key={currentQuestion.id}
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={showTotalProgress ? questions.length : undefined}
            onComplete={handleQuestionComplete}
            onSimilar={handleSimilar}
          />
        </AnimatePresence>
      </PageTransition>
    );
  }

  // Today's Plan Complete state
  if (studyState === "plan_complete") {
    return (
      <PageTransition className="space-y-8">
        <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
          <div className="rounded-full bg-green-500/10 p-6">
            <Trophy className="h-12 w-12 text-green-500" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Today's Plan Complete! 🎉</h1>
            <p className="text-muted-foreground">
              You got {todayPlanResults?.correct || 0} out of {todayPlanResults?.total || 0} correct
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button 
              size="lg" 
              className="gap-2" 
              onClick={handleKeepPracticing}
            >
              <Flame className="h-5 w-5" />
              Keep Practicing
            </Button>
            <Button variant="outline" onClick={handleEndSession}>
              Done for Today
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }

  // Keep Practicing pause state (between batches)
  if (studyState === "session_pause") {
    return (
      <PageTransition className="space-y-8">
        <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
          <div className="rounded-full bg-primary/10 p-6">
            <Flame className="h-12 w-12 text-primary" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Great work!</h1>
            <p className="text-muted-foreground">
              Batch complete: {sessionResults.correct}/{sessionResults.total} correct
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button 
              size="lg" 
              className="gap-2" 
              onClick={handleContinuePracticing}
            >
              <ArrowRight className="h-5 w-5" />
              Continue ({KEEP_PRACTICING_BATCH} more)
            </Button>
            <Button variant="outline" onClick={handleEndSession}>
              End Session
            </Button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return null;
}
