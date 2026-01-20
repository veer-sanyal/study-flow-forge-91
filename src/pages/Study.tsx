import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { QuestionPlayer } from "@/components/study/QuestionPlayer";
import { StudyFocusBar } from "@/components/study/StudyFocusBar";
import {
  Trophy,
  ArrowRight,
  Loader2,
  Flame
} from "lucide-react";
import { useStudyQuestions, useSubmitAttempt } from "@/hooks/use-study";
import { useStudyFilters } from "@/hooks/use-study-filters";
import { useAuth } from "@/hooks/use-auth";
import { useUserSettings } from "@/hooks/use-settings";
import { useQueryClient } from "@tanstack/react-query";
import { useSidebar } from "@/hooks/use-sidebar";

type StudyPhase = "today_plan" | "keep_practicing";
type StudyState = "playing" | "plan_complete" | "session_pause";

const KEEP_PRACTICING_BATCH = 5;

export default function Study() {
  // Start directly in playing state
  const [studyState, setStudyState] = useState<StudyState>("playing");
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
  
  // Study filters
  const {
    filters,
    setCourseId,
    setExamName,
    setTopicIds,
    setQuestionTypeId,
    clearFilters,
    activeFilterCount,
  } = useStudyFilters();

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

  // Fetch questions based on current phase and filters
  const questionLimit = studyPhase === "today_plan" ? dailyGoal : KEEP_PRACTICING_BATCH;
  const { data: questions, isLoading, error, refetch } = useStudyQuestions({ 
    limit: questionLimit,
    paceOffset: settings.pace_offset,
    courseId: filters.courseId,
    examName: filters.examName,
    topicIds: filters.topicIds,
    questionTypeId: filters.questionTypeId,
  });
  const submitAttempt = useSubmitAttempt();

  // Refetch when filters change
  useEffect(() => {
    setCurrentIndex(0);
    setSessionResults({ correct: 0, total: 0 });
    questionStartTime.current = Date.now();
  }, [filters.courseId, filters.examName, filters.topicIds, filters.questionTypeId]);

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
    setStudyState("playing");
    setStudyPhase("today_plan");
    setCurrentIndex(0);
    setSessionResults({ correct: 0, total: 0 });
    // Refetch questions to start fresh
    queryClient.invalidateQueries({ queryKey: ['study-questions'] });
  }, [queryClient]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <StudyFocusBar
          filters={filters}
          onCourseChange={setCourseId}
          onExamChange={setExamName}
          onTopicsChange={setTopicIds}
          onQuestionTypeChange={setQuestionTypeId}
          onClear={clearFilters}
          activeFilterCount={activeFilterCount}
        />
        <PageTransition className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </PageTransition>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col h-full">
        <StudyFocusBar
          filters={filters}
          onCourseChange={setCourseId}
          onExamChange={setExamName}
          onTopicsChange={setTopicIds}
          onQuestionTypeChange={setQuestionTypeId}
          onClear={clearFilters}
          activeFilterCount={activeFilterCount}
        />
        <PageTransition className="flex-1 space-y-4 text-center py-12">
          <p className="text-destructive">Failed to load questions</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </PageTransition>
      </div>
    );
  }

  // No questions available
  if (!questions || questions.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <StudyFocusBar
          filters={filters}
          onCourseChange={setCourseId}
          onExamChange={setExamName}
          onTopicsChange={setTopicIds}
          onQuestionTypeChange={setQuestionTypeId}
          onClear={clearFilters}
          activeFilterCount={activeFilterCount}
        />
        <PageTransition className="flex-1 space-y-4 text-center py-12">
          <p className="text-muted-foreground">
            {activeFilterCount > 0 
              ? "No questions match your filters" 
              : "No questions available yet"}
          </p>
          {activeFilterCount > 0 ? (
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Check back after your instructor uploads content
            </p>
          )}
        </PageTransition>
      </div>
    );
  }

  // Question Player state
  if (studyState === "playing") {
    const currentQuestion = questions[currentIndex];
    // Show progress for Today's Plan, just counter for Keep Practicing
    const showTotalProgress = studyPhase === "today_plan";

    return (
      <div className="flex flex-col h-full">
        <StudyFocusBar
          filters={filters}
          onCourseChange={setCourseId}
          onExamChange={setExamName}
          onTopicsChange={setTopicIds}
          onQuestionTypeChange={setQuestionTypeId}
          onClear={clearFilters}
          activeFilterCount={activeFilterCount}
        />
        <PageTransition className="flex-1 space-y-6 p-4">
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
      </div>
    );
  }

  // Today's Plan Complete state
  if (studyState === "plan_complete") {
    return (
      <div className="flex flex-col h-full">
        <StudyFocusBar
          filters={filters}
          onCourseChange={setCourseId}
          onExamChange={setExamName}
          onTopicsChange={setTopicIds}
          onQuestionTypeChange={setQuestionTypeId}
          onClear={clearFilters}
          activeFilterCount={activeFilterCount}
        />
        <PageTransition className="flex-1 space-y-8">
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
      </div>
    );
  }

  // Keep Practicing pause state (between batches)
  if (studyState === "session_pause") {
    return (
      <div className="flex flex-col h-full">
        <StudyFocusBar
          filters={filters}
          onCourseChange={setCourseId}
          onExamChange={setExamName}
          onTopicsChange={setTopicIds}
          onQuestionTypeChange={setQuestionTypeId}
          onClear={clearFilters}
          activeFilterCount={activeFilterCount}
        />
        <PageTransition className="flex-1 space-y-8">
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
      </div>
    );
  }

  return null;
}
