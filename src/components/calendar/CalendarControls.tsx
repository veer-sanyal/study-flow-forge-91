import { ChevronLeft, ChevronRight, GraduationCap, Filter, SlidersHorizontal } from 'lucide-react';
import { addWeeks, addMonths, startOfWeek, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';

interface Course {
  id: string;
  title: string;
}

const EVENT_TYPE_OPTIONS = [
  { value: 'exam', label: 'Exams' },
  { value: 'quiz', label: 'Quizzes' },
  { value: 'topic', label: 'Classes/Lectures' },
  { value: 'homework', label: 'Homework' },
  { value: 'review', label: 'FSRS Reviews' },
];

interface CalendarControlsProps {
  viewMode: 'week' | 'month';
  onViewModeChange: (mode: 'week' | 'month') => void;
  currentDate: Date;
  onNavigate: (date: Date) => void;
  courses: Course[];
  enrolledCourseIds: string[];
  selectedCourseIds: string[];
  onToggleCourse: (courseId: string) => void;
  selectedEventTypes: string[];
  onToggleEventType: (type: string) => void;
  includeOverdue: boolean;
  onToggleOverdue: (value: boolean) => void;
}

export function CalendarControls({
  viewMode,
  onViewModeChange,
  currentDate,
  onNavigate,
  courses,
  enrolledCourseIds,
  selectedCourseIds,
  onToggleCourse,
  selectedEventTypes,
  onToggleEventType,
  includeOverdue,
  onToggleOverdue,
}: CalendarControlsProps): React.ReactElement {
  const isMobile = useIsMobile();
  
  const goToday = (): void => onNavigate(new Date());
  const goPrev = (): void => {
    onNavigate(
      viewMode === 'week'
        ? addWeeks(currentDate, -1)
        : addMonths(currentDate, -1),
    );
  };
  const goNext = (): void => {
    onNavigate(
      viewMode === 'week'
        ? addWeeks(currentDate, 1)
        : addMonths(currentDate, 1),
    );
  };

  const dateLabel =
    viewMode === 'week'
      ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')}`
      : format(currentDate, 'MMMM yyyy');

  // Count active filters
  const courseFilterActive = selectedCourseIds.length > 0 && 
    !(selectedCourseIds.length === enrolledCourseIds.length &&
      selectedCourseIds.every(id => enrolledCourseIds.includes(id)));
  const typeFilterActive = selectedEventTypes.length > 0;
  const activeFilterCount = (courseFilterActive ? 1 : 0) + (typeFilterActive ? 1 : 0) + (includeOverdue ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Top row: View toggle + Navigation */}
      <div className="flex items-center justify-between gap-2">
        {/* Left: view toggle */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => { if (v) onViewModeChange(v as 'week' | 'month'); }}
          className="justify-start"
        >
          <ToggleGroupItem value="week" aria-label="Week view" className="text-xs px-3">
            Week
          </ToggleGroupItem>
          <ToggleGroupItem value="month" aria-label="Month view" className="text-xs px-3">
            Month
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Center: navigation */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[7rem] sm:min-w-[9rem] text-center truncate">{dateLabel}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="ml-1 text-xs hidden sm:inline-flex" onClick={goToday}>
            Today
          </Button>
        </div>

        {/* Right: Filters - collapsed on mobile */}
        {isMobile ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8 relative">
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <Badge 
                    variant="secondary" 
                    className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center bg-primary text-primary-foreground"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <div className="space-y-4">
                {/* Course filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Courses</Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {courses
                      .filter(c => enrolledCourseIds.includes(c.id))
                      .map(course => (
                        <label
                          key={course.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedCourseIds.includes(course.id)}
                            onCheckedChange={() => onToggleCourse(course.id)}
                          />
                          <span className="text-sm truncate">{course.title}</span>
                        </label>
                      ))}
                  </div>
                </div>

                {/* Event type filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Event Types</Label>
                  <div className="space-y-1">
                    {EVENT_TYPE_OPTIONS.map(option => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedEventTypes.includes(option.value)}
                          onCheckedChange={() => onToggleEventType(option.value)}
                        />
                        <span className="text-sm">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Overdue toggle */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <Label htmlFor="overdue-mobile" className="text-sm cursor-pointer">
                    Include Overdue
                  </Label>
                  <Switch
                    id="overdue-mobile"
                    checked={includeOverdue}
                    onCheckedChange={onToggleOverdue}
                  />
                </div>

                {/* Today button on mobile */}
                <Button variant="outline" size="sm" className="w-full" onClick={goToday}>
                  Go to Today
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Course filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">
                    {selectedCourseIds.length === 0 ||
                     (selectedCourseIds.length === enrolledCourseIds.length &&
                      selectedCourseIds.every(id => enrolledCourseIds.includes(id)))
                      ? 'My courses'
                      : `${selectedCourseIds.length} course${selectedCourseIds.length !== 1 ? 's' : ''}`}
                  </span>
                  <span className="lg:hidden">Courses</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <div className="space-y-1">
                  {courses
                    .filter(c => enrolledCourseIds.includes(c.id))
                    .map(course => (
                      <label
                        key={course.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedCourseIds.includes(course.id)}
                          onCheckedChange={() => onToggleCourse(course.id)}
                        />
                        <span className="text-sm truncate">{course.title}</span>
                        <Badge variant="secondary" className="text-xs ml-auto">enrolled</Badge>
                      </label>
                    ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Event type filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">
                    {selectedEventTypes.length === 0
                      ? 'All types'
                      : `${selectedEventTypes.length} type${selectedEventTypes.length !== 1 ? 's' : ''}`}
                  </span>
                  <span className="lg:hidden">Types</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="space-y-1">
                  {EVENT_TYPE_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedEventTypes.includes(option.value)}
                        onCheckedChange={() => onToggleEventType(option.value)}
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Overdue toggle */}
            <div className="flex items-center gap-1.5">
              <Switch
                id="overdue-switch"
                checked={includeOverdue}
                onCheckedChange={onToggleOverdue}
              />
              <Label htmlFor="overdue-switch" className="text-xs text-muted-foreground cursor-pointer">
                Overdue
              </Label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
