import { motion } from 'framer-motion';
import { Calendar, ChevronRight, Sparkles, Clock, CheckCircle, Settings2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ProgressRing } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { TodayPlanSummary } from '@/hooks/use-study-dashboard';

interface TodayPlanCardProps {
  stats: TodayPlanSummary;
  isLoading?: boolean;
  onStart: () => void;
  onCustomize?: () => void;
}

export function TodayPlanCard({ stats, isLoading, onStart, onCustomize }: TodayPlanCardProps) {
  const isComplete = stats.completedQuestions >= stats.totalQuestions && stats.totalQuestions > 0;
  const remaining = Math.max(0, stats.totalQuestions - stats.completedQuestions);
  const hasProgress = stats.completedQuestions > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
      className={cn(
        'relative overflow-hidden rounded-xl',
        'bg-surface border border-border',
        'shadow-raised',
        isComplete && 'ring-2 ring-success/20'
      )}
    >
      {/* Hero header accent line */}
      <div className="h-1 bg-primary" />

      <div className="relative p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Calendar className="h-4 w-4" />
              </div>
              <h2 className="text-h2 font-semibold tracking-tight">Today's Plan</h2>
            </div>
            {stats.primaryCourse ? (
              <p className="text-meta text-muted-foreground pl-[38px]">
                {stats.primaryCourse.title}
              </p>
            ) : (
              <p className="text-meta text-muted-foreground pl-[38px]">
                Your personalized study session
              </p>
            )}
          </div>
          
          {/* Progress ring or completion badge */}
          {isComplete ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 text-success">
              <CheckCircle className="h-4 w-4" />
              <span className="text-meta font-semibold">Complete</span>
            </div>
          ) : (
            <ProgressRing 
              value={stats.progressPercent} 
              size={48}
              strokeWidth={4}
              className="shrink-0"
            />
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-body">
          <span>
            <span className="font-semibold text-foreground">{remaining}</span>
            <span className="text-muted-foreground ml-1">question{remaining !== 1 ? 's' : ''}</span>
          </span>
          <span className="text-border">•</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            ~{stats.estimatedMinutes} min
          </span>
        </div>

        {/* Progress bar - only show if there's progress */}
        {hasProgress && !isComplete && (
          <div className="space-y-1.5">
            <Progress value={stats.progressPercent} className="h-2" />
            <div className="flex items-center justify-between text-meta text-muted-foreground">
              <span>
                {stats.completedQuestions} of {stats.totalQuestions} completed
              </span>
              {stats.correctCount > 0 && (
                <span className="text-success font-medium">
                  {stats.correctCount} correct
                </span>
              )}
            </div>
          </div>
        )}

        {/* Why these questions + closure message */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Based on your weak topics + upcoming schedule</span>
          </div>
          {!isComplete && remaining <= stats.totalQuestions && (
            <p className="text-meta text-muted-foreground/70 pl-[18px]">
              Finish this and you'll be caught up for today
            </p>
          )}
        </div>

        {/* CTA Buttons */}
        {!isComplete && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="default"
              onClick={onStart}
              disabled={isLoading}
              className="gap-1.5 shadow-sm"
            >
              {hasProgress ? 'Continue' : 'Start Today\'s Plan'}
              <ChevronRight className="h-4 w-4" />
            </Button>
            {onCustomize && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCustomize}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Customize
              </Button>
            )}
          </div>
        )}

        {/* Completed state */}
        {isComplete && (
          <div className="pt-1">
            <p className="text-body text-success font-medium">
              🎉 Great work! You've completed your daily goal.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
