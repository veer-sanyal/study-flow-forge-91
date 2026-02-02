import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type TopicProgressRow } from '@/types/progress';
import { riskColorClass, formatStability, formatDifficulty } from '@/lib/fsrs-stats';

interface TopicRiskRowProps {
  topic: TopicProgressRow;
  isExpanded: boolean;
  onToggle: () => void;
  onPractice: (topicId: string) => void;
}

export function TopicRiskRow({
  topic,
  isExpanded,
  onToggle,
  onPractice,
}: TopicRiskRowProps): React.ReactElement {
  const hasData = topic.total_reps > 0;
  const lowData = topic.total_reps < 5;

  return (
    <div className="border rounded-lg bg-card">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-muted/50 transition-colors rounded-lg"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{topic.topic_title}</span>

            {/* R chip */}
            {topic.r_now != null && (
              <Badge
                variant="outline"
                className={cn('text-xs font-mono', riskColorClass(topic.risk))}
              >
                R: {Math.round(topic.r_now * 100)}%
              </Badge>
            )}

            {/* S50 chip */}
            {topic.median_stability != null && topic.median_stability > 0 && (
              <Badge variant="outline" className="text-xs font-mono">
                S: {formatStability(topic.median_stability)}
              </Badge>
            )}

            {/* D50 chip */}
            {topic.median_difficulty != null && (
              <Badge variant="outline" className="text-xs font-mono">
                D: {formatDifficulty(topic.median_difficulty)}
              </Badge>
            )}

            {/* Due badge */}
            {topic.due_today > 0 && (
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                {topic.due_today} due
              </Badge>
            )}

            {/* Confidence indicator */}
            {lowData && hasData && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                low data
              </Badge>
            )}
            {!hasData && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                new
              </Badge>
            )}
            {hasData && !lowData && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                n={topic.total_cards}, {topic.total_reps} reviews
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180',
          )}
        />
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {/* Weak-tail stability */}
                <div>
                  <p className="text-muted-foreground">S10 (weak tail)</p>
                  <p className="font-medium font-mono">
                    {formatStability(topic.p10_stability)}
                  </p>
                </div>

                {/* Card state breakdown */}
                <div>
                  <p className="text-muted-foreground">Card states</p>
                  <p className="font-medium">
                    {topic.new_cards} new / {topic.learning_cards} learning / {topic.review_cards} review
                  </p>
                </div>

                {/* Lapses */}
                <div>
                  <p className="text-muted-foreground">Total lapses</p>
                  <p className="font-medium font-mono">{topic.total_lapses}</p>
                </div>

                {/* Accuracy in window */}
                <div>
                  <p className="text-muted-foreground">Recent accuracy</p>
                  <p className="font-medium font-mono">
                    {topic.attempts_count > 0
                      ? `${Math.round((topic.correct_count / topic.attempts_count) * 100)}%`
                      : '--'}
                    {topic.attempts_count > 0 && (
                      <span className="text-muted-foreground text-xs ml-1">
                        ({topic.correct_count}/{topic.attempts_count})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onPractice(topic.topic_id);
                }}
              >
                Practice this topic
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
