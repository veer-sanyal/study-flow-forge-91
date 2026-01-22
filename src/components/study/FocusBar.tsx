import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, ChevronRight, Settings2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill, ProgressRing } from "@/components/ui/primitives";
import { useFocusContext } from "@/contexts/FocusContext";
import { useCourses, useUpcomingExams } from "@/hooks/use-focus";
import { cn } from "@/lib/utils";

interface FocusBarProps {
  className?: string;
  showProgress?: boolean;
  questionsCompleted?: number;
  questionsTotal?: number;
}

export function FocusBar({
  className,
  showProgress = false,
  questionsCompleted = 0,
  questionsTotal = 10,
}: FocusBarProps) {
  const navigate = useNavigate();
  const { filters, hasActiveFilters } = useFocusContext();
  const { data: courses = [] } = useCourses();
  const { data: upcomingExams = [] } = useUpcomingExams(filters.courseIds);

  // Get selected course name(s)
  const courseLabel = useMemo(() => {
    if (filters.courseIds.length === 0) return "All Courses";
    if (filters.courseIds.length === 1) {
      const course = courses.find(c => c.id === filters.courseIds[0]);
      return course?.title || "1 Course";
    }
    return `${filters.courseIds.length} Courses`;
  }, [filters.courseIds, courses]);

  // Get next exam for selected courses
  const nextExam = useMemo(() => {
    const upcoming = upcomingExams
      .filter(e => e.daysUntil !== null && e.daysUntil >= 0)
      .sort((a, b) => (a.daysUntil ?? 999) - (b.daysUntil ?? 999))[0];
    
    if (!upcoming) return null;
    
    return {
      title: upcoming.title,
      daysUntil: upcoming.daysUntil,
    };
  }, [upcomingExams]);

  // Progress percentage
  const progressPercent = questionsTotal > 0 
    ? Math.round((questionsCompleted / questionsTotal) * 100) 
    : 0;

  const handleChangeFocus = () => {
    navigate("/study/focus");
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 bg-elevated shadow-elevated border-b border-border",
        "overflow-x-auto scrollbar-hide",
        className
      )}
    >
      {/* Course + Exam info */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="font-medium text-body truncate">{courseLabel}</span>
        
        {nextExam && (
          <>
            <span className="text-muted-foreground">•</span>
            <Pill 
              variant={nextExam.daysUntil !== null && nextExam.daysUntil <= 3 ? "warning" : "muted"}
              size="sm"
            >
              <Calendar className="h-3 w-3" />
              {nextExam.title}
              {nextExam.daysUntil !== null && (
                <span className="font-semibold">
                  {nextExam.daysUntil === 0
                    ? "today"
                    : nextExam.daysUntil === 1
                    ? "tomorrow"
                    : `in ${nextExam.daysUntil}d`}
                </span>
              )}
            </Pill>
          </>
        )}

        {/* Active filters indicator */}
        {hasActiveFilters && filters.topicIds.length > 0 && (
          <Pill variant="primary" size="sm">
            {filters.topicIds.length} topic{filters.topicIds.length > 1 ? "s" : ""}
          </Pill>
        )}
      </div>

      {/* Progress ring (optional) */}
      {showProgress && questionsTotal > 0 && (
        <div className="flex items-center gap-2 shrink-0">
          <ProgressRing value={progressPercent} size={32} strokeWidth={3} showValue={false} />
          <span className="text-meta tabular-nums">
            {questionsCompleted}/{questionsTotal}
          </span>
        </div>
      )}

      {/* Change Focus button */}
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={handleChangeFocus}
      >
        <Settings2 className="h-4 w-4" />
        <span className="hidden sm:inline">Focus</span>
      </Button>
    </div>
  );
}
