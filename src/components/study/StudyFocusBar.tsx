import { X, Filter, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  StudyFilters,
  useCourses,
  useExamsForCourse,
  useTopicsForCourse,
  useQuestionTypesForCourse,
} from '@/hooks/use-study-filters';
import { cn } from '@/lib/utils';

interface StudyFocusBarProps {
  filters: StudyFilters;
  onCourseChange: (courseId: string | null) => void;
  onExamChange: (examName: string | null) => void;
  onTopicsChange: (topicIds: string[]) => void;
  onQuestionTypeChange: (typeId: string | null) => void;
  onClear: () => void;
  activeFilterCount: number;
}

export function StudyFocusBar({
  filters,
  onCourseChange,
  onExamChange,
  onTopicsChange,
  onQuestionTypeChange,
  onClear,
  activeFilterCount,
}: StudyFocusBarProps) {
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: courses = [] } = useCourses();
  const { data: exams = [] } = useExamsForCourse(filters.courseId);
  const { data: topics = [] } = useTopicsForCourse(filters.courseId);
  const { data: questionTypes = [] } = useQuestionTypesForCourse(filters.courseId);

  // Get display names for current selections
  const selectedCourseName = courses.find(c => c.id === filters.courseId)?.title;
  const selectedTopicNames = topics
    .filter(t => filters.topicIds.includes(t.id))
    .map(t => t.title);
  const selectedTypeName = questionTypes.find(t => t.id === filters.questionTypeId)?.name;

  const handleTopicToggle = (topicId: string) => {
    if (filters.topicIds.includes(topicId)) {
      onTopicsChange(filters.topicIds.filter(id => id !== topicId));
    } else {
      onTopicsChange([...filters.topicIds, topicId]);
    }
  };

  if (isMobile) {
    return (
      <div className="border-b bg-card">
        {/* Collapsed header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Focus</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Expanded filters */}
        {isExpanded && (
          <div className="space-y-3 px-4 pb-4">
            {/* Course */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Course</label>
              <Select
                value={filters.courseId || 'all'}
                onValueChange={(v) => onCourseChange(v === 'all' ? null : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All courses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All courses</SelectItem>
                  {courses.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Exam */}
            {filters.courseId && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Exam</label>
                <Select
                  value={filters.examName || 'all'}
                  onValueChange={(v) => onExamChange(v === 'all' ? null : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All exams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All exams</SelectItem>
                    {exams.map((exam) => (
                      <SelectItem key={exam} value={exam}>
                        {exam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Topics */}
            {filters.courseId && topics.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Topics</label>
                <div className="flex flex-wrap gap-1.5">
                  {topics.map((topic) => (
                    <Badge
                      key={topic.id}
                      variant={filters.topicIds.includes(topic.id) ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => handleTopicToggle(topic.id)}
                    >
                      {topic.title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Question Type */}
            {filters.courseId && questionTypes.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Question Type</label>
                <Select
                  value={filters.questionTypeId || 'all'}
                  onValueChange={(v) => onQuestionTypeChange(v === 'all' ? null : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {questionTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="w-full text-muted-foreground"
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear all filters
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="border-b bg-card/50">
      <div className="flex items-center gap-3 px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>Focus:</span>
        </div>

        {/* Course selector */}
        <Select
          value={filters.courseId || 'all'}
          onValueChange={(v) => onCourseChange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Exam selector - only when course is selected */}
        {filters.courseId && (
          <Select
            value={filters.examName || 'all'}
            onValueChange={(v) => onExamChange(v === 'all' ? null : v)}
          >
            <SelectTrigger className="h-8 w-[200px]">
              <SelectValue placeholder="All exams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exams</SelectItem>
              {exams.map((exam) => (
                <SelectItem key={exam} value={exam}>
                  {exam}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Topic badges - only when course is selected */}
        {filters.courseId && topics.length > 0 && (
          <Select
            value={filters.topicIds.length > 0 ? filters.topicIds[0] : 'all'}
            onValueChange={(v) => {
              if (v === 'all') {
                onTopicsChange([]);
              } else {
                // For desktop, allow multi-select via holding
                if (filters.topicIds.includes(v)) {
                  onTopicsChange(filters.topicIds.filter(id => id !== v));
                } else {
                  onTopicsChange([...filters.topicIds, v]);
                }
              }
            }}
          >
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue>
                {filters.topicIds.length === 0
                  ? 'All topics'
                  : filters.topicIds.length === 1
                  ? selectedTopicNames[0]
                  : `${filters.topicIds.length} topics`}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All topics</SelectItem>
              {topics.map((topic) => (
                <SelectItem key={topic.id} value={topic.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-2 w-2 rounded-full',
                        filters.topicIds.includes(topic.id)
                          ? 'bg-primary'
                          : 'bg-transparent border'
                      )}
                    />
                    {topic.title}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Question type selector */}
        {filters.courseId && questionTypes.length > 0 && (
          <Select
            value={filters.questionTypeId || 'all'}
            onValueChange={(v) => onQuestionTypeChange(v === 'all' ? null : v)}
          >
            <SelectTrigger className="h-8 w-[150px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {questionTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear button */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
