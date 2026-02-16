import { format, parseISO } from 'date-fns';
import { PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  if (!hasEvents && !hasReviews) {
    return (
      <Card className="mt-4">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Nothing scheduled for {formattedDate}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{formattedDate}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Academic events */}
        {hasEvents && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
        {(hasReviews || (reviewData && reviewData.totalNew > 0)) && (
          <div className="space-y-3 pt-2 border-t text-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Study Plan
              </h4>
              <div className="flex gap-2 text-xs">
                {reviewData?.totalDue > 0 && (
                  <span className="font-medium text-primary">
                    {reviewData.totalDue} review
                  </span>
                )}
                {reviewData?.totalNew > 0 && (
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {reviewData.totalNew} new
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {reviewData?.topTopics.map(topic => (
                <div key={topic.topicId} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm">
                  <span className="truncate font-medium">{topic.topicTitle}</span>
                  <div className="flex gap-2 shrink-0 text-xs">
                    {topic.dueCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 font-normal">
                        {topic.dueCount} review
                      </Badge>
                    )}
                    {topic.newCount > 0 && (
                      <Badge variant="outline" className="h-5 px-1.5 font-normal border-blue-200 text-blue-600 bg-blue-50/50">
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
      </CardContent>
    </Card>
  );
}
