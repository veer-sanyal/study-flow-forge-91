import { motion } from 'framer-motion';
import { Calendar, ChevronRight, Sparkles, Clock, CheckCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ProgressRing, Pill } from '@/components/ui/primitives';
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.slow, ease: easing.easeOut }}
      className={cn(
        'relative overflow-hidden rounded-2xl border-2 border-primary/20',
        'bg-gradient-to-br from-card via-card to-primary/5',
        'shadow-raised',
        isComplete && 'border-success/30'
      )}
    >
      {/* Hero header strip with gradient */}
      <div className="h-1.5 bg-gradient-to-r from-primary via-primary-glow to-primary" />
      
      {/* Decorative corner element */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.03] pointer-events-none">
        <Calendar className="w-full h-full" />
      </div>

      <div className="relative p-6 space-y-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Calendar className="h-5 w-5" />
              </div>
              <h2 className="text-h2 font-bold tracking-tight">Today's Plan</h2>
            </div>
            {stats.primaryCourse ? (
              <p className="text-body text-muted-foreground pl-11">
                {stats.primaryCourse.title}
              </p>
            ) : (
              <p className="text-body text-muted-foreground pl-11">
                Your personalized study session
              </p>
            )}
          </div>
          
          {/* Progress ring or completion badge */}
          {isComplete ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success">
              <CheckCircle className="h-5 w-5" />
              <span className="text-body font-semibold">Done!</span>
            </div>
          ) : (
            <ProgressRing 
              value={stats.progressPercent} 
              size={56}
              strokeWidth={5}
              className="shrink-0"
            />
          )}
        </div>

        {/* Stats row with pills */}
        <div className="flex items-center gap-3 flex-wrap">
          <Pill variant="default" size="md">
            <span className="font-semibold text-foreground">{remaining}</span>
            <span>question{remaining !== 1 ? 's' : ''} left</span>
          </Pill>
          <Pill variant="muted" size="md">
            <Clock className="h-3.5 w-3.5" />
            <span>~{stats.estimatedMinutes} min</span>
          </Pill>
        </div>

        {/* Progress bar - only show if there's progress */}
        {hasProgress && !isComplete && (
          <div className="space-y-2">
            <Progress value={stats.progressPercent} className="h-2.5" />
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

        {/* Why these questions? */}
        <div className="flex items-center gap-2 text-meta text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Based on your weak topics + upcoming schedule</span>
        </div>

        {/* Also due section */}
        {stats.alsoDueCourses.length > 0 && (
          <div className="pt-3 border-t border-border/50">
            <p className="text-meta text-muted-foreground">
              Also due:{' '}
              {stats.alsoDueCourses.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <span className="font-medium text-foreground">{c.title}</span> ({c.count})
                </span>
              ))}
            </p>
          </div>
        )}

        {/* CTA Buttons */}
        {!isComplete && (
          <div className="flex items-center gap-3 pt-2">
            <Button
              size="lg"
              onClick={onStart}
              disabled={isLoading}
              className="gap-2 flex-1 sm:flex-none shadow-sm"
            >
              {hasProgress ? 'Continue Today\'s Plan' : 'Start Today\'s Plan'}
              <ChevronRight className="h-4 w-4" />
            </Button>
            {onCustomize && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCustomize}
                className="text-muted-foreground hover:text-foreground"
              >
                Customize
              </Button>
            )}
          </div>
        )}

        {/* Completed state CTA */}
        {isComplete && (
          <div className="text-center py-2">
            <p className="text-body text-success font-medium mb-1">
              🎉 Great work! You've completed your daily goal.
            </p>
            <p className="text-meta text-muted-foreground">
              Keep practicing below to reinforce what you've learned.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
