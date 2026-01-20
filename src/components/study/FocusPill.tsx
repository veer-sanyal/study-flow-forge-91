import { Target, ChevronDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCourses } from '@/hooks/use-focus';

interface FocusPillProps {
  filterSummary: string;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  courseIds: string[];
  onOpen: () => void;
  onClear: () => void;
  className?: string;
}

export function FocusPill({
  filterSummary,
  hasActiveFilters,
  activeFilterCount,
  courseIds,
  onOpen,
  onClear,
  className,
}: FocusPillProps) {
  const { data: courses = [] } = useCourses();

  // Resolve course name placeholder
  let displayText = filterSummary;
  if (filterSummary.includes('{{course}}') && courseIds.length === 1) {
    const courseName = courses.find(c => c.id === courseIds[0])?.title || 'Course';
    displayText = filterSummary.replace('{{course}}', courseName);
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={onOpen}
        className={cn(
          'h-9 px-3 gap-2 text-sm font-medium transition-colors',
          hasActiveFilters 
            ? 'border-primary/50 bg-primary/5 hover:bg-primary/10' 
            : 'bg-card hover:bg-accent/50'
        )}
      >
        <Target className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[200px] truncate">{displayText}</span>
        {hasActiveFilters && (
          <Badge 
            variant="secondary" 
            className="h-5 px-1.5 text-xs bg-primary/10 text-primary"
          >
            {activeFilterCount}
          </Badge>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
