import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Target, Zap, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fadeSlideUp, duration, easing, stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { FocusPreset } from '@/contexts/FocusContext';

interface PracticeCardProps {
  presets: FocusPreset[];
  onPresetClick: (preset: FocusPreset) => void;
}

const presetIcons = {
  target: Target,
  alert: Zap,
  calendar: Target,
  refresh: RefreshCw,
};

export function PracticeCard({ presets, onPresetClick }: PracticeCardProps) {
  const navigate = useNavigate();
  const displayPresets = presets.slice(0, 3);

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.slow, ease: easing.easeOut, delay: 0.1 }}
      className={cn(
        'rounded-xl border bg-card p-6',
        'shadow-sm'
      )}
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Practice</h2>
          <p className="text-sm text-muted-foreground">
            Choose what to drill
          </p>
        </div>

        {displayPresets.length > 0 && (
          <motion.div 
            className="flex flex-wrap gap-2"
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
                    onClick={() => onPresetClick(preset)}
                    className={cn(
                      'gap-1.5 text-sm',
                      preset.isRecommended && 'border-primary/50 bg-primary/5'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="max-w-[120px] truncate">{preset.label}</span>
                  </Button>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        <Button
          variant="secondary"
          className="w-full gap-2"
          onClick={() => navigate('/study/focus')}
        >
          <Settings2 className="h-4 w-4" />
          Custom Focus...
        </Button>
      </div>
    </motion.div>
  );
}
