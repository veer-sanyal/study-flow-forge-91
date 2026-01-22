import { motion } from 'framer-motion';
import { Target, RefreshCw, Calendar, Zap, ChevronRight, Clock, Sparkles, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fadeSlideUp, duration, easing } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { PracticeRecommendation } from '@/hooks/use-study-dashboard';

interface RecommendationRowProps {
  recommendation: PracticeRecommendation;
  onStart: () => void;
  index: number;
}

const typeConfig = {
  overdue_review: {
    icon: RefreshCw,
    accentColor: 'bg-warning',
    badgeText: 'High impact',
    badgeClass: 'text-warning bg-warning/10',
    ctaText: 'Do now',
  },
  weak_topic: {
    icon: Target,
    accentColor: 'bg-destructive',
    badgeText: 'Needs work',
    badgeClass: 'text-destructive bg-destructive/10',
    ctaText: 'Practice',
  },
  upcoming_exam: {
    icon: Calendar,
    accentColor: 'bg-primary',
    badgeText: 'Exam prep',
    badgeClass: 'text-primary bg-primary/10',
    ctaText: 'Practice',
  },
  question_type: {
    icon: Zap,
    accentColor: 'bg-muted-foreground',
    badgeText: 'Practice',
    badgeClass: 'text-muted-foreground bg-muted',
    ctaText: 'Start',
  },
};

function RecommendationRow({ recommendation, onStart, index }: RecommendationRowProps) {
  const config = typeConfig[recommendation.type];
  const Icon = config.icon;
  
  // Estimate time based on type
  const estimatedTime = recommendation.type === 'overdue_review' ? '5 min' : '10 min';

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: duration.normal, 
        ease: easing.easeOut, 
        delay: index * 0.03 
      }}
      onClick={onStart}
      className={cn(
        'w-full text-left group flex items-start gap-3 p-4 rounded-xl',
        'bg-surface border border-border',
        'hover:border-primary/30 hover:shadow-raised transition-all'
      )}
    >
      {/* Left accent rail */}
      <div className={cn('w-1 self-stretch rounded-full shrink-0', config.accentColor)} />

      {/* Icon */}
      <div className="shrink-0 p-2 rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-body font-medium text-foreground line-clamp-2">
          {recommendation.label}
        </p>
        {recommendation.description && (
          <p className="text-meta text-muted-foreground line-clamp-1">
            {recommendation.description}
          </p>
        )}
        
        {/* Bottom row: badge + time + CTA */}
        <div className="flex items-center gap-2 pt-1">
          <span className={cn(
            'text-[11px] font-medium px-1.5 py-0.5 rounded',
            config.badgeClass
          )}>
            {config.badgeText}
          </span>
          <span className="text-meta text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {estimatedTime}
          </span>
          <span className="ml-auto text-meta font-medium text-foreground flex items-center gap-0.5 group-hover:text-primary transition-colors">
            {config.ctaText}
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </motion.button>
  );
}

interface RecommendationCardsProps {
  recommendations: PracticeRecommendation[];
  onStartRecommendation: (rec: PracticeRecommendation) => void;
  onCustomPractice: () => void;
}

export function RecommendationCards({ 
  recommendations, 
  onStartRecommendation,
  onCustomPractice 
}: RecommendationCardsProps) {
  // Get top 2 recommendations
  const topRecommendations = recommendations.slice(0, 2);

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.12 }}
      className="space-y-4"
    >
      {/* Section header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-body font-semibold text-foreground">Recommended for you</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-center">
                <p className="text-meta">Based on your mastery levels, spaced repetition schedule, and upcoming exams</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCustomPractice}
          className="gap-1 text-meta text-muted-foreground hover:text-foreground h-7 shrink-0"
        >
          See all
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Recommendation rows */}
      <div className="space-y-3">
        {topRecommendations.map((rec, index) => (
          <RecommendationRow
            key={rec.id}
            recommendation={rec}
            onStart={() => onStartRecommendation(rec)}
            index={index}
          />
        ))}

        {topRecommendations.length === 0 && (
          <div className="text-center py-8 rounded-xl border border-dashed border-border bg-muted/30">
            <p className="text-body text-muted-foreground">No recommendations yet</p>
            <p className="text-meta text-muted-foreground/70 mt-1">Complete more sessions to get personalized suggestions</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
