import { motion } from 'framer-motion';
import { Clock, AlertTriangle, Shield, Brain, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { type ProgressSummary } from '@/types/progress';
import { formatStability, formatDifficulty, estimateReviewMinutes } from '@/lib/fsrs-stats';

interface StatCardsProps {
  summary: ProgressSummary;
}

interface StatDef {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  highlight?: boolean;
  tooltip: string;
}

export function StatCards({ summary }: StatCardsProps): React.ReactElement {
  const prefersReducedMotion = useReducedMotion();

  const stats: StatDef[] = [
    {
      label: 'Due Today',
      value: String(summary.totalDueToday),
      subtitle: `~${estimateReviewMinutes(summary.totalDueToday)} min`,
      icon: <Clock className="h-4 w-4 text-primary" />,
      tooltip: 'Cards scheduled for review today based on spaced repetition. Reviewing these maintains your memory.',
    },
    {
      label: 'At-Risk',
      value: String(summary.atRiskTopicCount),
      subtitle: 'below target',
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      highlight: summary.atRiskTopicCount > 0,
      tooltip: 'Topics where your estimated recall has dropped below 90%. These need review soon.',
    },
    {
      label: 'Stability',
      value: formatStability(summary.globalMedianStability),
      subtitle: 'long-term',
      icon: <Shield className="h-4 w-4 text-primary" />,
      tooltip: 'Median time before you\u2019d forget a card to 90% recall. Higher = stronger long-term memory.',
    },
    {
      label: 'Difficulty',
      value: formatDifficulty(summary.globalMedianDifficulty),
      subtitle: 'median',
      icon: <Brain className="h-4 w-4 text-primary" />,
      tooltip: 'How hard your cards are on a 0\u201310 scale. Higher means more frequent reviews needed.',
    },
    {
      label: 'Recall',
      value: summary.observedRecall != null
        ? `${Math.round(summary.observedRecall * 100)}%`
        : '--',
      subtitle: `vs ${Math.round(summary.targetRetention * 100)}%`,
      icon: <Target className="h-4 w-4 text-primary" />,
      tooltip: 'Your actual accuracy over the selected time period compared to the 90% target.',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: prefersReducedMotion ? 0 : 0.04 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  };

  return (
    <TooltipProvider>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-5 gap-2"
      >
        {stats.map((stat) => (
          <motion.div key={stat.label} variants={itemVariants}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Card className={cn(
                  'h-full cursor-default',
                  stat.highlight && 'border-amber-500/50',
                )}>
                  <CardContent className="p-2 sm:p-3">
                    <div className="flex flex-col items-center text-center gap-1">
                      <div className={cn(
                        'p-1.5 rounded-lg',
                        stat.highlight ? 'bg-amber-500/10' : 'bg-primary/10',
                      )}>
                        {stat.icon}
                      </div>
                      <p className="text-sm sm:text-lg font-bold leading-tight">{stat.value}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{stat.subtitle}</p>
                    </div>
                  </CardContent>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{stat.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        ))}
      </motion.div>
    </TooltipProvider>
  );
}
