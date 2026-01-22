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

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.1 }}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-surface',
        'shadow-surface hover:shadow-raised transition-shadow'
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon badge */}
          <div className="shrink-0 p-2.5 rounded-xl bg-muted text-muted-foreground">
            <RotateCcw className="h-5 w-5" />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title - forward-looking hook */}
            <div>
              <h3 className="text-body font-semibold text-foreground">
                Pick up where you left off
              </h3>
              <p className="text-meta text-muted-foreground">
                {session.totalAttempts} question{session.totalAttempts !== 1 ? 's' : ''} {timeAgo}
                {hasMistakes && (
                  <span> • We'll target the ones you missed</span>
                )}
              </p>
            </div>
            
            {/* Context pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {session.courseTitle && (
                <span className="text-meta text-muted-foreground bg-muted px-2 py-0.5 rounded-md truncate max-w-[140px]">
                  {session.courseTitle}
                </span>
              )}
              {session.topicTitle && (
                <span className="text-meta text-muted-foreground bg-muted px-2 py-0.5 rounded-md truncate max-w-[120px]">
                  {session.topicTitle}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={onContinue}
                className="gap-1.5"
              >
                Resume
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              
              {hasMistakes && onReviewMistakes && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onReviewMistakes}
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Review {missedCount} mistake{missedCount !== 1 ? 's' : ''}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
