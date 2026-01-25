import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, MapPin, GraduationCap, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PageTransition } from '@/components/motion/PageTransition';
import { useStudentCalendarEvents, useUpcomingExams, groupEventsByWeek, getEventTypeColor } from '@/hooks/use-calendar';
import { useEnrollments } from '@/hooks/use-enrollments';
import { useCourses } from '@/hooks/use-focus';
import { fadeSlideUp, stagger, duration, easing } from '@/lib/motion';
import { cn } from '@/lib/utils';

const eventTypeOptions = [
  { value: 'exam', label: 'Exams' },
  { value: 'quiz', label: 'Quizzes' },
  { value: 'topic', label: 'Topics/Lectures' },
  { value: 'homework', label: 'Homework' },
  { value: 'review', label: 'Review' },
];

const timeRangeOptions = [
  { value: 'this_week', label: 'This week' },
  { value: 'next_2_weeks', label: 'Next 2 weeks' },
  { value: 'this_month', label: 'This month' },
  { value: 'all', label: 'All events' },
];

export default function StudentCalendar() {
  const { enrolledCourseIdsArray, isLoadingEnrollments } = useEnrollments();
  
  // Default to enrolled courses if user has enrollments
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<'this_week' | 'next_2_weeks' | 'this_month' | 'all'>('this_month');

  // Set default selected courses to enrolled courses
  useEffect(() => {
    if (!isLoadingEnrollments && enrolledCourseIdsArray.length > 0 && selectedCourseIds.length === 0) {
      setSelectedCourseIds(enrolledCourseIdsArray);
    }
  }, [enrolledCourseIdsArray, isLoadingEnrollments, selectedCourseIds.length]);

  const { data: courses = [] } = useCourses();
  // Filter courses to show only enrolled courses, or show enrolled filter as default
  const effectiveCourseIds = selectedCourseIds.length > 0 
    ? selectedCourseIds 
    : enrolledCourseIdsArray;
    
  const { data: events = [], isLoading } = useStudentCalendarEvents({
    courseIds: effectiveCourseIds,
    eventTypes: selectedEventTypes,
    timeRange,
  });
  const { data: upcomingExams = [] } = useUpcomingExams(effectiveCourseIds);

  const weekGroups = groupEventsByWeek(events);

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const toggleEventType = (type: string) => {
    setSelectedEventTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  return (
    <PageTransition>
      <div className="min-h-screen pb-24 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
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
            <p className="text-muted-foreground">Your academic schedule</p>
          </motion.div>

          {/* Filters */}
          <motion.div
            {...fadeSlideUp}
            transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.05 }}
            className="flex flex-wrap gap-2"
          >
            {/* Course Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <GraduationCap className="h-4 w-4" />
                  {selectedCourseIds.length === 0 || 
                   (selectedCourseIds.length === enrolledCourseIdsArray.length && 
                    selectedCourseIds.every(id => enrolledCourseIdsArray.includes(id)))
                    ? 'My courses'
                    : `${selectedCourseIds.length} course${selectedCourseIds.length > 1 ? 's' : ''}`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="space-y-1">
                  {/* Show enrolled courses first, with indicator */}
                  {courses.filter(c => enrolledCourseIdsArray.includes(c.id)).map(course => (
                    <label
                      key={course.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCourseIds.includes(course.id)}
                        onCheckedChange={() => toggleCourse(course.id)}
                      />
                      <span className="text-sm truncate">{course.title}</span>
                      <Badge variant="secondary" className="text-xs ml-auto">enrolled</Badge>
                    </label>
                  ))}
                  {/* Show non-enrolled courses */}
                  {courses.filter(c => !enrolledCourseIdsArray.includes(c.id)).map(course => (
                    <label
                      key={course.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer opacity-60"
                    >
                      <Checkbox
                        checked={selectedCourseIds.includes(course.id)}
                        onCheckedChange={() => toggleCourse(course.id)}
                      />
                      <span className="text-sm truncate">{course.title}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Event Type Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  {selectedEventTypes.length === 0
                    ? 'All types'
                    : `${selectedEventTypes.length} type${selectedEventTypes.length > 1 ? 's' : ''}`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  {eventTypeOptions.map(option => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedEventTypes.includes(option.value)}
                        onCheckedChange={() => toggleEventType(option.value)}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Time Range */}
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeRangeOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>

          {/* Upcoming Exams */}
          {upcomingExams.length > 0 && (
            <motion.div
              {...fadeSlideUp}
              transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.1 }}
              className="space-y-3"
            >
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                📍 Upcoming Exams
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {upcomingExams.map((exam, i) => (
                  <motion.div
                    key={exam.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * stagger.fast, duration: duration.normal, ease: easing.easeOut }}
                    className={cn(
                      "p-3 rounded-lg border",
                      exam.event_type === 'exam'
                        ? 'bg-destructive/5 border-destructive/20'
                        : 'bg-accent/50 border-border'
                    )}
                  >
                    <p className="font-medium text-sm truncate">{exam.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{exam.course_title}</p>
                    <Badge 
                      variant="secondary" 
                      className={cn(
                        "mt-2 text-xs",
                        exam.daysUntil <= 3 && "bg-destructive/10 text-destructive"
                      )}
                    >
                      {exam.daysUntil === 0 ? 'Today' : exam.daysUntil === 1 ? 'Tomorrow' : `in ${exam.daysUntil} days`}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Events by Week */}
          <motion.div
            {...fadeSlideUp}
            transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.15 }}
            className="space-y-6"
          >
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : weekGroups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No events found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            ) : (
              weekGroups.map((week, weekIdx) => (
                <motion.div
                  key={week.weekNumber}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: weekIdx * stagger.slow, duration: duration.normal, ease: easing.easeOut }}
                  className="space-y-2"
                >
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Week {week.weekNumber}
                  </h3>
                  <div className="border rounded-lg divide-y">
                    {week.events.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-3"
                      >
                        <div className="flex-shrink-0 w-16 text-xs text-muted-foreground">
                          {event.day_of_week && (
                            <span className="capitalize">{event.day_of_week.slice(0, 3)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{event.title}</span>
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs", getEventTypeColor(event.event_type))}
                            >
                              {event.event_type}
                            </Badge>
                          </div>
                          {event.course_title && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {event.course_title}
                            </p>
                          )}
                          {(event.time_slot || event.location) && (
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              {event.time_slot && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {event.time_slot}
                                </span>
                              )}
                              {event.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {event.location}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))
            )}
          </motion.div>
        </div>
      </div>
    </PageTransition>
  );
}
