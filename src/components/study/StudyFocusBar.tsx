import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, RefreshCw, Settings2, ChevronRight, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pill } from '@/components/ui/primitives';
import { useFocusContext } from '@/contexts/FocusContext';
import { useCourses, useUpcomingExams } from '@/hooks/use-focus';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface StudyFocusBarProps {
  overdueCount: number;
  className?: string;
}

// Rotating tips for the delight element
const TIPS = [
  "Small sessions, big progress.",
  "Consistency beats intensity.",
  "Review what's due, learn what's new.",
  "Every question counts.",
  "Progress is progress, no matter how small.",
];

export function StudyFocusBar({ overdueCount, className }: StudyFocusBarProps) {
  const navigate = useNavigate();
  const { filters } = useFocusContext();
  const { data: courses = [] } = useCourses();
  const { data: upcomingExams = [] } = useUpcomingExams(filters.courseIds);

  // Get current tip based on day
  const tip = useMemo(() => {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return TIPS[dayOfYear % TIPS.length];
  }, []);

  // Get selected course name
  const courseLabel = useMemo(() => {
    if (filters.courseIds.length === 0) return 'All Courses';
    if (filters.courseIds.length === 1) {
      const course = courses.find(c => c.id === filters.courseIds[0]);
      return course?.title || '1 Course';
    }
    return `${filters.courseIds.length} Courses`;
  }, [filters.courseIds, courses]);

  // Get next exam
  const nextExam = useMemo(() => {
    const upcoming = upcomingExams
      .filter(e => e.daysUntil !== null && e.daysUntil >= 0)
      .sort((a, b) => (a.daysUntil ?? 999) - (b.daysUntil ?? 999))[0];
    
    if (!upcoming) return null;
    
    const daysText = upcoming.daysUntil === 0 ? 'today' :
                     upcoming.daysUntil === 1 ? 'tomorrow' :
                     `in ${upcoming.daysUntil}d`;
    
    return {
      title: upcoming.title,
      daysText,
      isUrgent: upcoming.daysUntil !== null && upcoming.daysUntil <= 3,
    };
  }, [upcomingExams]);

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.fast, ease: easing.easeOut }}
      className={cn(
        'flex flex-col gap-3 p-4 rounded-xl',
        'bg-gradient-to-r from-muted/50 via-muted/30 to-transparent',
        'border border-border/50',
        className
      )}
    >
      {/* Main focus bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Course pill */}
        <Pill variant="primary" size="md" className="font-medium">
          {courseLabel}
        </Pill>

        {/* Next exam */}
        {nextExam && (
          <Pill 
            variant={nextExam.isUrgent ? 'warning' : 'muted'} 
            size="md"
          >
            <Calendar className="h-3.5 w-3.5" />
            <span className="truncate max-w-[120px]">{nextExam.title}</span>
            <span className="font-semibold">{nextExam.daysText}</span>
          </Pill>
        )}

        {/* Overdue reviews */}
        {overdueCount > 0 && (
          <Pill variant="warning" size="md">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{overdueCount} review{overdueCount !== 1 ? 's' : ''} due</span>
          </Pill>
        )}

        {/* Change focus button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/study/focus')}
          className="ml-auto gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Change focus</span>
        </Button>
      </div>

      {/* Delight: Tip of the day */}
      <div className="flex items-center gap-2 text-meta text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-primary/70" />
        <span className="italic">{tip}</span>
      </div>
    </motion.div>
  );
}
