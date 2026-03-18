import { cn } from '@/lib/utils';
import type { StudyPlanDaySummary } from '@/hooks/use-calendar-study-plan';
import { AlertTriangle } from 'lucide-react';

interface CalendarDaySummaryProps {
  plan: StudyPlanDaySummary;
  /** Compact mode (month view): just question count + time. Expanded (week): includes topic count. */
  compact?: boolean;
}

export function CalendarDaySummary({ plan, compact = false }: CalendarDaySummaryProps): React.ReactElement {
  const topicCount = plan.newTopics.length;
  const loadColor =
    plan.totalQuestions > 35 ? 'text-destructive' :
    plan.totalQuestions > 20 ? 'text-warning' :
    'text-success';

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1 text-[9px] leading-tight', loadColor)}>
        <span>~{plan.totalQuestions} Q</span>
        {plan.hasMissingQuestions && (
          <AlertTriangle className="h-2.5 w-2.5 text-warning shrink-0" />
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-0.5 text-[10px] leading-tight mt-0.5', loadColor)}>
      <div className="flex items-center gap-1">
        {topicCount > 0 && <span>{topicCount} topic{topicCount > 1 ? 's' : ''}</span>}
        {topicCount > 0 && plan.totalQuestions > 0 && <span>·</span>}
        <span>~{plan.totalQuestions} Q</span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <span>~{plan.estimatedMinutes} min</span>
        {plan.hasMissingQuestions && (
          <AlertTriangle className="h-2.5 w-2.5 text-warning shrink-0" />
        )}
      </div>
    </div>
  );
}
