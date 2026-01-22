import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFocusContext } from '@/contexts/FocusContext';
import { useCourses, useUpcomingExams } from '@/hooks/use-focus';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface StudyFocusBarProps {
  overdueCount: number;
  className?: string;
}

export function StudyFocusBar({ overdueCount, className }: StudyFocusBarProps) {
  const navigate = useNavigate();
  const { filters } = useFocusContext();
  const { data: courses = [] } = useCourses();
  const { data: upcomingExams = [] } = useUpcomingExams(filters.courseIds);

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
        'flex items-center gap-3 flex-wrap',
        className
      )}
    >
      {/* Course pill */}
      <span className="text-meta font-medium text-foreground bg-muted px-2.5 py-1 rounded-md">
        {courseLabel}
      </span>

      {/* Next exam */}
      {nextExam && (
        <span className={cn(
          'text-meta px-2.5 py-1 rounded-md flex items-center gap-1.5',
          nextExam.isUrgent 
            ? 'text-warning bg-warning/10 font-medium' 
            : 'text-muted-foreground bg-muted'
        )}>
          <Calendar className="h-3 w-3" />
          <span className="truncate max-w-[100px]">{nextExam.title}</span>
          <span className={nextExam.isUrgent ? 'font-semibold' : ''}>{nextExam.daysText}</span>
        </span>
      )}

      {/* Overdue reviews */}
      {overdueCount > 0 && (
        <span className="text-meta text-warning bg-warning/10 px-2.5 py-1 rounded-md flex items-center gap-1.5 font-medium">
          <RefreshCw className="h-3 w-3" />
          {overdueCount} due
        </span>
      )}

      {/* Change focus button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/study/focus')}
        className="ml-auto gap-1.5 text-muted-foreground hover:text-foreground h-7"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Change focus</span>
      </Button>
    </motion.div>
  );
}
