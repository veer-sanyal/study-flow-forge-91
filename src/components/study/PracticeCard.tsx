import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Target, Zap, RefreshCw, Settings2, ChevronRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fadeSlideUp, duration, easing, stagger, buttonPress } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { FocusPreset } from '@/contexts/FocusContext';
import { PracticeRecommendation } from '@/hooks/use-study-dashboard';

interface PracticeCardProps {
  presets: FocusPreset[];
  recommendations?: PracticeRecommendation[];
  onPresetClick: (preset: FocusPreset) => void;
}

const presetIcons = {
  target: Target,
  alert: Zap,
  calendar: Calendar,
  refresh: RefreshCw,
};

export function PracticeCard({ presets, recommendations, onPresetClick }: PracticeCardProps) {
  const navigate = useNavigate();
  const displayPresets = presets.slice(0, 3);

  // Get top 2 recommendations to show as "why practice" insights
  const topRecommendations = recommendations?.slice(0, 2) || [];

  return (
    <motion.button
      {...fadeSlideUp}
      {...buttonPress}
      transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.1 }}
      onClick={() => navigate('/study/focus')}
      className={cn(
        'relative w-full text-left overflow-hidden rounded-xl border bg-card',
        'shadow-sm hover:shadow-md transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'group'
      )}
    >
      {/* Left accent strip - secondary/muted color */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-muted-foreground/40 group-hover:bg-primary/50 transition-colors" />

      <div className="flex items-start gap-4 p-5 pl-6">
        {/* Icon */}
        <div className="shrink-0 p-2.5 rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
          <Settings2 className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h2 className="text-h3 font-semibold tracking-tight">Practice</h2>
              <p className="text-meta text-muted-foreground">
                {topRecommendations.length > 0 
                  ? 'Personalized recommendations'
                  : 'Choose what to drill'
                }
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>

          {/* Practice recommendations (why this is recommended) */}
          {topRecommendations.length > 0 && (
            <div className="flex flex-wrap gap-2 text-meta">
              {topRecommendations.map((rec) => {
                const Icon = presetIcons[rec.icon] || Target;
                return (
                  <span 
                    key={rec.id}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md",
                      rec.type === 'overdue_review' && "bg-warning/10 text-warning",
                      rec.type === 'weak_topic' && "bg-destructive/10 text-destructive",
                      rec.type === 'upcoming_exam' && "bg-primary/10 text-primary",
                      rec.type === 'question_type' && "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="truncate max-w-[140px]">{rec.label}</span>
                  </span>
                );
              })}
            </div>
          )}

          {/* Quick presets */}
          {displayPresets.length > 0 && (
            <motion.div 
              className="flex flex-wrap gap-2"
              onClick={(e) => e.stopPropagation()}
              initial="initial"
              animate="animate"
              variants={{
                animate: {
                  transition: {
                    staggerChildren: stagger.fast,
                  },
                },
              }}
            >
              {displayPresets.map((preset) => {
                const Icon = presetIcons[preset.icon || 'target'];
                return (
                  <motion.div
                    key={preset.id}
                    variants={fadeSlideUp}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPresetClick(preset);
                      }}
                      className={cn(
                        'gap-1.5 text-meta h-8',
                        preset.isRecommended && 'border-primary/50 bg-primary/5 hover:bg-primary/10'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="max-w-[100px] truncate">{preset.label}</span>
                    </Button>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
