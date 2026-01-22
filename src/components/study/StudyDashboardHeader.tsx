import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { Pill, ProgressRing } from '@/components/ui/primitives';
import { fadeSlideUp, duration, easing } from '@/lib/motion';

interface StudyDashboardHeaderProps {
  progressPercent: number;
  completedToday: number;
  dailyGoal: number;
  primaryCourse?: string | null;
}

export function StudyDashboardHeader({
  progressPercent,
  completedToday,
  dailyGoal,
  primaryCourse,
}: StudyDashboardHeaderProps) {
  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.normal, ease: easing.easeOut }}
      className="space-y-3"
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-h1 font-bold tracking-tight">Study</h1>
          <p className="text-body text-muted-foreground">
            {completedToday > 0 
              ? `${completedToday} of ${dailyGoal} completed today`
              : 'Ready to learn something new?'
            }
          </p>
        </div>
        
        {/* Progress ring - only show if there's progress */}
        {completedToday > 0 && (
          <ProgressRing 
            value={Math.min(progressPercent, 100)} 
            size={48}
            strokeWidth={5}
          />
        )}
      </div>

      {/* Focus pills row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill variant="primary" size="sm">
          <BookOpen className="h-3 w-3" />
          <span>
            {primaryCourse || 'All Courses'}
          </span>
        </Pill>
        
        {completedToday >= dailyGoal && (
          <Pill variant="success" size="sm">
            ✓ Daily goal complete
          </Pill>
        )}
      </div>
    </motion.div>
  );
}
