import { useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { QuestionPlayer } from "@/components/study/QuestionPlayer";
import { 
  Play, 
  Calendar, 
  Trophy, 
  ArrowRight, 
  Loader2, 
  Infinity, 
  Target,
  Flame
} from "lucide-react";
import { useStudyQuestions, useSubmitAttempt } from "@/hooks/use-study";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { duration, easing } from "@/lib/motion";

type StudyMode = "today_plan" | "keep_practicing";
type StudyState = "home" | "playing" | "plan_complete" | "session_end";

const TODAY_PLAN_LIMIT = 10;
const KEEP_PRACTICING_BATCH = 5;

export default function Study() {
  const [studyState, setStudyState] = useState<StudyState>("home");
  const [studyMode, setStudyMode] = useState<StudyMode>("today_plan");
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
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  // Fetch questions based on current mode
  const questionLimit = studyMode === "today_plan" ? TODAY_PLAN_LIMIT : KEEP_PRACTICING_BATCH;
  const { data: questions, isLoading, error, refetch } = useStudyQuestions({ 
    limit: questionLimit 
  });
  const submitAttempt = useSubmitAttempt();

  // Derived data
  const todayRemaining = questions?.length || 0;
  const nextExamName = "MT1"; // TODO: Fetch from exam calendar
  const daysUntilExam = 5;

  const handleStartTodayPlan = useCallback(() => {
    setStudyMode("today_plan");
    setStudyState("playing");
    setCurrentIndex(0);
    setSessionResults({ correct: 0, total: 0 });
    setTodayPlanResults(null);
    questionStartTime.current = Date.now();
  }, []);

  const handleStartKeepPracticing = useCallback(() => {
    setStudyMode("keep_practicing");
    setStudyState("playing");
    setCurrentIndex(0);
    setSessionResults({ correct: 0, total: 0 });
    questionStartTime.current = Date.now();
    // Refetch to get fresh recommendations
    queryClient.invalidateQueries({ queryKey: ['study-questions'] });
  }, [queryClient]);

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

      setSessionResults((prev) => ({
        correct: prev.correct + (result.isCorrect ? 1 : 0),
        total: prev.total + 1,
      }));

      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        // Batch complete
        if (studyMode === "today_plan") {
          // Save Today Plan results and show completion
          setTodayPlanResults({
            correct: sessionResults.correct + (result.isCorrect ? 1 : 0),
            total: sessionResults.total + 1,
          });
          setStudyState("plan_complete");
        } else {
          // Keep Practicing: fetch more questions
          setStudyState("session_end");
        }
      }
    },
    [currentIndex, questions, submitAttempt, studyMode, sessionResults]
  );

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
    setStudyMode("today_plan");
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

        <div className="grid gap-4 md:grid-cols-2">
          {/* Today's Plan Card */}
          <motion.div
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.normal / 1000, ease: easing.easeOut }}
            className="flex flex-col items-center justify-center p-8 space-y-4 rounded-xl border-2 border-primary/20 bg-primary/5 hover:border-primary/40 transition-colors cursor-pointer"
            onClick={handleStartTodayPlan}
          >
            <div className="rounded-full bg-primary/10 p-4">
              <Target className="h-10 w-10 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">Today's Plan</h2>
              <p className="text-sm text-muted-foreground">
                {TODAY_PLAN_LIMIT} optimized questions
              </p>
            </div>
            <Button size="lg" className="gap-2 mt-2">
              <Play className="h-4 w-4" />
              Start Plan
            </Button>
          </motion.div>

          {/* Keep Practicing Card */}
          <motion.div
            initial={prefersReducedMotion ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: duration.normal / 1000, 
              ease: easing.easeOut,
              delay: prefersReducedMotion ? 0 : 0.1
            }}
            className="flex flex-col items-center justify-center p-8 space-y-4 rounded-xl border-2 border-border bg-muted/30 hover:border-muted-foreground/30 transition-colors cursor-pointer"
            onClick={handleStartKeepPracticing}
          >
            <div className="rounded-full bg-muted p-4">
              <Infinity className="h-10 w-10 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">Keep Practicing</h2>
              <p className="text-sm text-muted-foreground">
                Unlimited practice mode
              </p>
            </div>
            <Button variant="outline" size="lg" className="gap-2 mt-2">
              <Flame className="h-4 w-4" />
              Free Practice
            </Button>
          </motion.div>
        </div>

        {todayPlanResults && (
          <motion.div 
            initial={prefersReducedMotion ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center"
          >
            <p className="text-sm text-green-700 dark:text-green-300">
              ✓ Today's Plan completed: {todayPlanResults.correct}/{todayPlanResults.total} correct
            </p>
          </motion.div>
        )}
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
    const modeLabel = studyMode === "today_plan" ? "Today's Plan" : "Keep Practicing";
    const showProgress = studyMode === "today_plan";

    return (
      <PageTransition className="space-y-6">
        {/* Mode indicator */}
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            {studyMode === "today_plan" ? (
              <Target className="h-4 w-4 text-primary" />
            ) : (
              <Infinity className="h-4 w-4" />
            )}
            {modeLabel}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground"
            onClick={handleEndSession}
          >
            End Session
          </Button>
        </div>

        <AnimatePresence mode="wait">
          <QuestionPlayer
            key={currentQuestion.id}
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            totalQuestions={showProgress ? questions.length : undefined}
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
              You got {todayPlanResults?.correct || sessionResults.correct} out of {todayPlanResults?.total || sessionResults.total} correct
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button 
              size="lg" 
              className="gap-2" 
              onClick={handleStartKeepPracticing}
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

  // Keep Practicing batch complete state
  if (studyState === "session_end") {
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
