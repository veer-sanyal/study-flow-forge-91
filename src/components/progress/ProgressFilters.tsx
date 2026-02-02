import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type TimeRange } from '@/types/progress';

interface EnrolledCourse {
  id: string;
  title: string;
}

interface ProgressFiltersProps {
  courses: EnrolledCourse[];
  selectedCourseId: string | null;
  onCourseChange: (courseId: string | null) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export function ProgressFilters({
  courses,
  selectedCourseId,
  onCourseChange,
  timeRange,
  onTimeRangeChange,
}: ProgressFiltersProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Course filter */}
      {courses.length > 1 && (
        <Select
          value={selectedCourseId ?? 'all'}
          onValueChange={(v) => onCourseChange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="All Courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Time range toggle */}
      <ToggleGroup
        type="single"
        value={timeRange}
        onValueChange={(v) => {
          if (v) onTimeRangeChange(v as TimeRange);
        }}
        size="sm"
      >
        <ToggleGroupItem value="7d" className="text-xs px-3">
          7d
        </ToggleGroupItem>
        <ToggleGroupItem value="30d" className="text-xs px-3">
          30d
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="text-xs px-3">
          All
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
