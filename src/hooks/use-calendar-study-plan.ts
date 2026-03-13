import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useEnrollments } from '@/hooks/use-enrollments';

export interface StudyPlanDay {
  plan_date: string;
  new_topic_id: string | null;
  new_topic_title: string | null;
  new_question_count: number;
  review_question_count: number;
  intro_reinforcement_count: number;
  estimated_questions: number;
  estimated_minutes: number;
  has_missing_questions: boolean;
}

/** Aggregated per-date study plan data */
export interface StudyPlanDaySummary {
  date: string;
  newTopics: { topicId: string; title: string; questionCount: number }[];
  reviewCount: number;
  reinforcementCount: number;
  totalQuestions: number;
  estimatedMinutes: number;
  hasMissingQuestions: boolean;
}

export function useCalendarStudyPlan(startDate?: string, endDate?: string): {
  data: Map<string, StudyPlanDaySummary>;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const { enrolledCourseIdsArray } = useEnrollments();

  const today = new Date();
  const defaultStart = startDate || formatDate(today);
  const defaultEnd = endDate || formatDate(new Date(today.getTime() + 14 * 86400000));

  const query = useQuery({
    queryKey: ['calendar-study-plan', user?.id, defaultStart, defaultEnd, enrolledCourseIdsArray],
    queryFn: async (): Promise<StudyPlanDay[]> => {
      if (!user) return [];

      const { data, error } = await (supabase.rpc as CallableFunction)(
        'get_calendar_study_plan',
        {
          p_user_id: user.id,
          p_start_date: defaultStart,
          p_end_date: defaultEnd,
          p_enrolled_course_ids: enrolledCourseIdsArray.length > 0 ? enrolledCourseIdsArray : null,
        }
      );

      if (error) throw error;
      return (data || []) as StudyPlanDay[];
    },
    enabled: !!user,
    staleTime: 2 * 60_000,
  });

  // Aggregate rows by date (multiple new_topic rows can share a date)
  const aggregated = new Map<string, StudyPlanDaySummary>();

  for (const row of query.data || []) {
    const dateKey = row.plan_date.slice(0, 10);
    let entry = aggregated.get(dateKey);
    if (!entry) {
      entry = {
        date: dateKey,
        newTopics: [],
        reviewCount: row.review_question_count,
        reinforcementCount: row.intro_reinforcement_count,
        totalQuestions: 0,
        estimatedMinutes: 0,
        hasMissingQuestions: row.has_missing_questions,
      };
      aggregated.set(dateKey, entry);
    }

    if (row.new_topic_id && row.new_topic_title) {
      entry.newTopics.push({
        topicId: row.new_topic_id,
        title: row.new_topic_title,
        questionCount: row.new_question_count,
      });
    }

    // Review/reinforcement are per-date (same for all rows on that date), take max
    entry.reviewCount = Math.max(entry.reviewCount, row.review_question_count);
    entry.reinforcementCount = Math.max(entry.reinforcementCount, row.intro_reinforcement_count);
    entry.hasMissingQuestions = entry.hasMissingQuestions || row.has_missing_questions;
  }

  // Compute totals
  for (const entry of aggregated.values()) {
    const newCount = entry.newTopics.reduce((sum, t) => sum + t.questionCount, 0);
    entry.totalQuestions = newCount + entry.reviewCount + entry.reinforcementCount;
    entry.estimatedMinutes = Math.ceil(entry.totalQuestions * 1.5);
  }

  return {
    data: aggregated,
    isLoading: query.isLoading,
  };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
