import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { StudyLoadingScreen } from "@/components/study/StudyLoadingScreen";
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
import { SessionProgressDots } from "@/components/study/SessionProgressDots";
import { useStudyQuestions, useSubmitAttempt } from "@/hooks/use-study";
import { useFocusContext, FocusPreset } from "@/contexts/FocusContext";
import { useStudyDashboard, PracticeRecommendation } from "@/hooks/use-study-dashboard";
import { useEnrollments } from "@/hooks/use-enrollments";
import { NoCoursesEmptyState } from "@/components/shared/NoCoursesEmptyState";
import { useAuth } from "@/hooks/use-auth";
import { useUserSettings } from "@/hooks/use-settings";
import { useQueryClient } from "@tanstack/react-query";
import { useSidebar } from "@/hooks/use-sidebar";
import { SubpartResult } from "@/types/study";
import { useDiagnosticData, useSubmitDiagnostic } from "@/hooks/use-diagnostic";
import { useSessionRecommendation } from "@/hooks/use-session-recommendation";
import { useAdaptiveSequencer } from "@/hooks/use-adaptive-sequencer";
import { Loader2 } from "lucide-react";

type StudyPhase = "session" | "diagnostic";
type StudyState = "home" | "playing" | "complete" | "keep_going_prompt";

const CONTINUATION_BATCH = 5;

