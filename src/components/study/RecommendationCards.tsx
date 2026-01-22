import { motion } from 'framer-motion';
import { Target, RefreshCw, Calendar, Zap, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fadeSlideUp, duration, easing, stagger } from '@/lib/motion';
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
    accentClass: 'bg-warning/10 text-warning border-warning/20',
    badgeClass: 'bg-warning/10 text-warning',
    label: 'High impact',
  },
  weak_topic: {
    icon: Target,
    accentClass: 'bg-destructive/10 text-destructive border-destructive/20',
    badgeClass: 'bg-destructive/10 text-destructive',
    label: 'Needs work',
  },
  upcoming_exam: {
    icon: Calendar,
    accentClass: 'bg-primary/10 text-primary border-primary/20',
    badgeClass: 'bg-primary/10 text-primary',
    label: 'Exam prep',
  },
  question_type: {
    icon: Zap,
    accentClass: 'bg-muted text-muted-foreground border-border',
    badgeClass: 'bg-muted text-muted-foreground',
    label: 'Practice',
  },
};

function RecommendationRow({ recommendation, onStart, index }: RecommendationRowProps) {
  const config = typeConfig[recommendation.type];
  const Icon = config.icon;
  
  // Estimate time based on type
  const estimatedTime = recommendation.type === 'overdue_review' ? '5 min' : '10 min';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ 
        duration: duration.normal, 
        ease: easing.easeOut, 
        delay: index * 0.05 
      }}
      className={cn(
        'group flex items-center gap-3 p-3 rounded-lg border',
        'hover:bg-muted/50 transition-colors cursor-pointer',
        config.accentClass
      )}
      onClick={onStart}
    >
      {/* Icon badge */}
      <div className={cn(
        'shrink-0 p-2 rounded-lg',
        config.badgeClass
      )}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-body font-medium text-foreground truncate">
          {recommendation.label}
        </p>
        {recommendation.description && (
          <p className="text-meta text-muted-foreground truncate">
            {recommendation.description}
          </p>
        )}
      </div>

      {/* Right side: time estimate + action */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          'text-[11px] font-medium px-2 py-0.5 rounded-full',
          config.badgeClass
        )}>
          {config.label}
        </span>
        <span className="text-meta text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {estimatedTime}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </div>
    </motion.div>
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
  // Get top 3 recommendations
  const topRecommendations = recommendations.slice(0, 3);

  return (
    <motion.div
      {...fadeSlideUp}
      transition={{ duration: duration.normal, ease: easing.easeOut, delay: 0.15 }}
      className="space-y-3"
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-body font-semibold text-foreground">Recommended for you</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCustomPractice}
          className="gap-1 text-meta text-muted-foreground hover:text-foreground"
        >
          Custom practice
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Recommendation rows */}
      <div className="space-y-2">
        {topRecommendations.map((rec, index) => (
          <RecommendationRow
            key={rec.id}
            recommendation={rec}
            onStart={() => onStartRecommendation(rec)}
            index={index}
          />
        ))}

        {topRecommendations.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-body">No recommendations yet</p>
            <p className="text-meta">Complete more practice sessions to get personalized suggestions</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
