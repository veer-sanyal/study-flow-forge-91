import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FocusFilters, useCourses } from '@/hooks/use-focus';

interface ActiveFocusChipsProps {
  filters: FocusFilters;
  onClear: () => void;
  onClick?: () => void;
  className?: string;
}

export function ActiveFocusChips({
  filters,
  onClear,
  onClick,
  className,
}: ActiveFocusChipsProps) {
  const { data: courses = [] } = useCourses();

  const chips: string[] = [];

  // Course chip
  if (filters.courseIds.length === 1) {
    const courseName = courses.find(c => c.id === filters.courseIds[0])?.title;
    if (courseName) chips.push(courseName);
  } else if (filters.courseIds.length > 1) {
    chips.push(`${filters.courseIds.length} courses`);
  }

  // Midterm chip
  if (filters.midtermNumber) {
    chips.push(`Midterm ${filters.midtermNumber}`);
  }

  // Exam chip
  if (filters.examNames.length === 1) {
    chips.push(filters.examNames[0]);
  } else if (filters.examNames.length > 1) {
    chips.push(`${filters.examNames.length} exams`);
  }

  // Topics chip
  if (filters.topicIds.length > 0) {
    chips.push(`${filters.topicIds.length} topic${filters.topicIds.length > 1 ? 's' : ''}`);
  }

  // Type chip
  if (filters.questionTypeId) {
    chips.push('1 type');
  }

  if (chips.length === 0) return null;

  return (
    <div 
      className={cn(
        'flex items-center gap-2 px-4 py-2 border-b bg-card/50',
        onClick && 'cursor-pointer hover:bg-accent/30 transition-colors',
        className
      )}
      onClick={onClick}
    >
      <span className="text-xs font-medium text-muted-foreground">Focus:</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip, i) => (
          <Badge
            key={i}
            variant="secondary"
            className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-primary/20"
          >
            {chip}
          </Badge>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="h-6 w-6 ml-auto text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
