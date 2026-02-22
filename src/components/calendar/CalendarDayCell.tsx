import { Badge } from '@/components/ui/badge';
import type { CalendarDayReviewData } from '@/types/progress';
import { cn } from '@/lib/utils';

interface CalendarEventForCell {
  id: string;
  title: string;
  event_type: string;
}

interface CalendarDayCellProps {
  date: Date;
  isToday: boolean;
  isSelected: boolean;
  isPadding: boolean;
  reviewData: CalendarDayReviewData | undefined;
  events: CalendarEventForCell[];
  onSelect: (dateStr: string) => void;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  topic: 'text-primary',
  lesson: 'text-primary',
  recitation: 'text-muted-foreground',
  exam: 'text-destructive',
  quiz: 'text-warning',
  homework: 'text-success',
  review: 'text-success',
  activity: 'text-muted-foreground',
};

export function CalendarDayCell({
  date,
  isToday,
  isSelected,
  isPadding,
  reviewData,
  events,
  onSelect,
}: CalendarDayCellProps): React.ReactElement {
  const dateStr = formatDateKey(date);
  const dayNum = date.getDate();

  return (
    <button
      type="button"
      onClick={() => onSelect(dateStr)}
      className={cn(
        'relative flex flex-col items-start gap-0.5 p-1.5 sm:p-2 rounded-lg border border-transparent text-left min-h-[4.5rem] sm:min-h-[5.5rem] w-full transition-colors',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isPadding && 'opacity-40',
        isToday && 'ring-2 ring-primary bg-primary/5',
        isSelected && !isToday && 'bg-accent',
        isSelected && isToday && 'ring-2 ring-primary bg-primary/10',
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
      <div className="flex gap-1 flex-wrap mb-1">
        {/* Review Badge */}
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

        {/* New Content Badge */}
        {reviewData && reviewData.totalNew > 0 && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1 py-0 h-4 leading-tight whitespace-nowrap bg-success/10 text-success border-success/20"
          >
            {reviewData.totalNew} new
          </Badge>
        )}
      </div>

      {/* Calendar event titles */}
      <div className="flex flex-col gap-0.5 w-full overflow-hidden">
        {events.slice(0, 3).map((event, i) => (
          <span
            key={event.id}
            className={cn(
              'text-[9px] sm:text-[10px] leading-tight truncate w-full block font-medium',
              EVENT_TYPE_COLORS[event.event_type] || 'text-muted-foreground',
              i >= 2 && 'hidden sm:block',
            )}
            title={`${event.title} (${event.event_type})`}
          >
            {event.title}
          </span>
        ))}
        {events.length > 3 && (
          <span className="text-[9px] text-muted-foreground">
            +{events.length - 3} more
          </span>
        )}
      </div>
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
