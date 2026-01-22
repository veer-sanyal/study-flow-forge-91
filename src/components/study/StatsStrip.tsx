import { motion } from 'framer-motion';
import { Flame, Target, CheckCircle } from 'lucide-react';
import { fadeSlideUp, duration, easing, stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface StatsStripProps {
  streak: number;
  weeklyAccuracy: number;
  reviewsDue: number;
  questionsToday: number;
  className?: string;
}

export function StatsStrip({ 
  streak, 
  weeklyAccuracy, 
  reviewsDue, 
  questionsToday,
  className 
}: StatsStripProps) {
  const stats = [
    {
      id: 'streak',
      label: 'Day streak',
      value: streak,
      icon: Flame,
      color: streak > 0 ? 'text-warning' : 'text-muted-foreground',
      bgColor: streak > 0 ? 'bg-warning/10' : 'bg-muted',
    },
    {
      id: 'accuracy',
      label: '7-day accuracy',
      value: `${weeklyAccuracy}%`,
      icon: Target,
      color: weeklyAccuracy >= 70 ? 'text-success' : 'text-muted-foreground',
      bgColor: weeklyAccuracy >= 70 ? 'bg-success/10' : 'bg-muted',
    },
    {
      id: 'today',
      label: 'Today',
      value: questionsToday,
      icon: CheckCircle,
      color: questionsToday > 0 ? 'text-primary' : 'text-muted-foreground',
      bgColor: questionsToday > 0 ? 'bg-primary/10' : 'bg-muted',
    },
  ];

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={{
        animate: {
          transition: { staggerChildren: stagger.fast },
        },
      }}
      className={cn('grid grid-cols-3 gap-3', className)}
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.id}
            variants={fadeSlideUp}
            className={cn(
              'flex items-center gap-2.5 p-3 rounded-xl',
              'bg-surface border border-border/50 shadow-surface',
              'hover:shadow-raised transition-shadow'
            )}
          >
            <div className={cn('p-2 rounded-lg', stat.bgColor)}>
              <Icon className={cn('h-4 w-4', stat.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-h3 font-bold tabular-nums truncate">
                {stat.value}
              </p>
              <p className="text-meta text-muted-foreground truncate">
                {stat.label}
              </p>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
