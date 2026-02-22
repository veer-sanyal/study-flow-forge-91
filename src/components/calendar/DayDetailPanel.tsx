import { format, parseISO } from 'date-fns';
import { PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getEventTypeColor } from '@/hooks/use-calendar';
import type { CalendarDayReviewData } from '@/types/progress';
import { cn } from '@/lib/utils';

interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  event_date: string | null;
  course_title?: string;
}

interface DayDetailPanelProps {
  date: string; // YYYY-MM-DD
  events: CalendarEvent[];
  reviewData: CalendarDayReviewData | undefined;
  onStartReviews: (topicIds: string[]) => void;
}

export function DayDetailPanel({
  date,
  events,
  reviewData,
  onStartReviews,
}: DayDetailPanelProps): React.ReactElement {
  const dateObj = parseISO(date);
  const formattedDate = format(dateObj, 'EEEE, MMMM d, yyyy');

  const dayEvents = events.filter(
    ev => ev.event_date && ev.event_date.slice(0, 10) === date,
  );

  const handleStartReviews = (): void => {
    if (reviewData && reviewData.topTopics.length > 0) {
      onStartReviews(reviewData.topTopics.map(t => t.topicId));
    }
  };

  const hasEvents = dayEvents.length > 0;
  const hasReviews = reviewData && reviewData.totalDue > 0;
  const hasNew = reviewData && reviewData.totalNew > 0;

  const stripClass =
    hasReviews || hasNew ? 'bg-primary' :
    hasEvents ? 'bg-muted' :
    'bg-border';

  if (!hasEvents && !hasReviews && !hasNew) {
    return (
      <div className="rounded-xl border border-border bg-surface shadow-surface overflow-hidden">
        <div className="h-1 bg-border" />
        <div className="py-6 text-center text-sm text-muted-foreground">
          Nothing scheduled for {formattedDate}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-surface overflow-hidden">
      <div className={cn('h-1', stripClass)} />
      <div className="p-4 flex flex-col gap-3">
        <p className="font-semibold text-sm leading-snug">{formattedDate}</p>

        {/* Academic events */}
        {hasEvents && (
          <div className="space-y-2">
            <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Events
            </h4>
            <div className="space-y-2">
              {dayEvents.map(ev => (
                <div key={ev.id} className="flex items-start gap-3 text-sm">
                  <Badge
                    variant="outline"
                    className={cn('text-xs shrink-0', getEventTypeColor(ev.event_type))}
                  >
                    {ev.event_type}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{ev.title}</p>
                    {ev.course_title && (
                      <p className="text-xs text-muted-foreground">{ev.course_title}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Study Plan */}
        {(hasReviews || hasNew) && (
          <div className={cn('space-y-3 text-sm', hasEvents && 'pt-3 border-t border-border')}>
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Study Plan
              </h4>
              <div className="flex gap-2 text-xs">
                {reviewData?.totalDue > 0 && (
                  <span className="font-medium text-primary">
                    {reviewData.totalDue} review
                  </span>
                )}
                {reviewData?.totalNew > 0 && (
                  <span className="font-medium text-success">
                    {reviewData.totalNew} new
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              {reviewData?.topTopics.map(topic => (
                <div key={topic.topicId} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm">
                  <span className="truncate font-medium">{topic.topicTitle}</span>
                  <div className="flex gap-2 shrink-0 text-xs">
                    {topic.dueCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 font-normal bg-primary/10 text-primary border-primary/20">
                        {topic.dueCount} review
                      </Badge>
                    )}
                    {topic.newCount > 0 && (
                      <Badge variant="outline" className="h-5 px-1.5 font-normal bg-success/10 text-success border-success/20">
                        {topic.newCount} new
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Button
              className="w-full gap-2"
              onClick={handleStartReviews}
            >
              <PlayCircle className="h-4 w-4" />
              Start Session ({((reviewData?.totalDue || 0) + (reviewData?.totalNew || 0))} q)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
