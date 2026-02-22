import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
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
    <TooltipProvider>
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={cn('text-xs font-mono cursor-default', riskColorClass(topic.risk))}
                  >
                    R: {Math.round(topic.r_now * 100)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Retrievability — estimated probability you can recall this topic right now.</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* S50 chip */}
            {topic.median_stability != null && topic.median_stability > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs font-mono cursor-default">
                    S: {formatStability(topic.median_stability)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Stability — how many days until recall drops to 90%. Higher is better.</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* D50 chip */}
            {topic.median_difficulty != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-xs font-mono cursor-default">
                    D: {formatDifficulty(topic.median_difficulty)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Difficulty — how challenging this topic is (0–10 scale).</p>
                </TooltipContent>
              </Tooltip>
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

      {/* Retention bar — Phase 3 signature */}
      <div className="h-0.5 w-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            topic.r_now == null ? "bg-muted" :
            topic.r_now >= 0.9 ? "bg-success" :
            topic.r_now >= 0.7 ? "bg-warning" : "bg-destructive"
          )}
          style={{ width: `${Math.round((topic.r_now ?? 0) * 100)}%` }}
        />
      </div>

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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-muted-foreground cursor-default">S10 (weak tail)</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">10th percentile stability — your weakest cards in this topic. Low values flag weak spots.</p>
                    </TooltipContent>
                  </Tooltip>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-muted-foreground cursor-default">Total lapses</p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Times you forgot a card after previously knowing it. High lapses suggest interference or insufficient review.</p>
                    </TooltipContent>
                  </Tooltip>
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
    </TooltipProvider>
  );
}
