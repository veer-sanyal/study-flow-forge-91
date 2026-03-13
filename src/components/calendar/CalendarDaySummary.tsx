import { cn } from '@/lib/utils';
import type { StudyPlanDaySummary } from '@/hooks/use-calendar-study-plan';
import { AlertTriangle } from 'lucide-react';

interface CalendarDaySummaryProps {
  plan: StudyPlanDaySummary;
}

export function CalendarDaySummary({ plan }: CalendarDaySummaryProps): React.ReactElement {
  const topicCount = plan.newTopics.length;
  const loadColor =
    plan.totalQuestions > 35 ? 'text-destructive' :
    plan.totalQuestions > 20 ? 'text-warning' :
    'text-success';

  return (
    <div className={cn('flex items-center gap-1 text-[9px] leading-tight', loadColor)}>
      {topicCount > 0 && <span>{topicCount} topic{topicCount > 1 ? 's' : ''}</span>}
      {topicCount > 0 && plan.totalQuestions > 0 && <span>·</span>}
      <span>~{plan.totalQuestions} Q</span>
      <span>·</span>
      <span>~{plan.estimatedMinutes} min</span>
      {plan.hasMissingQuestions && (
        <AlertTriangle className="h-2.5 w-2.5 text-warning shrink-0" />
      )}
    </div>
  );
}
