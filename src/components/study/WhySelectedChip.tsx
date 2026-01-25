import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhySelectedChipProps {
  reason: string;
  className?: string;
}

export function WhySelectedChip({ reason, className }: WhySelectedChipProps) {
  return (
    <div 
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md',
        'bg-muted/50 text-muted-foreground',
        'text-xs',
        className
      )}
    >
      <Sparkles className="h-3 w-3 text-primary shrink-0" />
      <span className="truncate max-w-[280px]">{reason}</span>
    </div>
  );
}
