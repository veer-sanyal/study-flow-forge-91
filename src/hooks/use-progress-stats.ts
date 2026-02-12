import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { supabase } from "@/lib/supabase";
import { useAuth } from '@/hooks/use-auth';
import {
  type TopicProgressRow,
  type ProgressSummary,
  type ForecastDay,
  type TimeRange,
} from '@/types/progress';
import {
  projectRetention,
  classifyRisk,
  computeMedian,
} from '@/lib/fsrs-stats';
import { format, addDays } from 'date-fns';

interface UseProgressStatsOptions {
  courseIds: string[];
  timeRange: TimeRange;
}

interface ProgressStatsResult {
  topics: TopicProgressRow[];
  summary: ProgressSummary;
  forecast: ForecastDay[];
  isLoading: boolean;
}

function timeRangeToDays(range: TimeRange): number {
  switch (range) {
    case '7d': return 7;
    case '30d': return 30;
    case 'all': return 3650; // ~10 years
  }
}

export function useProgressStats(options: UseProgressStatsOptions): ProgressStatsResult {
  const { user } = useAuth();
  const { courseIds, timeRange } = options;
  const daysBack = timeRangeToDays(timeRange);

  // RPC 1: Per-topic stats
  const topicsQuery = useQuery({
    queryKey: ['progress-stats', user?.id, courseIds, daysBack],
    queryFn: async () => {
      if (!user) return [];
      return logger.time('progress-stats RPC', async () => {
        const { data, error } = await (supabase.rpc as any)('get_progress_stats', {
          p_user_id: user.id,
          p_course_ids: courseIds.length > 0 ? courseIds : undefined,
          p_days_back: daysBack,
        });
        if (error) throw error;
        return (data ?? []) as Array<{
          topic_id: string;
          topic_title: string;
          course_pack_id: string | null;
          total_cards: number;
          new_cards: number;
          learning_cards: number;
          review_cards: number;
          due_today: number;
          median_stability: number | null;
          p10_stability: number | null;
          median_difficulty: number | null;
          median_elapsed_days: number | null;
          attempts_count: number;
          correct_count: number;
          total_reps: number;
          total_lapses: number;
        }>;
      });
    },
    enabled: !!user && courseIds.length > 0,
    staleTime: 60_000,
  });

  // RPC 2: Review forecast
  const forecastQuery = useQuery({
    queryKey: ['review-forecast', user?.id, courseIds],
    queryFn: async () => {
      if (!user) return [];
      return logger.time('review-forecast RPC', async () => {
        const { data, error } = await (supabase.rpc as any)('get_review_forecast', {
          p_user_id: user.id,
          p_course_ids: courseIds.length > 0 ? courseIds : undefined,
          p_days_ahead: 14,
        });
        if (error) throw error;
        return (data ?? []) as Array<{
          due_date: string;
          course_pack_id: string | null;
          review_count: number;
          is_overdue: boolean;
        }>;
      });
    },
    enabled: !!user && courseIds.length > 0,
    staleTime: 60_000,
  });

  // Client-side: compute R per topic and build summary
  const rawRows = topicsQuery.data ?? [];

  const topics: TopicProgressRow[] = rawRows.map((row) => {
    const rNow =
      row.median_stability != null && row.median_stability > 0 && row.median_elapsed_days != null
        ? projectRetention(row.median_stability, row.median_elapsed_days)
        : null;

    return {
      topic_id: row.topic_id,
      topic_title: row.topic_title,
      course_pack_id: row.course_pack_id,
      total_cards: row.total_cards,
      new_cards: row.new_cards,
      learning_cards: row.learning_cards,
      review_cards: row.review_cards,
      due_today: row.due_today,
      median_stability: row.median_stability,
      p10_stability: row.p10_stability,
      median_difficulty: row.median_difficulty,
      median_elapsed_days: row.median_elapsed_days,
      attempts_count: row.attempts_count,
      correct_count: row.correct_count,
      total_reps: row.total_reps,
      total_lapses: row.total_lapses,
      r_now: rNow,
      risk: classifyRisk(rNow),
    };
  });

  // Build global summary
  const totalDueToday = topics.reduce((s, t) => s + t.due_today, 0);
  const atRiskTopicCount = topics.filter((t) => t.risk !== 'safe').length;

  const stabilities = topics
    .map((t) => t.median_stability)
    .filter((v): v is number => v != null && v > 0);
  const difficulties = topics
    .map((t) => t.median_difficulty)
    .filter((v): v is number => v != null);

  const totalAttempts = topics.reduce((s, t) => s + t.attempts_count, 0);
  const totalCorrect = topics.reduce((s, t) => s + t.correct_count, 0);

  const summary: ProgressSummary = {
    totalDueToday,
    atRiskTopicCount,
    globalMedianStability: computeMedian(stabilities),
    globalMedianDifficulty: computeMedian(difficulties),
    observedRecall: totalAttempts > 0 ? totalCorrect / totalAttempts : null,
    targetRetention: 0.9,
    totalAttempts,
  };

  // Build forecast days (fill in gaps for 14 days)
  const rawForecast = forecastQuery.data ?? [];
  const today = new Date();
  const forecastMap = new Map<string, ForecastDay>();

  // Initialize 14 days
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const iso = format(d, 'yyyy-MM-dd');
    forecastMap.set(iso, {
      date: iso,
      label: format(d, 'EEE d'),
      reviewCount: 0,
      coursePackId: null,
      isOverdue: false,
    });
  }

  // Fill from RPC data
  for (const row of rawForecast) {
    const existing = forecastMap.get(row.due_date);
    if (existing) {
      existing.reviewCount += row.review_count;
      existing.isOverdue = existing.isOverdue || row.is_overdue;
      existing.coursePackId = row.course_pack_id;
    }
  }

  const forecast = Array.from(forecastMap.values());

  return {
    topics,
    summary,
    forecast,
    isLoading: topicsQuery.isLoading || forecastQuery.isLoading,
  };
}
