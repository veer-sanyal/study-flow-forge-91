import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BookOpen, RefreshCw, Repeat } from 'lucide-react';
import type { StudyPlanDaySummary } from '@/hooks/use-calendar-study-plan';
import { cn } from '@/lib/utils';

interface CalendarDayBreakdownProps {
  plan: StudyPlanDaySummary;
}

export function CalendarDayBreakdown({ plan }: CalendarDayBreakdownProps): React.ReactElement {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Study Plan
        </h4>
        <div className="flex gap-2 text-xs">
          <span className={cn(
            'font-semibold',
            plan.totalQuestions > 35 ? 'text-destructive' :
            plan.totalQuestions > 20 ? 'text-warning' :
            'text-success'
          )}>
            ~{plan.totalQuestions} questions
          </span>
          <span className="text-muted-foreground">~{plan.estimatedMinutes} min</span>
        </div>
      </div>

      {/* New Topics */}
      {plan.newTopics.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BookOpen className="h-3 w-3" />
            New Topics
          </div>
          {plan.newTopics.map(topic => (
            <div
              key={topic.topicId}
              className="flex items-center justify-between p-2 rounded-md bg-success/5 text-sm"
            >
              <span className="truncate font-medium">{topic.title}</span>
              <Badge variant="outline" className="h-5 px-1.5 font-normal bg-success/10 text-success border-success/20 shrink-0">
                {topic.questionCount} new
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Reviews Due */}
      {plan.reviewCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Reviews Due
          </div>
          <div className="flex items-center justify-between p-2 rounded-md bg-primary/5 text-sm">
            <span className="font-medium">Spaced repetition reviews</span>
            <Badge variant="secondary" className="h-5 px-1.5 font-normal bg-primary/10 text-primary border-primary/20">
              {plan.reviewCount} review
            </Badge>
          </div>
        </div>
      )}

      {/* Reinforcement */}
      {plan.reinforcementCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Repeat className="h-3 w-3" />
            Reinforcement
          </div>
          <div className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm">
            <span className="font-medium">Recently introduced topics</span>
            <Badge variant="outline" className="h-5 px-1.5 font-normal">
              {plan.reinforcementCount} practice
            </Badge>
          </div>
        </div>
      )}

      {/* Missing questions warning */}
      {plan.hasMissingQuestions && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/20 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Some topics don't have practice questions yet</span>
        </div>
      )}
    </div>
  );
}