export default function Study() {
  const location = useLocation();
  const navigate = useNavigate();
  const [studyState, setStudyState] = useState<StudyState>("home");
  const [studyPhase, setStudyPhase] = useState<StudyPhase>("session");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [questionOutcomes, setQuestionOutcomes] = useState<Record<number, 'correct' | 'incorrect' | 'skipped'>>({});
  const [sessionResults, setSessionResults] = useState<{
    correct: number;
    total: number;
  }>({ correct: 0, total: 0 });
  const questionStartTime = useRef<number>(Date.now());
  // Track the recommended boundary for "Keep going?" prompt
  const [recommendedBoundary, setRecommendedBoundary] = useState<number>(10);
  const [hasPassedBoundary, setHasPassedBoundary] = useState(false);

  const { user } = useAuth();
  const { settings } = useUserSettings();
  const { enrollments, enrolledCourseIdsArray, isLoadingEnrollments } = useEnrollments();
  const queryClient = useQueryClient();
  const { collapse, expand } = useSidebar();

  // Session recommendation (dynamic goals)
  const { data: sessionRec } = useSessionRecommendation();

  // Adaptive sequencer
  const sequencer = useAdaptiveSequencer();

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
  const dailyPlanMode = settings.daily_plan_mode || 'single_course';
  const { data: dashboardData, isLoading: dashboardLoading } = useStudyDashboard();

  // Use recommended session size or fall back to daily_goal
  const effectiveSessionSize = sessionRec?.recommended_total || settings.daily_goal || 10;

  // Handle navigation state from StudyFocus page
  useEffect(() => {
    if (location.state?.startPractice) {
      handleStartSession();
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
  const studyQueryParams = useMemo(() => {
    const effectiveCourseId = filters.courseIds.length === 1
      ? filters.courseIds[0]
      : enrolledCourseIdsArray.length === 1
        ? enrolledCourseIdsArray[0]
        : null;

    const hasCustomFilters = filters.examNames.length > 0 ||
      filters.topicIds.length > 0 ||
      filters.questionTypeId !== null ||
      filters.midtermNumber !== null;

    return {
      limit: effectiveSessionSize,
      paceOffset: settings.pace_offset,
      courseId: effectiveCourseId,
      examName: filters.examNames.length === 1 ? filters.examNames[0] : null,
      topicIds: filters.topicIds,
      questionTypeId: filters.questionTypeId,
      enrolledCourseIds: enrolledCourseIdsArray,
      ignoreConstraints: hasCustomFilters,
    };
  }, [effectiveSessionSize, settings.pace_offset, filters, enrolledCourseIdsArray]);

  // Fetch questions
  const { data: questions, isLoading, error, refetch } = useStudyQuestions(studyQueryParams);

  // Initialize sequencer when questions load
  useEffect(() => {
    if (questions && questions.length > 0 && studyState === "playing" && studyPhase === "session") {
      const allTopicIds = [...new Set(questions.flatMap(q => q.topicIds))];
      const excludeIds = questions.map(q => q.id);
      sequencer.initQueue(questions, allTopicIds, excludeIds);
    }
  }, [questions, studyState, studyPhase]);

  // Diagnostic Data
  const { data: diagnosticData } = useDiagnosticData(enrolledCourseIdsArray[0] || null);
  const submitDiagnostic = useSubmitDiagnostic();
  const [diagnosticResults, setDiagnosticResults] = useState<Array<{ topicId: string, isCorrect: boolean }>>([]);

  // Active questions: for session phase, use sequencer queue; for diagnostic, use diagnostic data
  const activeQuestions = studyPhase === "diagnostic"
    ? diagnosticData?.questions
    : sequencer.queue.length > 0 ? sequencer.queue : questions;

  const activeCurrentIndex = studyPhase === "diagnostic"
    ? currentIndex
    : sequencer.queue.length > 0 ? sequencer.currentIndex : currentIndex;

  const submitAttempt = useSubmitAttempt();

  const handleStartDiagnostic = useCallback(() => {
    if (!diagnosticData?.questions || diagnosticData.questions.length === 0) return;
    setStudyState("playing");
    setStudyPhase("diagnostic");
    setCurrentIndex(0);
    setCompletedIndices([]);
    setQuestionOutcomes({});
    setSessionResults({ correct: 0, total: 0 });
    setDiagnosticResults([]);
    setHasPassedBoundary(false);
    questionStartTime.current = Date.now();
  }, [diagnosticData]);

  const handleQuestionComplete = useCallback(
    async (result: {
      isCorrect: boolean;
      confidence: number | null;
      hintsUsed: boolean;
      guideUsed: boolean;
      skipped: boolean;
      selectedChoiceId: string | null;
    }) => {
      const currentQuestions = studyPhase === "diagnostic" ? diagnosticData?.questions : activeQuestions;
      if (!currentQuestions) return;

      const effectiveIndex = studyPhase === "diagnostic" ? currentIndex : activeCurrentIndex;
      const currentQuestion = currentQuestions[effectiveIndex];
      if (!currentQuestion) return;

      const timeSpentMs = Date.now() - questionStartTime.current;

      // Submit attempt for non-diagnostic
      if (studyPhase !== "diagnostic" && !result.skipped) {
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

      // Diagnostic results
      if (studyPhase === "diagnostic") {
        const topicId = diagnosticData?.topicDetails.find(d => d.question.id === currentQuestion.id)?.topicId;
        if (topicId) {
          setDiagnosticResults(prev => [...prev, { topicId, isCorrect: result.isCorrect }]);
        }
      }

      const newResults = {
        correct: sessionResults.correct + (result.isCorrect ? 1 : 0),
        total: sessionResults.total + 1,
      };
      setSessionResults(newResults);

      setCompletedIndices(prev =>
        prev.includes(effectiveIndex) ? prev : [...prev, effectiveIndex]
      );
      setQuestionOutcomes(prev => ({
        ...prev,
        [effectiveIndex]: result.skipped ? 'skipped' : result.isCorrect ? 'correct' : 'incorrect',
      }));

      // Advance sequencer for session phase
      if (studyPhase === "session") {
        sequencer.advance({
          isCorrect: result.isCorrect,
          guideUsed: result.guideUsed,
          confidence: result.confidence,
          questionTopicIds: currentQuestion.topicIds || [],
        });

        // Check if we've hit the recommended boundary
        const nextIndex = activeCurrentIndex + 1;
        if (nextIndex >= recommendedBoundary && !hasPassedBoundary) {
          setHasPassedBoundary(true);
          setStudyState("keep_going_prompt");
          return;
        }

        // Check if we've exhausted the queue
        if (nextIndex >= sequencer.totalQuestions) {
          setStudyState("complete");
          return;
        }

        questionStartTime.current = Date.now();
        return;
      }

      // Diagnostic / fallback linear progression
      if (effectiveIndex < currentQuestions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        if (studyPhase === "diagnostic") {
          const finalResults = [
            ...diagnosticResults,
            ...(diagnosticData?.topicDetails.find(d => d.question.id === currentQuestion.id)?.topicId
              ? [{ topicId: diagnosticData.topicDetails.find(d => d.question.id === currentQuestion.id)!.topicId, isCorrect: result.isCorrect }]
              : [])
          ];
          await submitDiagnostic.mutateAsync({ results: finalResults });
        }
        setStudyState("complete");
      }
    },
    [currentIndex, activeCurrentIndex, activeQuestions, diagnosticData, submitAttempt, studyPhase, sessionResults, diagnosticResults, submitDiagnostic, sequencer, recommendedBoundary, hasPassedBoundary]
  );

  // Handle multi-part question completion
  const handleMultiPartComplete = useCallback(
    async (results: SubpartResult[]) => {
      const currentQuestions = studyPhase === "diagnostic" ? diagnosticData?.questions : activeQuestions;
      if (!currentQuestions) return;

      const effectiveIndex = studyPhase === "diagnostic" ? currentIndex : activeCurrentIndex;
      const currentQuestion = currentQuestions[effectiveIndex];
      if (!currentQuestion) return;

      const timeSpentMs = Date.now() - questionStartTime.current;

      if (studyPhase !== "diagnostic") {
        for (const result of results) {
          if (!result.skipped) {
            submitAttempt.mutate({
              questionId: currentQuestion.id,
              subpartId: result.subpartId,
              selectedChoiceId: result.selectedChoiceId || null,
              isCorrect: result.isCorrect,
              confidence: result.confidence,
              hintUsed: result.hintsUsed,
              guideUsed: result.guideUsed,
              timeSpentMs: Math.floor(timeSpentMs / results.length),
            });
          }
        }
      }

      const allCorrect = results.every(r => r.isCorrect);
      const anyGuideUsed = results.some(r => r.guideUsed);

      if (studyPhase === "diagnostic") {
        const topicId = diagnosticData?.topicDetails.find(d => d.question.id === currentQuestion.id)?.topicId;
        if (topicId) {
          setDiagnosticResults(prev => [...prev, { topicId, isCorrect: allCorrect }]);
        }
      }

      const newResults = {
        correct: sessionResults.correct + (allCorrect ? 1 : 0),
        total: sessionResults.total + 1,
      };
      setSessionResults(newResults);

      // Advance sequencer for session phase
      if (studyPhase === "session") {
        sequencer.advance({
          isCorrect: allCorrect,
          guideUsed: anyGuideUsed,
          confidence: null,
          questionTopicIds: currentQuestion.topicIds || [],
        });

        const nextIndex = activeCurrentIndex + 1;
        if (nextIndex >= recommendedBoundary && !hasPassedBoundary) {
          setHasPassedBoundary(true);
          setStudyState("keep_going_prompt");
          return;
        }

        if (nextIndex >= sequencer.totalQuestions) {
          setStudyState("complete");
          return;
        }

        questionStartTime.current = Date.now();
        return;
      }

      if (effectiveIndex < currentQuestions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        if (studyPhase === "diagnostic") {
          const finalResults = [
            ...diagnosticResults,
            ...(diagnosticData?.topicDetails.find(d => d.question.id === currentQuestion.id)?.topicId
              ? [{ topicId: diagnosticData.topicDetails.find(d => d.question.id === currentQuestion.id)!.topicId, isCorrect: allCorrect }]
              : [])
          ];
          await submitDiagnostic.mutateAsync({ results: finalResults });
        }
        setStudyState("complete");
      }
    },
    [currentIndex, activeCurrentIndex, activeQuestions, diagnosticData, submitAttempt, studyPhase, sessionResults, diagnosticResults, submitDiagnostic, sequencer, recommendedBoundary, hasPassedBoundary]
  );

  const resetSessionState = useCallback(() => {
    setCurrentIndex(0);
    setCompletedIndices([]);
    setQuestionOutcomes({});
    setSessionResults({ correct: 0, total: 0 });
    setHasPassedBoundary(false);
    questionStartTime.current = Date.now();
  }, []);

  const handleStartSession = useCallback(async (preset?: FocusPreset) => {
    setStudyState("playing");
    setStudyPhase("session");
    if (preset) {
      applyPreset(preset);
    }
    setRecommendedBoundary(effectiveSessionSize);
    await queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    await refetch();
    resetSessionState();
  }, [queryClient, refetch, applyPreset, effectiveSessionSize, resetSessionState]);

  const handleStartTodayPlan = useCallback(async () => {
    await handleStartSession();
  }, [handleStartSession]);

  const handleKeepGoing = useCallback(() => {
    // Continue past the recommended boundary — extend by CONTINUATION_BATCH
    setRecommendedBoundary(prev => prev + CONTINUATION_BATCH);
    setStudyState("playing");
    questionStartTime.current = Date.now();
  }, []);

  const handleGoHome = useCallback(() => {
    setStudyState("home");
    setStudyPhase("session");
    resetSessionState();
    clearFilters();
    queryClient.invalidateQueries({ queryKey: ['study-questions'] });
    queryClient.invalidateQueries({ queryKey: ['today-plan-stats'] });
    queryClient.invalidateQueries({ queryKey: ['session-recommendation'] });
    queryClient.invalidateQueries({ queryKey: ['study-dashboard'] });
  }, [queryClient, clearFilters, resetSessionState]);

  // Navigate to specific question index
  const handleNavigateQuestion = useCallback((index: number) => {
    if (index >= 0 && activeQuestions && index < activeQuestions.length) {
      setCurrentIndex(index);
      questionStartTime.current = Date.now();
    }
  }, [activeQuestions]);

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
          handleStartSession();
        },
      });
    }

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
          handleStartSession();
        },
      });
    }

    const overdueRec = dashboardData?.practiceRecommendations.find(r => r.type === 'overdue_review');
    if (overdueRec) {
      suggestions.push({
        id: 'overdue',
        label: overdueRec.label,
        icon: 'refresh',
        onClick: () => handleStartSession(),
      });
    }

    return suggestions;
  }, [dashboardData, setCourseIds, setTopicIds, handleStartSession]);

  const handleContinueSession = useCallback(() => {
    handleStartSession();
  }, [handleStartSession]);

  const handleStartRecommendation = useCallback((rec: PracticeRecommendation) => {
    if (rec.filters.topicIds) {
      setTopicIds(rec.filters.topicIds);
    }
    handleStartSession();
  }, [setTopicIds, handleStartSession]);

  // HOME state — enrollment gate
  const hasEnrollments = enrollments.length > 0;

  if (studyState === "home" && isLoadingEnrollments) {
    return (
      <PageTransition className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </PageTransition>
    );
  }

  if (studyState === "home" && !hasEnrollments) {
    return <NoCoursesEmptyState />;
  }

  // HOME state
  if (studyState === "home") {
    const recTotal = sessionRec?.recommended_total || effectiveSessionSize;
    const recMinutes = sessionRec?.estimated_minutes || Math.round(recTotal * 1.5);

    const todayPlan = dashboardData?.todayPlan || {
      totalQuestions: recTotal,
      completedQuestions: 0,
      correctCount: 0,
      estimatedMinutes: recMinutes,
      primaryCourse: null,
      alsoDueCourses: [],
      progressPercent: 0,
    };

    // Override totalQuestions with recommendation
    const enhancedPlan = {
      ...todayPlan,
      totalQuestions: recTotal,
      estimatedMinutes: Math.round(Math.max(0, recTotal - todayPlan.completedQuestions) * 1.5),
      progressPercent: recTotal > 0
        ? Math.round((todayPlan.completedQuestions / recTotal) * 100)
        : 0,
    };

    const stats = dashboardData?.stats || {
      streak: 0,
      weeklyAccuracy: 0,
      reviewsDue: 0,
      questionsToday: 0,
    };

    return (
      <PageTransition className="min-h-full">
        <div className="min-h-full bg-background">
          <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-5">
            {/* Page header */}
            <div className="flex items-baseline justify-between">
              <div>
                <h1 className="text-h1 font-semibold tracking-tight">Study</h1>
                <p className="text-meta text-muted-foreground">
                  {todayPlan.completedQuestions > 0
                    ? `${todayPlan.completedQuestions} of ~${recTotal} completed today`
                    : 'Ready to learn something new?'
                  }
                </p>
              </div>
            </div>

            {/* Diagnostic Quiz Callout */}
            {diagnosticData?.questions && diagnosticData.questions.length > 0 && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-primary">Diagnostic Quiz Available</h3>
                  <p className="text-muted-foreground mt-1">
                    We found {diagnosticData.questions.length} topics from your course schedule that you haven't mastered yet.
                    Take a quick quiz to skip ahead!
                  </p>
                </div>
                <Button onClick={handleStartDiagnostic} className="shrink-0">
                  Start Diagnostic
                </Button>
              </div>
            )}

            {/* Focus Bar with course/exam context */}
            <StudyFocusBar
              overdueCount={stats.reviewsDue}
            />

            {/* Stats strip */}
            <StatsStrip
              streak={stats.streak}
              weeklyAccuracy={stats.weeklyAccuracy}
              reviewsDue={stats.reviewsDue}
              questionsToday={stats.questionsToday}
            />

            <div className="space-y-5">
              {/* Today's Plan Card — uses recommended count */}
              <TodayPlanCard
                stats={enhancedPlan}
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
                    handleContinueSession();
                  }}
                />
              )}

              {/* Practice Recommendations */}
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
          <span className="text-sm text-muted-foreground">Loading session...</span>
        </div>
        <PageTransition className="flex-1">
          <StudyLoadingScreen />
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
  if ((!activeQuestions || activeQuestions.length === 0) && studyState === "playing") {
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

  // KEEP_GOING_PROMPT — inline prompt at recommendation boundary
  if (studyState === "keep_going_prompt") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b bg-card/50 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleGoHome}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <PageTransition className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-sm mx-auto text-center space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Recommended session complete!</h2>
              <p className="text-muted-foreground">
                You've completed {sessionResults.correct}/{sessionResults.total} correctly.
                Want to keep going?
              </p>
            </div>

            {/* Session progress dots */}
            <SessionProgressDots
              totalQuestions={activeQuestions?.length || 0}
              currentIndex={-1}
              outcomes={questionOutcomes}
            />

            <div className="flex flex-col gap-2">
              <Button onClick={handleKeepGoing} className="w-full">
                Keep Going ({CONTINUATION_BATCH} more)
              </Button>
              <Button variant="ghost" onClick={handleGoHome} className="w-full text-muted-foreground">
                Done for Now
              </Button>
            </div>
          </div>
        </PageTransition>
      </div>
    );
  }

  // PLAYING state
  if (studyState === "playing" && activeQuestions && activeQuestions.length > 0) {
    const effectiveIndex = studyPhase === "diagnostic" ? currentIndex : activeCurrentIndex;
    const currentQuestion = activeQuestions[effectiveIndex];
    if (!currentQuestion) return null;

    const hasSubparts = currentQuestion.subparts && Array.isArray(currentQuestion.subparts) && currentQuestion.subparts.length > 0;

    return (
      <div className="flex flex-col h-full">
        {/* Focus Bar - persistent context header */}
        <FocusBar
          showProgress={true}
          questionsCompleted={effectiveIndex}
          questionsTotal={activeQuestions.length}
        />

        {/* Header with back button */}
        <div className="px-4 py-2 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleGoHome} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-meta">Exit</span>
          </Button>
          <span className="text-meta text-muted-foreground">
            {studyPhase === "diagnostic" ? "Diagnostic Quiz" : `Question ${effectiveIndex + 1}`}
            {` of ${activeQuestions.length}`}
          </span>
        </div>

        {/* Session progress dots */}
        {activeQuestions.length > 1 && (
          <div className="border-b">
            <SessionProgressDots
              totalQuestions={activeQuestions.length}
              currentIndex={effectiveIndex}
              outcomes={questionOutcomes}
              onNavigate={studyPhase === "diagnostic" ? handleNavigateQuestion : undefined}
              insertedIndices={studyPhase === "session" ? new Set(
                Array.from({ length: activeQuestions.length }, (_, i) => i).filter(i => sequencer.isInserted(i))
              ) : undefined}
            />
          </div>
        )}

        <PageTransition className="flex-1 space-y-6 p-4">
          <AnimatePresence mode="wait">
            {hasSubparts ? (
              <MultiPartQuestionPlayer
                key={`multi-${currentQuestion.id}`}
                question={currentQuestion}
                questionNumber={effectiveIndex + 1}
                totalQuestions={activeQuestions.length}
                onComplete={handleMultiPartComplete}
                onSimilar={handleSimilar}
              />
            ) : (
              <QuestionPlayer
                key={currentQuestion.id}
                question={currentQuestion}
                questionNumber={effectiveIndex + 1}
                totalQuestions={activeQuestions.length}
                onComplete={handleQuestionComplete}
                onSimilar={handleSimilar}
              />
            )}
          </AnimatePresence>
        </PageTransition>
      </div>
    );
  }

  // COMPLETE state
  if (studyState === "complete") {
    const isDiagnostic = studyPhase === "diagnostic";
    return (
      <PageTransition className="flex-1">
        <CompletionCard
          title={isDiagnostic ? "Diagnostic Complete!" : "Session Complete!"}
          subtitle={isDiagnostic ? "We've calibrated your study plan." : "Great work today"}
          correctCount={sessionResults.correct}
          totalCount={sessionResults.total}
          suggestions={isDiagnostic ? [] : completionSuggestions}
          onDone={handleGoHome}
          outcomes={questionOutcomes}
          totalQuestions={activeQuestions?.length}
        />
      </PageTransition>
    );
  }

  return null;
}
