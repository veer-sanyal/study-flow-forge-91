import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/motion/PageTransition";
import { QuestionPlayer } from "@/components/study/QuestionPlayer";
import { MultiPartQuestionPlayer } from "@/components/study/MultiPartQuestionPlayer";
import { TodayPlanCard } from "@/components/study/TodayPlanCard";
import { FocusBar } from "@/components/study/FocusBar";
import { CompletionCard } from "@/components/study/CompletionCard";
import { ContinueSessionCard } from "@/components/study/ContinueSessionCard";
import { StudyFocusBar } from "@/components/study/StudyFocusBar";
import { RecommendationCards } from "@/components/study/RecommendationCards";
import { StatsStrip } from "@/components/study/StatsStrip";
import { QuestionNav } from "@/components/study/QuestionNav";
import { useStudyQuestions, useSubmitAttempt } from "@/hooks/use-study";
import { useFocusContext, FocusPreset } from "@/contexts/FocusContext";
import { useStudyDashboard, PracticeRecommendation } from "@/hooks/use-study-dashboard";
import { useEnrollments } from "@/hooks/use-enrollments";
import { useAuth } from "@/hooks/use-auth";
import { useUserSettings } from "@/hooks/use-settings";
import { useQueryClient } from "@tanstack/react-query";
import { useSidebar } from "@/hooks/use-sidebar";
import { SubpartResult } from "@/types/study";

type StudyPhase = "today_plan" | "keep_practicing";
type StudyState = "home" | "playing" | "plan_complete" | "session_pause";

const KEEP_PRACTICING_BATCH = 5;

