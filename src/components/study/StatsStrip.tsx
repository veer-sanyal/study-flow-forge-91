import { motion } from 'framer-motion';
import { Flame, Target, CheckCircle } from 'lucide-react';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
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
  questionsToday,
  className 
}: StatsStripProps) {
  const stats = [
    {
      id: 'streak',
      label: 'day streak',
      value: streak,
      icon: Flame,
      isActive: streak > 0,
    },
    {
      id: 'accuracy',
      label: 'accuracy (7d)',
      value: `${weeklyAccuracy}%`,
      icon: Target,
      isActive: weeklyAccuracy >= 70,
    },
    {
      id: 'today',
      label: 'today',
      value: questionsToday,
      icon: CheckCircle,
      isActive: questionsToday > 0,
    },
  ];

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.1 }}
      className={cn(
        'flex items-stretch rounded-xl overflow-hidden',
        'bg-surface border border-border shadow-surface',
        className
      )}
    >
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.id}
            className={cn(
              'flex-1 flex items-center gap-2 px-4 py-3',
              index !== stats.length - 1 && 'border-r border-border'
            )}
          >
            <Icon 
              className={cn(
                'h-4 w-4 shrink-0',
                stat.isActive ? 'text-primary' : 'text-muted-foreground/50'
              )} 
            />
            <div className="min-w-0 flex items-baseline gap-1.5">
              <span className={cn(
                'text-body font-semibold tabular-nums',
                stat.isActive ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {stat.value}
              </span>
              <span className="text-meta text-muted-foreground truncate">
                {stat.label}
              </span>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
