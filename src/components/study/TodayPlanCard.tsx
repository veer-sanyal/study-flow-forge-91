import { motion } from 'framer-motion';
import { Clock, CheckCircle, ChevronRight, Calendar } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/primitives';
import { fadeSlideUp, duration, easing, buttonPress } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { TodayPlanSummary } from '@/hooks/use-study-dashboard';

interface TodayPlanCardProps {
  stats: TodayPlanSummary;
  isLoading?: boolean;
  onStart: () => void;
}

export function TodayPlanCard({ stats, isLoading, onStart }: TodayPlanCardProps) {
  const isComplete = stats.completedQuestions >= stats.totalQuestions && stats.totalQuestions > 0;
  const remaining = Math.max(0, stats.totalQuestions - stats.completedQuestions);
  const hasProgress = stats.completedQuestions > 0;

  return (
    <motion.button
      {...fadeSlideUp}
      {...buttonPress}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
      onClick={onStart}
      disabled={isLoading || isComplete}
      className={cn(
        'relative w-full text-left overflow-hidden rounded-xl border bg-card',
        'shadow-sm hover:shadow-md transition-all',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        'group',
        (isLoading || isComplete) && 'opacity-60 cursor-not-allowed'
      )}
    >
      {/* Left accent strip - primary color */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex items-start gap-4 p-5 pl-6">
        {/* Icon */}
        <div className="shrink-0 p-2.5 rounded-lg bg-primary/10 text-primary">
          <Calendar className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h2 className="text-h3 font-semibold tracking-tight">Today's Plan</h2>
              {stats.primaryCourse ? (
                <p className="text-meta text-muted-foreground">
                  {stats.primaryCourse.title}
                </p>
              ) : (
                <p className="text-meta text-muted-foreground">
                  Your personalized study session
                </p>
              )}
            </div>
            
            {isComplete ? (
              <div className="flex items-center gap-1.5 text-success shrink-0">
                <CheckCircle className="h-5 w-5" />
                <span className="text-meta font-medium">Complete!</span>
              </div>
            ) : hasProgress ? (
              <ProgressRing 
                value={stats.progressPercent} 
                size={40}
                strokeWidth={4}
              />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 text-meta text-muted-foreground">
            <span className="font-medium text-foreground">
              {remaining} question{remaining !== 1 ? 's' : ''} left
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              ~{stats.estimatedMinutes} min
            </span>
          </div>

          {/* Progress bar - only show if there's progress */}
          {hasProgress && !isComplete && (
            <div className="space-y-1.5">
              <Progress value={stats.progressPercent} className="h-2" />
              <p className="text-meta text-muted-foreground">
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
            <div className="pt-2 border-t border-border/50">
              <p className="text-meta text-muted-foreground">
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

          {/* CTA - more prominent button style */}
          {!isComplete && (
            <div className="pt-1">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
                "bg-primary text-primary-foreground",
                "group-hover:bg-primary/90 transition-colors"
              )}>
                {hasProgress ? 'Continue studying' : 'Start studying'}
                <ChevronRight className="h-4 w-4" />
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