export default function Study() {
  const location = useLocation();
  const navigate = useNavigate();
  const [studyState, setStudyState] = useState<StudyState>("home");
  const [studyPhase, setStudyPhase] = useState<StudyPhase>("today_plan");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
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
  const { enrolledCourseIdsArray, isLoadingEnrollments } = useEnrollments();
  const queryClient = useQueryClient();
  const { collapse, expand } = useSidebar();

  // Focus system from context
  const {
    filters,
    setCourseIds,
    setTopicIds,
    applyPreset,
    clearFilters,
    hasActiveFilters,
  } = useFocusContext();

  // Unified dashboard data
  const dailyGoal = settings.daily_goal || 10;
  const dailyPlanMode = settings.daily_plan_mode || 'single_course';
  const { data: dashboardData, isLoading: dashboardLoading } = useStudyDashboard();

  // Handle navigation state from StudyFocus page
  useEffect(() => {
    if (location.state?.startPractice) {
      handleStartPractice();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  // Collapse sidebar when playing, expand when not
  useEffect(() => {
    if (studyState === "playing") {
      collapse();
    } else {
      expand();
    }
  }, [studyState, collapse, expand]);

  // Convert focus filters to study query params
  // Use enrolled courses as default if no specific course filter is set
  const studyQueryParams = useMemo(() => {
    // Determine course filter: use focus filter if set, otherwise use first enrolled course
    const effectiveCourseId = filters.courseIds.length === 1 
      ? filters.courseIds[0] 
      : enrolledCourseIdsArray.length === 1 
        ? enrolledCourseIdsArray[0] 
        : null;
    
    return {
      limit: studyPhase === "today_plan" ? dailyGoal : KEEP_PRACTICING_BATCH,
      paceOffset: settings.pace_offset,
      courseId: effectiveCourseId,
      examName: filters.examNames.length === 1 ? filters.examNames[0] : null,
      topicIds: filters.topicIds,
      questionTypeId: filters.questionTypeId,
      // Pass enrolled courses for broader filtering when no single course selected
      enrolledCourseIds: enrolledCourseIdsArray,
    };
  }, [studyPhase, dailyGoal, settings.pace_offset, filters, enrolledCourseIdsArray]);

  // Fetch questions based on current phase and filters
  const { data: questions, isLoading, error, refetch } = useStudyQuestions(studyQueryParams);
  const submitAttempt = useSubmitAttempt();

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

      if (!result.skipped) {
        console.log('[Study] Submitting attempt for question:', currentQuestion.id, {
          isCorrect: result.isCorrect,
          selectedChoiceId: result.selectedChoiceId,
          studyPhase,
        });
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
      
      // Mark current question as completed
      setCompletedIndices(prev => 
        prev.includes(currentIndex) ? prev : [...prev, currentIndex]
      );

      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        if (studyPhase === "today_plan") {
          setTodayPlanResults(newResults);
          setStudyState("plan_complete");
        } else {
          setStudyState("session_pause");
        }
      }
    },
    [currentIndex, questions, submitAttempt, studyPhase, sessionResults]
  );

  // Handle multi-part question completion
  const handleMultiPartComplete = useCallback(
    async (results: SubpartResult[]) => {
      if (!questions) return;

      const currentQuestion = questions[currentIndex];
      const timeSpentMs = Date.now() - questionStartTime.current;

      // Submit attempt for each subpart
      for (const result of results) {
        if (!result.skipped) {
          console.log('[Study] Submitting multi-part attempt:', {
            questionId: currentQuestion.id,
            subpartId: result.subpartId,
            isCorrect: result.isCorrect,
          });
          submitAttempt.mutate({
            questionId: currentQuestion.id,
            subpartId: result.subpartId,
            selectedChoiceId: result.selectedChoiceId || null,
            isCorrect: result.isCorrect,
            confidence: result.confidence,
            hintUsed: result.hintsUsed,
            guideUsed: result.guideUsed,
            timeSpentMs: Math.floor(timeSpentMs / results.length), // Approximate per subpart
          });
        }
      }

      // Calculate overall correctness (all subparts correct = question correct)
      const allCorrect = results.every(r => r.isCorrect);
      const correctCount = results.filter(r => r.isCorrect).length;
      
      const newResults = {
        correct: sessionResults.correct + (allCorrect ? 1 : 0),
        total: sessionResults.total + 1,
      };
      setSessionResults(newResults);

      if (currentIndex < questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        if (studyPhase === "today_plan") {
          setTodayPlanResults(newResults);
          setStudyState("plan_complete");
        } else {
          setStudyState("session_pause");
        }
      }
    },
    [currentIndex, questions, submitAttempt, studyPhase, sessionResults]
  );

  const handleStartTodayPlan = useCallback(async () => {
    setStudyPhase("today_plan");
    await queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    await refetch();
    setCurrentIndex(0);
    setCompletedIndices([]);
    setSessionResults({ correct: 0, total: 0 });
    setStudyState("playing");
    questionStartTime.current = Date.now();
  }, [queryClient, refetch]);

  const handleStartPractice = useCallback(async (preset?: FocusPreset) => {
    if (preset) {
      applyPreset(preset);
    }
    setStudyPhase("keep_practicing");
    await queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    await refetch();
    setCurrentIndex(0);
    setCompletedIndices([]);
    setSessionResults({ correct: 0, total: 0 });
    setStudyState("playing");
    questionStartTime.current = Date.now();
  }, [queryClient, refetch, applyPreset]);

  const handleKeepPracticing = useCallback(async () => {
    setStudyPhase("keep_practicing");
    await queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    await refetch();
    setCurrentIndex(0);
    setCompletedIndices([]);
    setSessionResults({ correct: 0, total: 0 });
    setStudyState("playing");
    questionStartTime.current = Date.now();
  }, [queryClient, refetch]);

  const handleContinuePracticing = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    await refetch();
    setCurrentIndex(0);
    setCompletedIndices([]);
    setSessionResults({ correct: 0, total: 0 });
    setStudyState("playing");
    questionStartTime.current = Date.now();
  }, [queryClient, refetch]);

  const handleGoHome = useCallback(() => {
    setStudyState("home");
    setStudyPhase("today_plan");
    setCurrentIndex(0);
    setCompletedIndices([]);
    setSessionResults({ correct: 0, total: 0 });
    clearFilters();
    queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    queryClient.invalidateQueries({ queryKey: ['today-plan-stats'] });
  }, [queryClient, clearFilters]);

  // Navigate to specific question index
  const handleNavigateQuestion = useCallback((index: number) => {
    if (index >= 0 && questions && index < questions.length) {
      setCurrentIndex(index);
      questionStartTime.current = Date.now();
    }
  }, [questions]);

  const handleSimilar = useCallback(() => {
    console.log("Similar clicked");
  }, []);

  // Build completion suggestions from dashboard data
  const completionSuggestions = useMemo(() => {
    const suggestions: { id: string; label: string; description?: string; icon: 'arrow' | 'target' | 'refresh'; onClick: () => void }[] = [];

    if (dashboardData?.todayPlan.alsoDueCourses && dashboardData.todayPlan.alsoDueCourses.length > 0) {
      const next = dashboardData.todayPlan.alsoDueCourses[0];
      suggestions.push({
        id: 'next-course',
        label: `Next: ${next.title}`,
        description: `${next.count} questions`,
        icon: 'arrow',
        onClick: () => {
          setCourseIds([next.id]);
          handleKeepPracticing();
        },
      });
    }

    // Use practice recommendations for weak topics
    const weakRec = dashboardData?.practiceRecommendations.find(r => r.type === 'weak_topic');
    if (weakRec) {
      suggestions.push({
        id: 'weak-topic',
        label: weakRec.label,
        description: weakRec.description,
        icon: 'target',
        onClick: () => {
          if (weakRec.filters.topicIds) {
            setTopicIds(weakRec.filters.topicIds);
          }
          handleKeepPracticing();
        },
      });
    }

    // Use practice recommendations for overdue reviews
    const overdueRec = dashboardData?.practiceRecommendations.find(r => r.type === 'overdue_review');
    if (overdueRec) {
      suggestions.push({
        id: 'overdue',
        label: overdueRec.label,
        icon: 'refresh',
        onClick: handleKeepPracticing,
      });
    }

    return suggestions;
  }, [dashboardData, setCourseIds, setTopicIds, handleKeepPracticing]);

  // Handle continue session
  const handleContinueSession = useCallback(() => {
    // Resume practice with same focus
    handleStartPractice();
  }, [handleStartPractice]);

  // Handle starting a recommendation
  const handleStartRecommendation = useCallback((rec: PracticeRecommendation) => {
    if (rec.filters.topicIds) {
      setTopicIds(rec.filters.topicIds);
    }
    handleStartPractice();
  }, [setTopicIds, handleStartPractice]);

  // HOME state
  if (studyState === "home") {
    const todayPlan = dashboardData?.todayPlan || {
      totalQuestions: dailyGoal,
      completedQuestions: 0,
      correctCount: 0,
      estimatedMinutes: Math.round(dailyGoal * 1.5),
      primaryCourse: null,
      alsoDueCourses: [],
      progressPercent: 0,
    };

    const stats = dashboardData?.stats || {
      streak: 0,
      weeklyAccuracy: 0,
      reviewsDue: 0,
      questionsToday: 0,
    };

    return (
      <PageTransition className="min-h-full">
        {/* Background: subtle paper panel effect */}
        <div className="min-h-full bg-background">
          <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
            {/* Page header */}
            <div className="flex items-baseline justify-between">
              <div>
                <h1 className="text-h1 font-semibold tracking-tight">Study</h1>
                <p className="text-meta text-muted-foreground">
                  {todayPlan.completedQuestions > 0 
                    ? `${todayPlan.completedQuestions} of ${dailyGoal} completed today`
                    : 'Ready to learn something new?'
                  }
                </p>
              </div>
            </div>

            {/* Focus Bar with course/exam context */}
            <StudyFocusBar 
              overdueCount={stats.reviewsDue} 
            />

            {/* Stats strip - full width */}
            <StatsStrip
              streak={stats.streak}
              weeklyAccuracy={stats.weeklyAccuracy}
              reviewsDue={stats.reviewsDue}
              questionsToday={stats.questionsToday}
            />

            {/* Single column layout - stacked */}
            <div className="space-y-5">
              {/* Today's Plan Card - Hero treatment */}
              <TodayPlanCard
                stats={todayPlan}
                isLoading={dashboardLoading}
                onStart={handleStartTodayPlan}
                onCustomize={() => navigate('/study/focus')}
              />

              {/* Continue where you left off */}
              {dashboardData?.lastSession && (
                <ContinueSessionCard
                  session={dashboardData.lastSession}
                  onContinue={handleContinueSession}
                  onReviewMistakes={() => {
                    // TODO: Implement review mistakes functionality
                    handleContinueSession();
                  }}
                />
              )}

              {/* Practice Recommendations - below main cards */}
              <RecommendationCards
                recommendations={dashboardData?.practiceRecommendations || []}
                onStartRecommendation={handleStartRecommendation}
                onCustomPractice={() => navigate('/study/focus')}
              />
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  // Loading state for PLAYING
  if (isLoading && studyState === "playing") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b bg-card/50 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleGoHome}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
        <PageTransition className="flex-1 flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </PageTransition>
      </div>
    );
  }

  // Error state
  if (error && studyState === "playing") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b bg-card/50 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleGoHome}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
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
  if ((!questions || questions.length === 0) && studyState === "playing") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b bg-card/50 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleGoHome}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <PageTransition className="flex-1 space-y-4 text-center py-12">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "No questions match your focus"
              : "No questions available yet"}
          </p>
          {hasActiveFilters ? (
            <Button variant="outline" onClick={clearFilters}>
              Clear Focus
            </Button>
          ) : (
            <Button variant="outline" onClick={handleGoHome}>
              Go Back
            </Button>
          )}
        </PageTransition>
      </div>
    );
  }

  // PLAYING state
  if (studyState === "playing" && questions && questions.length > 0) {
    const currentQuestion = questions[currentIndex];
    const showTotalProgress = studyPhase === "today_plan";

    return (
      <div className="flex flex-col h-full">
        {/* Focus Bar - persistent context header */}
        <FocusBar
          showProgress={showTotalProgress}
          questionsCompleted={currentIndex}
          questionsTotal={questions.length}
        />

        {/* Header with back button */}
        <div className="px-4 py-2 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleGoHome} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-meta">Exit</span>
          </Button>
          <span className="text-meta text-muted-foreground">
            Question {currentIndex + 1}{showTotalProgress ? ` of ${questions.length}` : ""}
          </span>
        </div>

        {/* Question navigation - allows jumping to any question */}
        {questions.length > 1 && (
          <div className="px-4 border-b">
            <QuestionNav
              totalQuestions={questions.length}
              currentIndex={currentIndex}
              completedIndices={completedIndices}
              onNavigate={handleNavigateQuestion}
            />
          </div>
        )}

        <PageTransition className="flex-1 space-y-6 p-4">
          <AnimatePresence mode="wait">
            {/* Route to MultiPartQuestionPlayer for questions with subparts */}
            {currentQuestion.subparts && currentQuestion.subparts.length > 0 ? (
              <MultiPartQuestionPlayer
                key={`multi-${currentQuestion.id}`}
                question={currentQuestion}
                questionNumber={currentIndex + 1}
                totalQuestions={showTotalProgress ? questions.length : undefined}
                onComplete={handleMultiPartComplete}
                onSimilar={handleSimilar}
              />
            ) : (
              <QuestionPlayer
                key={currentQuestion.id}
                question={currentQuestion}
                questionNumber={currentIndex + 1}
                totalQuestions={showTotalProgress ? questions.length : undefined}
                onComplete={handleQuestionComplete}
                onSimilar={handleSimilar}
              />
            )}
          </AnimatePresence>
        </PageTransition>
      </div>
    );
  }

  // PLAN_COMPLETE state
  if (studyState === "plan_complete") {
    return (
      <PageTransition className="flex-1">
        <CompletionCard
          title="Today's Plan Complete! 🎉"
          subtitle="Great work on your daily goal"
          correctCount={todayPlanResults?.correct || 0}
          totalCount={todayPlanResults?.total || 0}
          suggestions={completionSuggestions}
          onDone={handleGoHome}
          variant="plan_complete"
        />
      </PageTransition>
    );
  }

  // SESSION_PAUSE state
  if (studyState === "session_pause") {
    return (
      <PageTransition className="flex-1">
        <CompletionCard
          title="Great work!"
          subtitle="Batch complete"
          correctCount={sessionResults.correct}
          totalCount={sessionResults.total}
          suggestions={[
            {
              id: 'continue',
              label: `Continue (${KEEP_PRACTICING_BATCH} more)`,
              icon: 'arrow',
              onClick: handleContinuePracticing,
            },
            ...completionSuggestions.slice(0, 2),
          ]}
          onDone={handleGoHome}
          variant="session_pause"
        />
      </PageTransition>
    );
  }

  return null;
}
