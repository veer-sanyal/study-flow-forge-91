import { motion } from 'framer-motion';
import { RotateCcw, ChevronRight, Eye, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LastSession } from '@/hooks/use-study-dashboard';
import { formatDistanceToNow } from 'date-fns';

interface ContinueSessionCardProps {
  session: LastSession;
  onContinue: () => void;
  onReviewMistakes?: () => void;
}

export function ContinueSessionCard({ session, onContinue, onReviewMistakes }: ContinueSessionCardProps) {
  const timeAgo = formatDistanceToNow(session.timestamp, { addSuffix: true });
  const missedCount = session.totalAttempts - session.correctCount;
  const hasMistakes = missedCount > 0;
  
  // Estimate time for missed questions (1.5 min each)
  const estimatedMinutes = Math.ceil(missedCount * 1.5);

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.05 }}
      className={cn(
        'relative overflow-hidden rounded-xl',
        'bg-surface border border-border',
        'hover:shadow-surface transition-shadow'
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon badge */}
          <div className="shrink-0 p-2 rounded-lg bg-muted text-muted-foreground">
            <RotateCcw className="h-4 w-4" />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title */}
            <div>
              <h3 className="text-body font-medium text-foreground">
                Pick up where you left off
              </h3>
              <p className="text-meta text-muted-foreground">
                {hasMistakes ? (
                  <>
                    <span className="font-medium text-foreground">{missedCount} missed</span>
                    {' • '}est {estimatedMinutes} min
                  </>
                ) : (
                  <>{session.totalAttempts} questions {timeAgo}</>
                )}
              </p>
            </div>
            
            {/* Context pills */}
            {(session.courseTitle || session.topicTitle) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {session.courseTitle && (
                  <span className="text-meta text-muted-foreground bg-muted px-2 py-0.5 rounded truncate max-w-[140px]">
                    {session.courseTitle}
                  </span>
                )}
                {session.topicTitle && (
                  <span className="text-meta text-muted-foreground bg-muted px-2 py-0.5 rounded truncate max-w-[120px]">
                    {session.topicTitle}
                  </span>
                )}
              </div>
            )}

            {/* Actions - Review mistakes is primary when available */}
            <div className="flex items-center gap-2">
              {hasMistakes && onReviewMistakes ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onReviewMistakes}
                    className="gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Review {missedCount} mistake{missedCount !== 1 ? 's' : ''}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onContinue}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    Resume
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onContinue}
                  className="gap-1.5"
                >
                  Resume
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
