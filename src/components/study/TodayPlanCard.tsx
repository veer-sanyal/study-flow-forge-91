import { motion } from 'framer-motion';
import { Clock, CheckCircle, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { TodayPlanStats } from '@/hooks/use-study-recommendations';

interface TodayPlanCardProps {
  stats: TodayPlanStats;
  isLoading?: boolean;
  onStart: () => void;
}

export function TodayPlanCard({ stats, isLoading, onStart }: TodayPlanCardProps) {
  const progressPercent = stats.totalQuestions > 0
    ? Math.round((stats.completedQuestions / stats.totalQuestions) * 100)
    : 0;

  const isComplete = stats.completedQuestions >= stats.totalQuestions;
  const remaining = Math.max(0, stats.totalQuestions - stats.completedQuestions);

  return (
    <motion.button
      {...fadeSlideUp}
      transition={{ duration: duration.slow, ease: easing.easeOut }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onStart}
      disabled={isLoading || isComplete}
      className={cn(
        'relative w-full text-left overflow-hidden rounded-xl border bg-card p-6',
        'shadow-sm hover:shadow-md transition-all',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        (isLoading || isComplete) && 'opacity-60 cursor-not-allowed'
      )}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Today's Plan</h2>
            {stats.primaryCourse ? (
              <p className="text-sm text-muted-foreground">
                {stats.primaryCourse.title}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your personalized study session
              </p>
            )}
          </div>
          
          {isComplete ? (
            <div className="flex items-center gap-1.5 text-success">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Complete!</span>
            </div>
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {remaining} question{remaining !== 1 ? 's' : ''}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            ~{stats.estimatedMinutes} min
          </span>
        </div>

        {/* Progress bar */}
        {stats.completedQuestions > 0 && (
          <div className="space-y-1.5">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {stats.completedQuestions} of {stats.totalQuestions} completed
              {stats.correctCount > 0 && (
                <span className="text-success ml-1">
                  • {stats.correctCount} correct
                </span>
              )}
            </p>
          </div>
        )}

        {/* Also due section */}
        {stats.alsoDueCourses.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              Also due:{' '}
              {stats.alsoDueCourses.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  {c.title} ({c.count})
                </span>
              ))}
            </p>
          </div>
        )}

        {/* Visual cue for clickability */}
        {!isComplete && (
          <div className="text-sm font-medium text-primary flex items-center gap-1">
            {stats.completedQuestions > 0 ? 'Continue' : 'Start studying'}
            <ChevronRight className="h-4 w-4" />
          </div>
        )}
      </div>
    </motion.button>
  );
}
