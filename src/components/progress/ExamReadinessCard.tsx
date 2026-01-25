import { motion } from 'framer-motion';
import { Calendar, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { fadeSlideUp } from '@/lib/motion';

interface ExamReadinessProps {
  examTitle: string;
  examDate: Date | null;
  daysUntil: number | null;
  coveragePercent: number; // Topics practiced / topics in scope
  avgMastery: number; // 0-1
  avgRetention: number; // 0-1
  atRiskTopics: Array<{ id: string; title: string; retention: number }>;
  className?: string;
}

export function ExamReadinessCard({
  examTitle,
  examDate,
  daysUntil,
  coveragePercent,
  avgMastery,
  avgRetention,
  atRiskTopics,
  className,
}: ExamReadinessProps) {
  // Calculate overall readiness score
  // Weighted: coverage 40%, mastery 30%, retention 30%
  const readinessScore = Math.round(
    (coveragePercent * 0.4) + (avgMastery * 100 * 0.3) + (avgRetention * 100 * 0.3)
  );

  const getReadinessColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-primary';
    if (score >= 40) return 'text-amber-500';
    return 'text-destructive';
  };

  const getReadinessLabel = (score: number) => {
    if (score >= 80) return 'Ready';
    if (score >= 60) return 'On Track';
    if (score >= 40) return 'Needs Work';
    return 'At Risk';
  };

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="visible"
      className={className}
    >
      <Card className={cn(
        readinessScore < 40 && 'border-destructive/30',
        readinessScore >= 40 && readinessScore < 60 && 'border-accent/30'
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                {examTitle}
              </CardTitle>
              {daysUntil !== null && (
                <p className="text-sm text-muted-foreground">
                  {daysUntil === 0 ? 'Today' : 
                   daysUntil === 1 ? 'Tomorrow' : 
                   `In ${daysUntil} days`}
                </p>
              )}
            </div>
            <div className="text-right">
              <span className={cn('text-3xl font-bold', getReadinessColor(readinessScore))}>
                {readinessScore}%
              </span>
              <p className={cn('text-xs font-medium', getReadinessColor(readinessScore))}>
                {getReadinessLabel(readinessScore)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Readiness breakdown */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coverage</span>
                <span className="font-medium">{coveragePercent}%</span>
              </div>
              <Progress value={coveragePercent} className="h-2" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Mastery</span>
                <span className="font-medium">{Math.round(avgMastery * 100)}%</span>
              </div>
              <Progress value={avgMastery * 100} className="h-2" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Retention</span>
                <span className="font-medium">{Math.round(avgRetention * 100)}%</span>
              </div>
              <Progress 
                value={avgRetention * 100} 
                className={cn(
                  'h-2',
                  avgRetention < 0.5 && '[&>div]:bg-destructive'
                )} 
              />
            </div>
          </div>

          {/* At-risk topics */}
          {atRiskTopics.length > 0 && (
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-accent">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>At Risk ({atRiskTopics.length} topics)</span>
              </div>
              <div className="space-y-1">
                {atRiskTopics.slice(0, 3).map((topic) => (
                  <div 
                    key={topic.id}
                    className="flex items-center justify-between text-sm py-1 px-2 rounded bg-accent/5"
                  >
                    <span className="truncate">{topic.title}</span>
                    <span className="text-destructive font-medium shrink-0 ml-2">
                      {Math.round(topic.retention * 100)}%
                    </span>
                  </div>
                ))}
                {atRiskTopics.length > 3 && (
                  <p className="text-xs text-muted-foreground pl-2">
                    +{atRiskTopics.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
