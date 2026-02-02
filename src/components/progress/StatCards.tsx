import { motion } from 'framer-motion';
import { Clock, AlertTriangle, Shield, Brain, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
}

export function StatCards({ summary }: StatCardsProps): React.ReactElement {
  const prefersReducedMotion = useReducedMotion();

  const stats: StatDef[] = [
    {
      label: 'Due Today',
      value: String(summary.totalDueToday),
      subtitle: `~${estimateReviewMinutes(summary.totalDueToday)} min`,
      icon: <Clock className="h-5 w-5 text-primary" />,
    },
    {
      label: 'At-Risk',
      value: String(summary.atRiskTopicCount),
      subtitle: 'below target',
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      highlight: summary.atRiskTopicCount > 0,
    },
    {
      label: 'Median Stability',
      value: `S50 = ${formatStability(summary.globalMedianStability)}`,
      subtitle: 'long-term strength',
      icon: <Shield className="h-5 w-5 text-primary" />,
    },
    {
      label: 'Median Difficulty',
      value: `D50 = ${formatDifficulty(summary.globalMedianDifficulty)}`,
      subtitle: 'inherent hardness',
      icon: <Brain className="h-5 w-5 text-primary" />,
    },
    {
      label: 'Observed Recall',
      value: summary.observedRecall != null
        ? `${Math.round(summary.observedRecall * 100)}%`
        : '--',
      subtitle: `vs ${Math.round(summary.targetRetention * 100)}% target`,
      icon: <Target className="h-5 w-5 text-primary" />,
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
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 md:grid-cols-5 gap-3"
    >
      {stats.map((stat) => (
        <motion.div key={stat.label} variants={itemVariants}>
          <Card className={cn(
            'h-full',
            stat.highlight && 'border-amber-500/50',
          )}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  stat.highlight ? 'bg-amber-500/10' : 'bg-primary/10',
                )}>
                  {stat.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold truncate">{stat.value}</p>
                  <p className="text-xs text-muted-foreground truncate">{stat.subtitle}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
