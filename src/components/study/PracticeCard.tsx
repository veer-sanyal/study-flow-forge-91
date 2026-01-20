import { motion } from 'framer-motion';
import { Target, Zap, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fadeSlideUp, duration, easing, stagger } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { FocusPreset } from '@/hooks/use-focus';

interface PracticeCardProps {
  presets: FocusPreset[];
  onPresetClick: (preset: FocusPreset) => void;
  onCustomFocus: () => void;
}

const presetIcons = {
  target: Target,
  alert: Zap,
  calendar: Target,
  refresh: RefreshCw,
};

export function PracticeCard({ presets, onPresetClick, onCustomFocus }: PracticeCardProps) {
  // Limit to 3 presets max on the card
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
        {/* Header */}
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Practice</h2>
          <p className="text-sm text-muted-foreground">
            Choose what to drill
          </p>
        </div>

        {/* Preset buttons */}
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
                    {preset.description && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        ({preset.description})
                      </span>
                    )}
                  </Button>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Custom focus button */}
        <Button
          variant="secondary"
          className="w-full gap-2"
          onClick={onCustomFocus}
        >
          <Settings2 className="h-4 w-4" />
          Custom Focus...
        </Button>
      </div>
    </motion.div>
  );
}
