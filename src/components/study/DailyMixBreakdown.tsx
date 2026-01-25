import { RefreshCcw, BookOpen, TrendingUp, Rocket } from 'lucide-react';
import { DailyPlanMix } from '@/hooks/use-daily-plan';
import { cn } from '@/lib/utils';

interface DailyMixBreakdownProps {
  mix: DailyPlanMix;
  isBehind?: boolean;
  className?: string;
}

const mixItems = [
  { key: 'review', label: 'Review', icon: RefreshCcw, color: 'text-primary' },
  { key: 'current', label: 'Current', icon: BookOpen, color: 'text-success' },
  { key: 'bridge', label: 'Catch-up', icon: TrendingUp, color: 'text-accent' },
  { key: 'stretch', label: 'Challenge', icon: Rocket, color: 'text-primary' },
] as const;

export function DailyMixBreakdown({ mix, isBehind, className }: DailyMixBreakdownProps) {
  // Only show categories with count > 0
  const activeItems = mixItems.filter(item => mix[item.key] > 0);
  
  if (activeItems.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)}>
      {isBehind && (
        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
          Catch-up mode
        </span>
      )}
      <div className="flex items-center gap-2">
        {activeItems.map((item, index) => (
          <div key={item.key} className="flex items-center gap-1">
            {index > 0 && <span className="text-muted-foreground/50 mx-0.5">+</span>}
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <item.icon className={cn('h-3 w-3', item.color)} />
              <span>{mix[item.key]}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
