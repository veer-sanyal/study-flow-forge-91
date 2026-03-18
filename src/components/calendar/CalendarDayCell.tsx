import { Badge } from '@/components/ui/badge';
import type { CalendarDayReviewData } from '@/types/progress';
import type { StudyPlanDaySummary } from '@/hooks/use-calendar-study-plan';
import { CalendarDaySummary } from './CalendarDaySummary';
import { cn } from '@/lib/utils';

interface CalendarEventForCell {
  id: string;
  title: string;
  event_type: string;
}

interface CalendarDayCellProps {
  date: Date;
  viewMode: 'week' | 'month';
  isToday: boolean;
  isSelected: boolean;
  isPadding: boolean;
  reviewData: CalendarDayReviewData | undefined;
  studyPlan: StudyPlanDaySummary | undefined;
  events: CalendarEventForCell[];
  onSelect: (dateStr: string) => void;
}

/** Dot color by event type */
const EVENT_DOT_COLORS: Record<string, string> = {
  topic: 'bg-primary',
  lesson: 'bg-primary',
  recitation: 'bg-muted-foreground',
  exam: 'bg-destructive',
  quiz: 'bg-warning',
  homework: 'bg-success',
  review: 'bg-success',
  activity: 'bg-muted-foreground',
};

/** Text color by event type (week view) */
const EVENT_TEXT_COLORS: Record<string, string> = {
  topic: 'text-primary',
  lesson: 'text-primary',
  recitation: 'text-muted-foreground',
  exam: 'text-destructive',
  quiz: 'text-warning',
  homework: 'text-success',
  review: 'text-success',
  activity: 'text-muted-foreground',
};

/** Compute the load bar fill percentage (capped at 100%) */
function loadBarPercent(plan: StudyPlanDaySummary | undefined): number {
  if (!plan || plan.totalQuestions === 0) return 0;
  // Scale: 35 questions = 100% (red threshold)
  return Math.min(100, Math.round((plan.totalQuestions / 35) * 100));
}

/** Load bar color class */
function loadBarColor(plan: StudyPlanDaySummary | undefined): string {
  if (!plan || plan.totalQuestions === 0) return 'bg-transparent';
  if (plan.totalQuestions > 35) return 'bg-destructive';
  if (plan.totalQuestions > 20) return 'bg-warning';
  return 'bg-success';
}

/** Compute the dominant status color for the selected-state bridge */
export function getDayStatusColor(
  studyPlan: StudyPlanDaySummary | undefined,
  reviewData: CalendarDayReviewData | undefined,
  events: CalendarEventForCell[],
): string {
  if (studyPlan && studyPlan.totalQuestions > 0) {
    if (studyPlan.totalQuestions > 35) return 'bg-destructive';
    if (studyPlan.totalQuestions > 20) return 'bg-warning';
    return 'bg-success';
  }
  if (reviewData && (reviewData.totalDue > 0 || reviewData.totalNew > 0)) return 'bg-primary';
  if (events.length > 0) return 'bg-muted';
  return 'bg-border';
}

export function CalendarDayCell({
  date,
  viewMode,
  isToday,
  isSelected,
  isPadding,
  reviewData,
  studyPlan,
  events,
  onSelect,
}: CalendarDayCellProps): React.ReactElement {
  const dateStr = formatDateKey(date);
  const dayNum = date.getDate();
  const isWeek = viewMode === 'week';
  const pct = loadBarPercent(studyPlan);
  const barColor = loadBarColor(studyPlan);

  return (
    <button
      type="button"
      onClick={() => onSelect(dateStr)}
      className={cn(
        'relative flex flex-col items-start p-1.5 sm:p-2 bg-surface text-left w-full transition-colors',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        // Month vs week cell height
        isWeek ? 'min-h-[10rem]' : 'min-h-[4.5rem] sm:min-h-[5.5rem]',
        isPadding && 'opacity-40 bg-muted/30',
        isToday && 'ring-2 ring-primary ring-inset bg-primary/5',
        isSelected && !isToday && 'bg-accent ring-2 ring-primary/40 ring-inset',
        isSelected && isToday && 'ring-2 ring-primary ring-inset bg-primary/10',
      )}
    >
      {/* Date number */}
      <span
        className={cn(
          'text-xs sm:text-sm font-medium leading-none',
          isToday && 'text-primary font-bold',
        )}
      >
        {dayNum}
      </span>

      {/* Stats Badges */}
      <div className="flex gap-1 flex-wrap mt-1 mb-0.5">
        {reviewData && reviewData.totalDue > 0 && (
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] px-1 py-0 h-4 leading-tight whitespace-nowrap',
              reviewData.overdueCount > 0
                ? 'bg-destructive/10 text-destructive border-destructive/20'
                : 'bg-primary/10 text-primary border-primary/20',
            )}
          >
            {reviewData.totalDue} review
          </Badge>
        )}
        {reviewData && reviewData.totalNew > 0 && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1 py-0 h-4 leading-tight whitespace-nowrap bg-success/10 text-success border-success/20"
          >
            {reviewData.totalNew} new
          </Badge>
        )}
      </div>

      {/* Study plan summary — compact in month, expanded in week */}
      {studyPlan && studyPlan.totalQuestions > 0 && (
        <CalendarDaySummary plan={studyPlan} compact={!isWeek} />
      )}

      {/* Events — dots in month view, text in week view */}
      {events.length > 0 && (
        isWeek ? (
          /* Week view: readable truncated text */
          <div className="flex flex-col gap-0.5 w-full overflow-hidden mt-1">
            {events.slice(0, 5).map(event => (
              <span
                key={event.id}
                className={cn(
                  'text-[10px] sm:text-[11px] leading-tight truncate w-full block font-medium',
                  EVENT_TEXT_COLORS[event.event_type] || 'text-muted-foreground',
                )}
                title={`${event.title} (${event.event_type})`}
              >
                {event.title}
              </span>
            ))}
            {events.length > 5 && (
              <span className="text-[10px] text-muted-foreground">
                +{events.length - 5} more
              </span>
            )}
          </div>
        ) : (
          /* Month view: colored dots */
          <div className="flex items-center gap-1 mt-1">
            {events.slice(0, 4).map(event => (
              <span
                key={event.id}
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  EVENT_DOT_COLORS[event.event_type] || 'bg-muted-foreground',
                )}
                title={`${event.title} (${event.event_type})`}
              />
            ))}
            {events.length > 4 && (
              <span className="text-[9px] text-muted-foreground leading-none">
                +{events.length - 4}
              </span>
            )}
          </div>
        )
      )}

      {/* Spacer to push load bar to bottom */}
      <div className="flex-1" />

      {/* Load bar signature — thin bar at cell bottom */}
      {pct > 0 && (
        <div className="w-full h-1 rounded-full bg-muted overflow-hidden mt-1">
          <div
            className={cn('h-full rounded-full transition-all', barColor)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </button>
  );
}

/** Format a Date as YYYY-MM-DD */
function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
