import { motion } from 'framer-motion';
import { Trophy, ArrowRight, Target, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/primitives';
import { SessionProgressDots } from './SessionProgressDots';
import { fadeSlideUp, scaleIn, duration, easing, stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface CompletionSuggestion {
  id: string;
  label: string;
  description?: string;
  icon: 'arrow' | 'target' | 'refresh';
  onClick: () => void;
}

interface CompletionCardProps {
  title: string;
  subtitle: string;
  correctCount: number;
  totalCount: number;
  suggestions: CompletionSuggestion[];
  onDone: () => void;
  variant?: 'plan_complete' | 'session_pause';
  outcomes?: Record<number, 'correct' | 'incorrect' | 'skipped'>;
  totalQuestions?: number;
}

const suggestionIcons = {
  arrow: ArrowRight,
  target: Target,
  refresh: RefreshCw,
};

export function CompletionCard({
  title,
  subtitle,
  correctCount,
  totalCount,
  suggestions,
  onDone,
  variant = 'plan_complete',
  outcomes = {},
  totalQuestions,
}: CompletionCardProps) {
  const isPlanComplete = variant === 'plan_complete';
  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const dotCount = totalQuestions ?? totalCount;

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.slow, ease: easing.easeOut }}
      className="flex flex-col items-center justify-center py-8 px-4 space-y-6 text-center max-w-md mx-auto"
    >
      {/* Session arc — dots showing outcome of each question */}
      {dotCount > 0 && (
        <motion.div
          {...scaleIn}
          transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.05 }}
          className="w-full"
        >
          <SessionProgressDots
            totalQuestions={dotCount}
            currentIndex={-1}
            outcomes={outcomes}
          />
        </motion.div>
      )}

      {/* Score ring + fraction */}
      <motion.div
        {...scaleIn}
        transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.1 }}
        className="flex items-center gap-4"
      >
        <ProgressRing
          value={accuracy}
          size={72}
          strokeWidth={6}
        />
        <div className="text-left">
          <p className="text-h1 font-bold tabular-nums leading-none">
            {correctCount}/{totalCount}
          </p>
          <p className="text-meta text-muted-foreground mt-0.5">correct</p>
        </div>
      </motion.div>

      {/* Title and subtitle */}
      <motion.div
        {...fadeSlideUp}
        transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.2 }}
        className="space-y-2"
      >
        <h1 className="text-2xl font-bold tracking-tight flex items-center justify-center gap-2">
          <Trophy className={cn('h-4 w-4', isPlanComplete ? 'text-success' : 'text-primary')} />
          {title}
        </h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </motion.div>

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <motion.div
          className="w-full space-y-2"
          initial="initial"
          animate="animate"
          variants={{
            animate: {
              transition: {
                staggerChildren: stagger.normal,
                delayChildren: 0.3,
              },
            },
          }}
        >
          <p className="text-sm font-medium text-muted-foreground mb-3">
            Want to continue?
          </p>
          {suggestions.map((suggestion) => {
            const Icon = suggestionIcons[suggestion.icon];
            return (
              <motion.div key={suggestion.id} variants={fadeSlideUp}>
                <Button
                  variant="outline"
                  className="w-full justify-between h-auto py-3 px-4"
                  onClick={suggestion.onClick}
                >
                  <div className="flex items-center gap-3 text-left">
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <span className="font-medium">{suggestion.label}</span>
                      {suggestion.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {suggestion.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Done button */}
      <motion.div
        {...fadeSlideUp}
        transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.5 }}
        className="w-full pt-2"
      >
        <Button
          variant="ghost"
          className="w-full gap-2 text-muted-foreground"
          onClick={onDone}
        >
          <Home className="h-4 w-4" />
          {isPlanComplete ? 'Done for Today' : 'End Session'}
        </Button>
      </motion.div>
    </motion.div>
  );
}
