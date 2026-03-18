import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { PageTransition } from '@/components/motion/PageTransition';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { CalendarControls } from '@/components/calendar/CalendarControls';
import { DayDetailPanel } from '@/components/calendar/DayDetailPanel';
import { NoCoursesEmptyState } from '@/components/shared/NoCoursesEmptyState';
import {
  useStudentCalendarEvents,
  useUpcomingExams,
  useCalendarReviewData,
} from '@/hooks/use-calendar';
import { useCalendarStudyPlan } from '@/hooks/use-calendar-study-plan';
import { useEnrollments } from '@/hooks/use-enrollments';
import { useCourses } from '@/hooks/use-focus';
import { useFocusContext } from '@/contexts/FocusContext';
import { fadeSlideUp, stagger, duration, easing } from '@/lib/motion';
import { getDayStatusColor } from '@/components/calendar/CalendarDayCell';
import { cn } from '@/lib/utils';

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateRange(
  viewMode: 'week' | 'month',
  anchor: Date,
): { startDate: string; endDate: string } {
  if (viewMode === 'week') {
    const s = startOfWeek(anchor, { weekStartsOn: 0 });
    const e = endOfWeek(anchor, { weekStartsOn: 0 });
    return { startDate: formatDateKey(s), endDate: formatDateKey(e) };
  }
  // Month: include padding days from adjacent months
  const ms = startOfMonth(anchor);
  const me = endOfMonth(anchor);
  const gridStart = startOfWeek(ms, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(me, { weekStartsOn: 0 });
  return { startDate: formatDateKey(gridStart), endDate: formatDateKey(gridEnd) };
}

export default function StudentCalendar(): React.ReactElement {
  const navigate = useNavigate();
  const { setTopicIds } = useFocusContext();

  // -- State --
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(formatDateKey(new Date()));
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [includeOverdue, setIncludeOverdue] = useState(true);

  // -- Data hooks --
  const { enrolledCourseIdsArray, isLoadingEnrollments, enrollments } = useEnrollments();
  const { data: courses = [] } = useCourses();

  // Sync selected courses to enrolled courses on first load
  useEffect(() => {
    if (!isLoadingEnrollments && enrolledCourseIdsArray.length > 0 && selectedCourseIds.length === 0) {
      setSelectedCourseIds(enrolledCourseIdsArray);
    }
  }, [enrolledCourseIdsArray, isLoadingEnrollments, selectedCourseIds.length]);

  const effectiveCourseIds = selectedCourseIds.length > 0
    ? selectedCourseIds
    : enrolledCourseIdsArray;

  const { startDate, endDate } = getDateRange(viewMode, currentDate);

  const { data: reviewData, isLoading: isLoadingReviews, hasAnyReviews } =
    useCalendarReviewData({
      courseIds: effectiveCourseIds,
      startDate,
      endDate,
      includeOverdue,
    });

  const { data: events = [] } = useStudentCalendarEvents({
    courseIds: effectiveCourseIds,
    eventTypes: selectedEventTypes,
    timeRange: 'all',
  });

  const { data: upcomingExams = [] } = useUpcomingExams(effectiveCourseIds);

  // Study plan data for proactive workload projection
  const { data: studyPlanData } = useCalendarStudyPlan(startDate, endDate);

  // Compute selected day's status color for the grid-to-panel visual bridge
  const selectedDayStripColor = selectedDate
    ? getDayStatusColor(
        studyPlanData.get(selectedDate),
        reviewData.get(selectedDate),
        events.filter(ev => ev.event_date && ev.event_date.slice(0, 10) === selectedDate),
      )
    : undefined;

  // -- Handlers --
  const toggleCourse = useCallback((courseId: string) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId],
    );
  }, []);

  const toggleEventType = useCallback((type: string) => {
    setSelectedEventTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type],
    );
  }, []);

  const handleStartReviews = useCallback((topicIds: string[]) => {
    setTopicIds(topicIds);
    navigate('/study', { state: { startPractice: true } });
  }, [setTopicIds, navigate]);

  // -- Gating --
  if (isLoadingEnrollments) {
    return (
      <PageTransition>
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  if (enrollments.length === 0) {
    return <NoCoursesEmptyState />;
  }

  return (
    <PageTransition>
      <div className="min-h-screen pb-24 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
          {/* Header */}
          <motion.div
            {...fadeSlideUp}
            transition={{ duration: duration.slow, ease: easing.easeOut }}
            className="space-y-1"
          >
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Calendar
            </h1>
            <p className="text-muted-foreground">Your study planning view</p>
          </motion.div>

          {/* Controls */}
          <motion.div
            {...fadeSlideUp}
            transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.05 }}
          >
            <CalendarControls
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentDate={currentDate}
              onNavigate={setCurrentDate}
              courses={courses}
              enrolledCourseIds={enrolledCourseIdsArray}
              selectedCourseIds={selectedCourseIds}
              onToggleCourse={toggleCourse}
              selectedEventTypes={selectedEventTypes}
              onToggleEventType={toggleEventType}
              includeOverdue={includeOverdue}
              onToggleOverdue={setIncludeOverdue}
            />
          </motion.div>

          {/* Upcoming exams strip */}
          {upcomingExams.length > 0 && (
            <motion.div
              {...fadeSlideUp}
              transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.1 }}
              className="space-y-2"
            >
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Upcoming exams
              </h2>
              <div className="relative">
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin">
                  {upcomingExams.map((exam, i) => {
                    const urgency =
                      exam.daysUntil < 3 ? 'critical' :
                      exam.daysUntil <= 7 ? 'warning' :
                      exam.daysUntil <= 14 ? 'upcoming' :
                      'calm';
                    const urgencyStripClass = {
                      critical: 'bg-destructive',
                      warning: 'bg-warning',
                      upcoming: 'bg-primary',
                      calm: 'bg-muted',
                    }[urgency];
                    const numberColor = {
                      critical: 'text-destructive',
                      warning: 'text-warning',
                      upcoming: 'text-primary',
                      calm: 'text-muted-foreground',
                    }[urgency];
                    return (
                      <motion.div
                        key={exam.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * stagger.fast, duration: duration.normal, ease: easing.easeOut }}
                        className="rounded-xl border border-border bg-surface shadow-surface overflow-hidden shrink-0 w-40"
                      >
                        <div className={cn('h-1', urgencyStripClass)} />
                        <div className="p-3">
                          <div className="flex items-baseline gap-1.5">
                            <span className={cn('text-2xl font-bold tabular-nums leading-none', numberColor)}>
                              {exam.daysUntil === 0 ? '!' : exam.daysUntil}
                            </span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              {exam.daysUntil === 0 ? 'today' : exam.daysUntil === 1 ? 'day' : 'days'}
                            </span>
                          </div>
                          <p className="font-medium text-sm mt-1.5 leading-snug line-clamp-1">{exam.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{exam.course_title}</p>
                          {exam.event_date && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {format(new Date(exam.event_date), 'MMM d')}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {/* Right-edge fade for scroll affordance */}
                <div className="absolute inset-y-0 right-0 w-8 pointer-events-none bg-gradient-to-l from-background to-transparent" />
              </div>
            </motion.div>
          )}

          {/* No reviews message */}
          {!isLoadingReviews && !hasAnyReviews && (
            <div className="rounded-xl overflow-hidden bg-surface border border-border shadow-surface">
              <div className="h-1 bg-muted" />
              <div className="flex items-center justify-between p-4">
                <p className="text-sm text-muted-foreground">
                  No reviews scheduled yet — start studying to build your schedule.
                </p>
                <Button variant="ghost" size="sm" onClick={() => navigate('/study')} className="shrink-0 ml-3">
                  Go to Study
                </Button>
              </div>
            </div>
          )}

          {/* Calendar grid + Day detail — side by side on lg+ */}
          <div className="flex flex-col lg:flex-row lg:gap-5 lg:items-start">
            {/* Calendar grid — takes available space */}
            <motion.div
              {...fadeSlideUp}
              transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.15 }}
              className="flex-1 min-w-0"
            >
              {isLoadingReviews ? (
                <div className="h-48 bg-muted/30 rounded-lg animate-pulse" />
              ) : (
                <CalendarGrid
                  viewMode={viewMode}
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  reviewData={reviewData}
                  studyPlanData={studyPlanData}
                  calendarEvents={events}
                  selectedDayStripColor={selectedDayStripColor}
                />
              )}
            </motion.div>

            {/* Day detail panel — side on desktop, below on mobile */}
            <div className="lg:w-80 xl:w-96 lg:shrink-0 lg:sticky lg:top-6 mt-4 lg:mt-0">
              {selectedDate ? (
                <motion.div
                  key={selectedDate}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: duration.normal, ease: easing.easeOut }}
                >
                  <DayDetailPanel
                    date={selectedDate}
                    events={events}
                    reviewData={reviewData.get(selectedDate)}
                    studyPlan={studyPlanData.get(selectedDate)}
                    onStartReviews={handleStartReviews}
                  />
                </motion.div>
              ) : (
                <div className="hidden lg:block rounded-xl overflow-hidden bg-surface border border-border shadow-surface">
                  <div className="h-1 bg-muted" />
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <Calendar className="h-8 w-8 mb-3 opacity-40" />
                    <p className="text-sm">Select a date to see details</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
