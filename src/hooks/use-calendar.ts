import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, addWeeks, format, differenceInDays, parseISO, isAfter, isBefore, addDays } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import type { CalendarDayReviewData } from "@/types/progress";

interface CalendarEvent {
  id: string;
  title: string;
  event_type: string;
  event_date: string | null;
  week_number: number;
  day_of_week: string | null;
  time_slot: string | null;
  location: string | null;
  description: string | null;
  topics_covered: string[] | null;
  course_pack_id: string;
  course_title?: string;
}

interface CalendarFilters {
  courseIds: string[];
  eventTypes: string[];
  timeRange: 'this_week' | 'next_2_weeks' | 'this_month' | 'all';
}

interface WeekGroup {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  events: CalendarEvent[];
}

export function useStudentCalendarEvents(filters: CalendarFilters) {
  return useQuery({
    queryKey: ['student-calendar-events', filters],
    queryFn: async () => {
      let query = supabase
        .from('calendar_events')
        .select(`
          id,
          title,
          event_type,
          event_date,
          week_number,
          day_of_week,
          time_slot,
          location,
          description,
          topics_covered,
          course_pack_id,
          course_packs(title)
        `)
        .order('event_date', { ascending: true, nullsFirst: false })
        .order('week_number', { ascending: true });

      // Filter by courses
      if (filters.courseIds.length > 0) {
        query = query.in('course_pack_id', filters.courseIds);
      }

      // Filter by event types
      if (filters.eventTypes.length > 0) {
        query = query.in('event_type', filters.eventTypes);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Transform data
      const events: CalendarEvent[] = (data || []).map(event => ({
        ...event,
        course_title: (event.course_packs as any)?.title || 'Unknown Course',
      }));

      // Apply time range filter
      const now = new Date();
      let filteredEvents = events;

      if (filters.timeRange !== 'all') {
        const rangeEnd = filters.timeRange === 'this_week'
          ? endOfWeek(now)
          : filters.timeRange === 'next_2_weeks'
            ? endOfWeek(addWeeks(now, 1))
            : addDays(now, 30); // this_month

        filteredEvents = events.filter(event => {
          if (!event.event_date) return true;
          const eventDate = parseISO(event.event_date);
          return !isAfter(eventDate, rangeEnd);
        });
      }

      return filteredEvents;
    },
  });
}

export function useUpcomingExams(courseIds: string[]) {
  return useQuery({
    queryKey: ['upcoming-exams-student', courseIds],
    enabled: courseIds.length > 0,
    queryFn: async () => {
      let query = supabase
        .from('calendar_events')
        .select(`
          id,
          title,
          event_type,
          event_date,
          course_pack_id,
          course_packs(title)
        `)
        .in('event_type', ['exam', 'quiz'])
        .order('event_date', { ascending: true });

      if (courseIds.length > 0) {
        query = query.in('course_pack_id', courseIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const now = new Date();
      return (data || [])
        .filter(event => {
          if (!event.event_date) return false;
          return isAfter(parseISO(event.event_date), now);
        })
        .map(event => ({
          ...event,
          course_title: (event.course_packs as any)?.title || 'Unknown Course',
          daysUntil: differenceInDays(parseISO(event.event_date!), now),
        }))
        .slice(0, 6); // Show max 6 upcoming exams
    },
  });
}

export function groupEventsByWeek(events: CalendarEvent[]): WeekGroup[] {
  const weekMap = new Map<number, CalendarEvent[]>();

  events.forEach(event => {
    const weekNum = event.week_number;
    if (!weekMap.has(weekNum)) {
      weekMap.set(weekNum, []);
    }
    weekMap.get(weekNum)!.push(event);
  });

  // Convert to array and sort by week number
  const weeks: WeekGroup[] = [];
  weekMap.forEach((weekEvents, weekNumber) => {
    // Try to calculate approximate dates from week number
    // This is approximate - would need course start date for accuracy
    const now = new Date();
    const startDate = startOfWeek(now);
    const endDate = endOfWeek(now);

    weeks.push({
      weekNumber,
      startDate,
      endDate,
      events: weekEvents.sort((a, b) => {
        // Sort by day of week if available
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayA = days.indexOf(a.day_of_week?.toLowerCase() || '');
        const dayB = days.indexOf(b.day_of_week?.toLowerCase() || '');
        return dayA - dayB;
      }),
    });
  });

  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
}

export function getEventTypeColor(eventType: string): string {
  switch (eventType.toLowerCase()) {
    case 'exam':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'quiz':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
    case 'topic':
    case 'lecture':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'homework':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    case 'review':
      return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

// ---- Calendar Review Data (FSRS per-day aggregation) ----

interface CalendarStudyRow {
  due_date: string;
  topic_id: string;
  topic_title: string;
  course_pack_id: string;
  status: 'review' | 'new';
  count: number;
  is_overdue: boolean;
}

/** Pure function: aggregate raw RPC rows into a Map keyed by YYYY-MM-DD */
export function aggregateCalendarReviewData(
  rows: CalendarStudyRow[]
): Map<string, CalendarDayReviewData> {
  const map = new Map<string, CalendarDayReviewData>();

  for (const row of rows) {
    const dateKey = row.due_date;
    let entry = map.get(dateKey);
    if (!entry) {
      entry = {
        date: dateKey,
        totalDue: 0,
        totalNew: 0,
        overdueCount: 0,
        topTopics: []
      };
      map.set(dateKey, entry);
    }

    if (row.status === 'review') {
      entry.totalDue += row.count;
      if (row.is_overdue) {
        entry.overdueCount += row.count;
      }
    } else {
      entry.totalNew += row.count;
    }

    // Accumulate topics (will trim to top 3 after loop)
    const existing = entry.topTopics.find(t => t.topicId === row.topic_id);
    if (existing) {
      if (row.status === 'review') {
        existing.dueCount += row.count;
      } else {
        existing.newCount += row.count;
      }
    } else {
      entry.topTopics.push({
        topicId: row.topic_id,
        topicTitle: row.topic_title,
        dueCount: row.status === 'review' ? row.count : 0,
        newCount: row.status === 'new' ? row.count : 0,
      });
    }
  }

  // Sort topics by total activity (due + new) descending and keep top 3
  for (const entry of map.values()) {
    entry.topTopics.sort((a, b) => (b.dueCount + b.newCount) - (a.dueCount + a.newCount));
    entry.topTopics = entry.topTopics.slice(0, 3);
  }

  return map;
}

interface UseCalendarReviewDataParams {
  courseIds: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  includeOverdue: boolean;
}

export function useCalendarReviewData({
  courseIds,
  startDate,
  endDate,
  includeOverdue,
}: UseCalendarReviewDataParams): {
  data: Map<string, CalendarDayReviewData>;
  isLoading: boolean;
  hasAnyReviews: boolean;
} {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['calendar-study-data', user?.id, courseIds, startDate, endDate, includeOverdue],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await (supabase.rpc as any)('get_calendar_study_data', {
        p_user_id: user.id,
        p_course_ids: courseIds.length > 0 ? courseIds : null,
        p_start_date: startDate,
        p_end_date: endDate,
        p_include_overdue: includeOverdue,
      });

      if (error) throw error;
      return (data || []) as CalendarStudyRow[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const aggregated = aggregateCalendarReviewData(query.data || []);

  return {
    data: aggregated,
    isLoading: query.isLoading,
    hasAnyReviews: aggregated.size > 0,
  };
}
