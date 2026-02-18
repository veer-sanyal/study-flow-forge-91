import { useMemo } from 'react';
import { Calendar, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUpcomingExams } from '@/hooks/use-calendar';
import { type TopicProgressRow, type ExamProjection, type TopicExamProjection } from '@/types/progress';
import { projectRetention, classifyRisk, riskColorClass } from '@/lib/fsrs-stats';

interface ExamReadinessPanelProps {
  courseIds: string[];
  topics: TopicProgressRow[];
}

function buildExamProjections(
  exams: Array<{
    id: string;
    title: string;
    course_title: string;
    event_date: string | null;
    daysUntil: number;
  }>,
  topics: TopicProgressRow[],
  targetRetention: number,
): ExamProjection[] {
  return exams.map((exam) => {
    const topicProjections: TopicExamProjection[] = topics
      .map((t) => {
        const currentR = t.r_now ?? 0;
        const projectedR =
          t.median_stability != null && t.median_stability > 0 && t.median_elapsed_days != null
            ? projectRetention(t.median_stability, t.median_elapsed_days, exam.daysUntil)
            : currentR;

        let recommendation: string | null = null;
        if (projectedR < targetRetention) {
          const deficit = targetRetention - projectedR;
          if (deficit > 0.3) {
            recommendation = 'Review multiple times before exam';
          } else if (deficit > 0.1) {
            recommendation = 'Review 2x before exam';
          } else {
            recommendation = 'Review once before exam';
          }
        }

        return {
          topicId: t.topic_id,
          topicTitle: t.topic_title,
          currentR,
          projectedR,
          medianStability: t.median_stability,
          recommendation,
        };
      })
      .sort((a, b) => a.projectedR - b.projectedR);

    const rValues = topicProjections.map((t) => t.projectedR);
    const overallProjectedR =
      rValues.length > 0 ? rValues.reduce((s, v) => s + v, 0) / rValues.length : 0;

    return {
      examId: exam.id,
      examTitle: exam.title,
      courseTitle: exam.course_title,
      examDate: exam.event_date ?? '',
      daysUntil: exam.daysUntil,
      overallProjectedR,
      topics: topicProjections,
    };
  });
}

export function ExamReadinessPanel({
  courseIds,
  topics,
}: ExamReadinessPanelProps): React.ReactElement | null {
  const { data: upcomingExams } = useUpcomingExams(courseIds);

  const projections = useMemo(() => {
    if (!upcomingExams || upcomingExams.length === 0) return [];
    return buildExamProjections(upcomingExams, topics, 0.9);
  }, [upcomingExams, topics]);

  const hasStudyData = topics.some((t) => t.attempts_count > 0);

  if (projections.length === 0) return null;

  if (!hasStudyData) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Not enough data yet — start studying to see exam readiness projections.
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {projections.map((exam) => {
        const overallRisk = classifyRisk(exam.overallProjectedR);
        const atRiskTopics = exam.topics.filter((t) => t.projectedR < 0.9);

        return (
          <Card key={exam.examId}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    {exam.examTitle}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {exam.courseTitle}
                    {' \u00b7 '}
                    {exam.daysUntil === 0
                      ? 'Today'
                      : exam.daysUntil === 1
                        ? 'Tomorrow'
                        : `In ${exam.daysUntil} days`}
                  </p>
                </div>
                <div className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={cn('text-sm font-mono cursor-default', riskColorClass(overallRisk))}
                      >
                        R: {Math.round(exam.overallProjectedR * 100)}%
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">Projected retrievability — your estimated average recall across all topics on exam day.</p>
                    </TooltipContent>
                  </Tooltip>
                  <p className="text-xs text-muted-foreground mt-1">projected at exam</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {atRiskTopics.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All topics are projected above target retention at exam date.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{atRiskTopics.length} topics below target at exam date</span>
                  </div>
                  <div className="space-y-1">
                    {atRiskTopics.slice(0, 5).map((t) => {
                      const risk = classifyRisk(t.projectedR);
                      return (
                        <div
                          key={t.topicId}
                          className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/50"
                        >
                          <span className="truncate flex-1">{t.topicTitle}</span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <Badge
                              variant="outline"
                              className={cn('text-xs font-mono', riskColorClass(risk))}
                            >
                              {Math.round(t.projectedR * 100)}%
                            </Badge>
                            {t.recommendation && (
                              <span className="text-xs text-muted-foreground hidden sm:inline">
                                {t.recommendation}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {atRiskTopics.length > 5 && (
                      <p className="text-xs text-muted-foreground pl-2">
                        +{atRiskTopics.length - 5} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
    </TooltipProvider>
  );
}
