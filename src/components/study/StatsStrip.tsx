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
      shortLabel: 'streak',
      value: streak,
      icon: Flame,
      isActive: streak > 0,
    },
    {
      id: 'accuracy',
      label: 'accuracy (7d)',
      shortLabel: '7d acc',
      value: `${weeklyAccuracy}%`,
      icon: Target,
      isActive: weeklyAccuracy >= 70,
    },
    {
      id: 'today',
      label: 'completed today',
      shortLabel: 'today',
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
        'grid grid-cols-3 gap-3 sm:gap-4',
        className
      )}
    >
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.id}
            className={cn(
              'flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3',
              'bg-surface border border-border rounded-xl shadow-surface'
            )}
          >
            <Icon 
              className={cn(
                'h-4 w-4 shrink-0',
                stat.isActive ? 'text-primary' : 'text-muted-foreground/50'
              )} 
            />
            <div className="min-w-0">
              <div className={cn(
                'text-body font-semibold tabular-nums',
                stat.isActive ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {stat.value}
              </div>
              <div className="text-meta text-muted-foreground truncate">
                <span className="hidden sm:inline">{stat.label}</span>
                <span className="sm:hidden">{stat.shortLabel}</span>
              </div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
