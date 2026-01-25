import { RefreshCcw, BookOpen, TrendingUp, Rocket } from 'lucide-react';
import { QuestionCategory, getCategoryInfo } from '@/hooks/use-daily-plan';
import { cn } from '@/lib/utils';

interface QuestionCategoryBadgeProps {
  category: QuestionCategory;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const iconMap = {
  refresh: RefreshCcw,
  book: BookOpen,
  ladder: TrendingUp,
  rocket: Rocket,
};

export function QuestionCategoryBadge({ 
  category, 
  size = 'sm',
  showLabel = true,
  className 
}: QuestionCategoryBadgeProps) {
  const info = getCategoryInfo(category);
  const Icon = iconMap[info.icon];
  
  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-0.5 gap-1' 
    : 'text-sm px-2.5 py-1 gap-1.5';
  
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <span 
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        info.bgColor,
        info.color,
        sizeClasses,
        className
      )}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{info.label}</span>}
    </span>
  );
}
