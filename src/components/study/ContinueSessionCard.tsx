import { motion } from 'framer-motion';
import { RotateCcw, ChevronRight, Clock } from 'lucide-react';
import { fadeSlideUp, duration, easing, buttonPress } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { LastSession } from '@/hooks/use-study-dashboard';
import { formatDistanceToNow } from 'date-fns';

interface ContinueSessionCardProps {
  session: LastSession;
  onContinue: () => void;
}

export function ContinueSessionCard({ session, onContinue }: ContinueSessionCardProps) {
  const timeAgo = formatDistanceToNow(session.timestamp, { addSuffix: true });
  const accuracy = session.totalAttempts > 0 
    ? Math.round((session.correctCount / session.totalAttempts) * 100)
    : 0;

  return (
    <motion.button
      {...fadeSlideUp}
      {...buttonPress}
      transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.15 }}
      onClick={onContinue}
      className={cn(
        'relative w-full text-left overflow-hidden rounded-xl border bg-card',
        'shadow-sm hover:shadow-md transition-all',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        'group'
      )}
    >
      {/* Left accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted-foreground/30 group-hover:bg-muted-foreground/50 transition-colors" />
      
      <div className="flex items-center gap-4 p-4 pl-5">
        {/* Icon */}
        <div className="shrink-0 p-2.5 rounded-lg bg-muted text-muted-foreground">
          <RotateCcw className="h-5 w-5" />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-body font-medium text-foreground truncate">
              Continue where you left off
            </h3>
          </div>
          
          <div className="flex items-center gap-3 text-meta text-muted-foreground">
            {session.courseTitle && (
              <span className="truncate max-w-[120px]">{session.courseTitle}</span>
            )}
            {session.topicTitle && (
              <>
                <span>•</span>
                <span className="truncate max-w-[100px]">{session.topicTitle}</span>
              </>
            )}
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </span>
          </div>

          {/* Session stats */}
          <p className="text-meta text-muted-foreground">
            Last session: {session.totalAttempts} questions • {accuracy}% correct
          </p>
        </div>

        {/* Chevron */}
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </motion.button>
  );
}
