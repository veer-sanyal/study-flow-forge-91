import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  isSameDay,
  isSameMonth,
  format,
} from 'date-fns';
import { CalendarDayCell } from './CalendarDayCell';
import type { CalendarDayReviewData } from '@/types/progress';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarEvent {
  id: string;
  event_date: string | null;
}

interface CalendarGridProps {
  viewMode: 'week' | 'month';
  currentDate: Date;
  selectedDate: string | null;
  onSelectDate: (dateStr: string) => void;
  reviewData: Map<string, CalendarDayReviewData>;
  calendarEvents: CalendarEvent[];
}

export function CalendarGrid({
  viewMode,
  currentDate,
  selectedDate,
  onSelectDate,
  reviewData,
  calendarEvents,
}: CalendarGridProps): React.ReactElement {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = viewMode === 'week'
    ? buildWeekDays(currentDate)
    : buildMonthDays(currentDate);

  // Build event count map keyed by date string
  const eventCountMap = new Map<string, number>();
  for (const ev of calendarEvents) {
    if (ev.event_date) {
      const key = ev.event_date.slice(0, 10); // YYYY-MM-DD
      eventCountMap.set(key, (eventCountMap.get(key) || 0) + 1);
    }
  }

  return (
    <div>
      {/* Header row */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(label => (
          <div
            key={label}
            className="text-center text-xs font-medium text-muted-foreground py-1"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {days.map(day => {
          const dateKey = formatDateKey(day);
          return (
            <CalendarDayCell
              key={dateKey}
              date={day}
              isToday={isSameDay(day, today)}
              isSelected={selectedDate === dateKey}
              isPadding={viewMode === 'month' && !isSameMonth(day, currentDate)}
              reviewData={reviewData.get(dateKey)}
              eventCount={eventCountMap.get(dateKey) || 0}
              onSelect={onSelectDate}
            />
          );
        })}
      </div>
    </div>
  );
}

function buildWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(start, i));
  }
  return days;
}

function buildMonthDays(anchor: Date): Date[] {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
