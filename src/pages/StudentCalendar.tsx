import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, BookOpen } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useEnrollments } from '@/hooks/use-enrollments';
import { useCourses } from '@/hooks/use-focus';
import { useFocusContext } from '@/contexts/FocusContext';
import { fadeSlideUp, stagger, duration, easing } from '@/lib/motion';
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
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {upcomingExams.map((exam, i) => (
                  <motion.div
                    key={exam.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * stagger.fast, duration: duration.normal, ease: easing.easeOut }}
                    className={cn(
                      'p-2.5 rounded-lg border',
                      exam.event_type === 'exam'
                        ? 'bg-destructive/5 border-destructive/20'
                        : 'bg-accent/50 border-border',
                    )}
                  >
                    <p className="font-medium text-sm truncate">{exam.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{exam.course_title}</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'mt-1.5 text-xs',
                        exam.daysUntil <= 3 && 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {exam.daysUntil === 0
                        ? 'Today'
                        : exam.daysUntil === 1
                          ? 'Tomorrow'
                          : `in ${exam.daysUntil} days`}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Calendar grid */}
          <motion.div
            {...fadeSlideUp}
            transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.15 }}
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
                calendarEvents={events}
              />
            )}
          </motion.div>

          {/* No reviews message */}
          {!isLoadingReviews && !hasAnyReviews && (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center space-y-3">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground font-medium">
                    No reviews scheduled yet
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Start studying to build your review schedule.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/study')}
                >
                  Go to Study
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Day detail panel */}
          {selectedDate && (
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
                onStartReviews={handleStartReviews}
              />
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
