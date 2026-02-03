import { format, parseISO } from 'date-fns';
import { Clock, MapPin, PlayCircle } from 'lucide-react';
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
  time_slot: string | null;
  location: string | null;
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
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {ev.time_slot && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {ev.time_slot}
                        </span>
                      )}
                      {ev.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ev.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review topics */}
        {hasReviews && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reviews due ({reviewData.totalDue} total
              {reviewData.overdueCount > 0 && `, ${reviewData.overdueCount} overdue`})
            </h4>
            <div className="space-y-1">
              {reviewData.topTopics.map(topic => (
                <div key={topic.topicId} className="flex items-center justify-between text-sm">
                  <span className="truncate">{topic.topicTitle}</span>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {topic.dueCount} questions due
                  </span>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              className="gap-1.5 mt-2"
              onClick={handleStartReviews}
            >
              <PlayCircle className="h-4 w-4" />
              Start reviews for {format(dateObj, 'MMM d')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
