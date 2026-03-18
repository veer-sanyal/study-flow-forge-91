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
import type { StudyPlanDaySummary } from '@/hooks/use-calendar-study-plan';
import { cn } from '@/lib/utils';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  event_date: string | null;
}

interface CalendarGridProps {
  viewMode: 'week' | 'month';
  currentDate: Date;
  selectedDate: string | null;
  onSelectDate: (dateStr: string) => void;
  reviewData: Map<string, CalendarDayReviewData>;
  studyPlanData?: Map<string, StudyPlanDaySummary>;
  calendarEvents: CalendarEvent[];
  /** Color class for the selected day's status strip bridge */
  selectedDayStripColor?: string;
}

export function CalendarGrid({
  viewMode,
  currentDate,
  selectedDate,
  onSelectDate,
  reviewData,
  studyPlanData,
  calendarEvents,
  selectedDayStripColor,
}: CalendarGridProps): React.ReactElement {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = viewMode === 'week'
    ? buildWeekDays(currentDate)
    : buildMonthDays(currentDate);

  // Build events-by-date map keyed by date string
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const ev of calendarEvents) {
    if (ev.event_date) {
      const key = ev.event_date.slice(0, 10); // YYYY-MM-DD
      const existing = eventsByDate.get(key) || [];
      existing.push(ev);
      eventsByDate.set(key, existing);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden bg-surface border border-border shadow-surface">
      {/* Status strip — actionable user data */}
      <div className={cn('h-1', selectedDayStripColor || 'bg-primary')} />

      {/* Header row */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_LABELS.map(label => (
          <div
            key={label}
            className="text-center text-xs font-medium text-muted-foreground py-2"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells — bg-border/50 bleeds through gap-px as subtle grid lines */}
      <div className="grid grid-cols-7 gap-px bg-border/50">
        {days.map(day => {
          const dateKey = formatDateKey(day);
          return (
            <CalendarDayCell
              key={dateKey}
              date={day}
              viewMode={viewMode}
              isToday={isSameDay(day, today)}
              isSelected={selectedDate === dateKey}
              isPadding={viewMode === 'month' && !isSameMonth(day, currentDate)}
              reviewData={reviewData.get(dateKey)}
              studyPlan={studyPlanData?.get(dateKey)}
              events={eventsByDate.get(dateKey) || []}
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
