import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageTransition } from '@/components/motion/PageTransition';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useEnrollments } from '@/hooks/use-enrollments';
import { useProgressStats } from '@/hooks/use-progress-stats';
import { type TimeRange } from '@/types/progress';
import { StatCards } from '@/components/progress/StatCards';
import { ReviewForecastChart } from '@/components/progress/ReviewForecastChart';
import { TopicRiskList } from '@/components/progress/TopicRiskList';
import { ExamReadinessPanel } from '@/components/progress/ExamReadinessPanel';
import { ProgressFilters } from '@/components/progress/ProgressFilters';
import { NoCoursesEmptyState } from '@/components/shared/NoCoursesEmptyState';

export default function Progress(): React.ReactElement {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enrollments, isLoadingEnrollments } = useEnrollments();

  // Filter state
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [includeOverdue, setIncludeOverdue] = useState(true);

  // Derive course IDs for queries
  const allCourseIds = enrollments.map((e) => e.course_pack_id);
  const effectiveCourseIds = selectedCourseId ? [selectedCourseId] : allCourseIds;

  // Build course list for filter dropdown
  const courseOptions = enrollments.map((e) => ({
    id: e.course_pack_id,
    title: (e as Record<string, unknown>).course_packs
      ? ((e as Record<string, unknown>).course_packs as { title: string }).title
      : 'Course',
  }));

  const { topics, summary, forecast, isLoading: statsLoading } = useProgressStats({
    courseIds: effectiveCourseIds,
    timeRange,
  });

  const isLoading = isLoadingEnrollments || statsLoading;

  const hasEnrollments = enrollments.length > 0;
  const hasAttempts = summary.totalAttempts > 0;

  if (isLoading) {
    return (
      <PageTransition className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </PageTransition>
    );
  }

  // Case A: No enrollments
  if (!hasEnrollments) {
    return <NoCoursesEmptyState />;
  }

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Progress</h1>
          <p className="text-muted-foreground mt-1">
            FSRS-powered insights: what you know, what's fading, and what's next
          </p>
        </div>

        {/* Case B: Enrolled but no attempts yet */}
        {!hasAttempts && (
          <Card className="bg-surface shadow-surface rounded-xl overflow-hidden">
            <CardContent className="py-6 text-center space-y-3">
              <p className="text-muted-foreground">
                Start studying to see your progress here.
              </p>
              <Button variant="outline" onClick={() => navigate('/study')}>
                Start studying
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <ProgressFilters
          courses={courseOptions}
          selectedCourseId={selectedCourseId}
          onCourseChange={setSelectedCourseId}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />

        {/* Stat cards */}
        <StatCards summary={summary} />

        {/* Review forecast chart */}
        <ReviewForecastChart
          forecast={forecast}
          includeOverdue={includeOverdue}
          onIncludeOverdueChange={setIncludeOverdue}
        />

        {/* Exam readiness (only renders if upcoming exams exist) */}
        <ExamReadinessPanel courseIds={effectiveCourseIds} topics={topics} />

        {/* Topic risk list */}
        <TopicRiskList
          topics={topics}
          onPractice={(topicId) => {
            navigate(`/study?topicId=${topicId}`);
          }}
        />
      </div>
    </PageTransition>
  );
}
