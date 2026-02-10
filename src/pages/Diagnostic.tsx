import { useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BookOpen, ChevronRight, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QuestionPlayer } from "@/components/study/QuestionPlayer";
import { MultiPartQuestionPlayer } from "@/components/study/MultiPartQuestionPlayer";
import { PageTransition } from "@/components/motion/PageTransition";
import { useEnrollments } from "@/hooks/use-enrollments";
import { useDiagnosticData, useSubmitDiagnostic } from "@/hooks/use-diagnostic";
import { useDiagnosticCompletions, useRecordDiagnosticCompletion } from "@/hooks/use-diagnostic-completions";
import { SubpartResult } from "@/types/study";
import { cn } from "@/lib/utils";

interface CourseWithDiagnostic {
  id: string;
  title: string;
  hasQuestions: boolean;
  questionCount: number;
}

type DiagnosticState = "overview" | "playing" | "complete";

export default function Diagnostic() {
  const navigate = useNavigate();
  const [diagnosticState, setDiagnosticState] = useState<DiagnosticState>("overview");
  const [currentCourseIndex, setCurrentCourseIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [sessionResults, setSessionResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const [diagnosticResults, setDiagnosticResults] = useState<Array<{ topicId: string; isCorrect: boolean }>>([]);
  const questionStartTime = useRef<number>(Date.now());

  const { enrollments, isLoadingEnrollments } = useEnrollments();
  const { completedCourseIds, isLoading: isLoadingCompletions } = useDiagnosticCompletions();
  const { recordCompletion, isRecording } = useRecordDiagnosticCompletion();
  const submitDiagnostic = useSubmitDiagnostic();

  // Get pending courses (enrolled but not completed diagnostic)
  const pendingCourses = useMemo(() => {
    return enrollments
      .filter(e => !completedCourseIds.has(e.course_pack_id))
      .map(e => ({
        id: e.course_pack_id,
        title: (e.course_packs as { title?: string })?.title || "Unknown Course",
      }));
  }, [enrollments, completedCourseIds]);

  // Current course being diagnosed
  const currentCourse = pendingCourses[currentCourseIndex];

  // Fetch diagnostic data for current course
  const { data: diagnosticData, isLoading: isLoadingDiagnostic } = useDiagnosticData(currentCourse?.id || null);

  // Build course info with question counts
  const coursesWithInfo = useMemo((): CourseWithDiagnostic[] => {
    return pendingCourses.map(course => {
      // We only have data for the current course
      if (course.id === currentCourse?.id && diagnosticData) {
        return {
          ...course,
          hasQuestions: (diagnosticData.questions?.length || 0) > 0,
          questionCount: diagnosticData.questions?.length || 0,
        };
      }
      return {
        ...course,
        hasQuestions: true, // Assume true until loaded
        questionCount: 0,
      };
    });
  }, [pendingCourses, currentCourse, diagnosticData]);

  const currentCourseInfo = coursesWithInfo[currentCourseIndex];
  const questions = diagnosticData?.questions || [];
  const currentQuestion = questions[currentQuestionIndex];

  // Handle skipping diagnostic for current course
  const handleSkipCourse = useCallback(async () => {
    if (!currentCourse) return;

    await recordCompletion({
      coursePackId: currentCourse.id,
      questionsAnswered: 0,
      questionsCorrect: 0,
      skipped: true,
    });

    if (currentCourseIndex < pendingCourses.length - 1) {
      setCurrentCourseIndex(prev => prev + 1);
      setCurrentQuestionIndex(0);
      setSessionResults({ correct: 0, total: 0 });
      setDiagnosticResults([]);
    } else {
      navigate("/study", { replace: true });
    }
  }, [currentCourse, currentCourseIndex, pendingCourses.length, recordCompletion, navigate]);

  // Handle auto-completing course with no questions
  const handleAutoCompleteCourse = useCallback(async () => {
    if (!currentCourse) return;

    await recordCompletion({
      coursePackId: currentCourse.id,
      questionsAnswered: 0,
      questionsCorrect: 0,
      skipped: false,
    });

    if (currentCourseIndex < pendingCourses.length - 1) {
      setCurrentCourseIndex(prev => prev + 1);
      setCurrentQuestionIndex(0);
    } else {
      navigate("/study", { replace: true });
    }
  }, [currentCourse, currentCourseIndex, pendingCourses.length, recordCompletion, navigate]);

  // Start diagnostic for current course
  const handleStartDiagnostic = useCallback(() => {
    if (!diagnosticData?.questions || diagnosticData.questions.length === 0) {
      // No questions - auto complete
      handleAutoCompleteCourse();
      return;
    }
    setDiagnosticState("playing");
    setCurrentQuestionIndex(0);
    setSessionResults({ correct: 0, total: 0 });
    setDiagnosticResults([]);
    questionStartTime.current = Date.now();
  }, [diagnosticData, handleAutoCompleteCourse]);

  // Handle question completion
  const handleQuestionComplete = useCallback(
    async (result: {
      isCorrect: boolean;
      confidence: number | null;
      hintsUsed: boolean;
      guideUsed: boolean;
      skipped: boolean;
      selectedChoiceId: string | null;
    }) => {
      if (!currentQuestion || !diagnosticData) return;

      // Record topic result
      const topicId = diagnosticData.topicDetails?.find(d => d.question.id === currentQuestion.id)?.topicId;
      const newDiagnosticResults = topicId
        ? [...diagnosticResults, { topicId, isCorrect: result.isCorrect }]
        : diagnosticResults;
      setDiagnosticResults(newDiagnosticResults);

      const newSessionResults = {
        correct: sessionResults.correct + (result.isCorrect ? 1 : 0),
        total: sessionResults.total + 1,
      };
      setSessionResults(newSessionResults);

      if (currentQuestionIndex < questions.length - 1) {
        // More questions in this course
        setCurrentQuestionIndex(prev => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        // Course diagnostic complete
        await submitDiagnostic.mutateAsync({ results: newDiagnosticResults });
        await recordCompletion({
          coursePackId: currentCourse!.id,
          questionsAnswered: newSessionResults.total,
          questionsCorrect: newSessionResults.correct,
          skipped: false,
        });

        if (currentCourseIndex < pendingCourses.length - 1) {
          // More courses to diagnose
          setCurrentCourseIndex(prev => prev + 1);
          setDiagnosticState("overview");
          setCurrentQuestionIndex(0);
          setSessionResults({ correct: 0, total: 0 });
          setDiagnosticResults([]);
        } else {
          // All courses complete
          setDiagnosticState("complete");
        }
      }
    },
    [currentQuestion, diagnosticData, diagnosticResults, sessionResults, currentQuestionIndex, questions.length, currentCourseIndex, pendingCourses.length, currentCourse, submitDiagnostic, recordCompletion]
  );

  // Handle multi-part question completion
  const handleMultiPartComplete = useCallback(
    async (results: SubpartResult[]) => {
      if (!currentQuestion || !diagnosticData) return;

      const allCorrect = results.every(r => r.isCorrect);
      const topicId = diagnosticData.topicDetails?.find(d => d.question.id === currentQuestion.id)?.topicId;
      const newDiagnosticResults = topicId
        ? [...diagnosticResults, { topicId, isCorrect: allCorrect }]
        : diagnosticResults;
      setDiagnosticResults(newDiagnosticResults);

      const newSessionResults = {
        correct: sessionResults.correct + (allCorrect ? 1 : 0),
        total: sessionResults.total + 1,
      };
      setSessionResults(newSessionResults);

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        questionStartTime.current = Date.now();
      } else {
        await submitDiagnostic.mutateAsync({ results: newDiagnosticResults });
        await recordCompletion({
          coursePackId: currentCourse!.id,
          questionsAnswered: newSessionResults.total,
          questionsCorrect: newSessionResults.correct,
          skipped: false,
        });

        if (currentCourseIndex < pendingCourses.length - 1) {
          setCurrentCourseIndex(prev => prev + 1);
          setDiagnosticState("overview");
          setCurrentQuestionIndex(0);
          setSessionResults({ correct: 0, total: 0 });
          setDiagnosticResults([]);
        } else {
          setDiagnosticState("complete");
        }
      }
    },
    [currentQuestion, diagnosticData, diagnosticResults, sessionResults, currentQuestionIndex, questions.length, currentCourseIndex, pendingCourses.length, currentCourse, submitDiagnostic, recordCompletion]
  );

  // Loading state
  if (isLoadingEnrollments || isLoadingCompletions) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No pending courses - shouldn't happen due to guard, but handle gracefully
  if (pendingCourses.length === 0) {
    navigate("/study", { replace: true });
    return null;
  }

  // COMPLETE state
  if (diagnosticState === "complete") {
    return (
      <PageTransition className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-6"
        >
          <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Diagnostics Complete!</h1>
            <p className="text-muted-foreground">
              We've calibrated your study plan based on your current knowledge.
              Your personalized recommendations are ready.
            </p>
          </div>
          <Button size="lg" onClick={() => navigate("/study", { replace: true })} className="gap-2">
            Start Studying
            <ChevronRight className="h-4 w-4" />
          </Button>
        </motion.div>
      </PageTransition>
    );
  }

  // PLAYING state
  if (diagnosticState === "playing" && currentQuestion) {
    const hasSubparts = currentQuestion.subparts && Array.isArray(currentQuestion.subparts) && currentQuestion.subparts.length > 0;
    const progressPercent = ((currentQuestionIndex) / questions.length) * 100;

    return (
      <div className="flex flex-col h-full min-h-screen">
        {/* Header */}
        <div className="px-4 py-3 border-b bg-card/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setDiagnosticState("overview")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-sm font-medium">{currentCourse?.title}</p>
              <p className="text-xs text-muted-foreground">
                Question {currentQuestionIndex + 1} of {questions.length}
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Course {currentCourseIndex + 1} of {pendingCourses.length}
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-2 border-b">
          <Progress value={progressPercent} className="h-1.5" />
        </div>

        {/* Question */}
        <PageTransition className="flex-1 p-4 overflow-auto">
          <AnimatePresence mode="wait">
            {hasSubparts ? (
              <MultiPartQuestionPlayer
                key={`multi-${currentQuestion.id}`}
                question={currentQuestion}
                questionNumber={currentQuestionIndex + 1}
                totalQuestions={questions.length}
                onComplete={handleMultiPartComplete}
                onSimilar={() => {}}
              />
            ) : (
              <QuestionPlayer
                key={currentQuestion.id}
                question={currentQuestion}
                questionNumber={currentQuestionIndex + 1}
                totalQuestions={questions.length}
                onComplete={handleQuestionComplete}
                onSimilar={() => {}}
              />
            )}
          </AnimatePresence>
        </PageTransition>
      </div>
    );
  }

  // OVERVIEW state (default)
  return (
    <PageTransition className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Diagnostic Quiz</h1>
          <p className="text-muted-foreground">
            Let's see what you already know so we can personalize your study plan.
          </p>
        </div>

        {/* Course progress indicator */}
        {pendingCourses.length > 1 && (
          <div className="flex items-center justify-center gap-2">
            {pendingCourses.map((course, idx) => (
              <div
                key={course.id}
                className={cn(
                  "w-2.5 h-2.5 rounded-full transition-colors",
                  idx < currentCourseIndex
                    ? "bg-success"
                    : idx === currentCourseIndex
                    ? "bg-primary"
                    : "bg-border"
                )}
              />
            ))}
          </div>
        )}

        {/* Current course card */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{currentCourse?.title}</h2>
              {isLoadingDiagnostic ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading questions...
                </p>
              ) : diagnosticData?.questions && diagnosticData.questions.length > 0 ? (
                <p className="text-sm text-muted-foreground mt-1">
                  {diagnosticData.questions.length} questions covering {diagnosticData.topicCount || diagnosticData.questions.length} topics
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  No topics covered yet - will be auto-completed
                </p>
              )}
            </div>
          </div>

          {/* Estimated time */}
          {diagnosticData?.questions && diagnosticData.questions.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Estimated time: ~{Math.max(2, Math.round(diagnosticData.questions.length * 1.5))} minutes
            </p>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              size="lg"
              onClick={handleStartDiagnostic}
              disabled={isLoadingDiagnostic || isRecording}
              className="flex-1 gap-2"
            >
              {isLoadingDiagnostic ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : diagnosticData?.questions && diagnosticData.questions.length > 0 ? (
                <>
                  Start Diagnostic
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>

            {diagnosticData?.questions && diagnosticData.questions.length > 0 && (
              <Button
                variant="ghost"
                size="lg"
                onClick={handleSkipCourse}
                disabled={isRecording}
                className="text-muted-foreground hover:text-foreground"
              >
                {isRecording ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Skip for now"
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Skip warning */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted border border-border">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">About skipping</p>
            <p className="text-muted-foreground mt-1">
              Skipping the diagnostic means your study plan won't be personalized to your current knowledge.
              You can always take it later from Settings.
            </p>
          </div>
        </div>

        {/* Remaining courses */}
        {pendingCourses.length > 1 && currentCourseIndex < pendingCourses.length - 1 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Coming up next:</p>
            <div className="space-y-2">
              {pendingCourses.slice(currentCourseIndex + 1).map(course => (
                <div
                  key={course.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="p-2 rounded-lg bg-muted">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm">{course.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
