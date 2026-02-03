import { Badge } from '@/components/ui/badge';
import type { CalendarDayReviewData } from '@/types/progress';
import { cn } from '@/lib/utils';

interface CalendarDayCellProps {
  date: Date;
  isToday: boolean;
  isSelected: boolean;
  isPadding: boolean;
  reviewData: CalendarDayReviewData | undefined;
  eventCount: number;
  onSelect: (dateStr: string) => void;
}

export function CalendarDayCell({
  date,
  isToday,
  isSelected,
  isPadding,
  reviewData,
  eventCount,
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

      {/* Due badge */}
      {reviewData && reviewData.totalDue > 0 && (
        <Badge
          variant="secondary"
          className={cn(
            'text-[10px] px-1 py-0 h-4 leading-tight',
            reviewData.overdueCount > 0
              ? 'bg-destructive/10 text-destructive border-destructive/20'
              : 'bg-primary/10 text-primary border-primary/20',
          )}
        >
          {reviewData.totalDue} due
        </Badge>
      )}

      {/* Top topic chips (max 2 on mobile, 3 on desktop) */}
      <div className="flex flex-col gap-0.5 w-full overflow-hidden">
        {reviewData?.topTopics.slice(0, 3).map((topic, i) => (
          <span
            key={topic.topicId}
            className={cn(
              'text-[9px] sm:text-[10px] leading-tight truncate text-muted-foreground max-w-full',
              i >= 2 && 'hidden sm:block',
            )}
            title={`${topic.topicTitle} (${topic.dueCount})`}
          >
            {topic.topicTitle}
          </span>
        ))}
      </div>

      {/* Event dot indicator */}
      {eventCount > 0 && (
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
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
