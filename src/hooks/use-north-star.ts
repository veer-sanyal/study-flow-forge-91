import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useEnrollments } from '@/hooks/use-enrollments';

// North Star metric bundle — see docs/metrics.md. Computed server-side by the
// get_north_star_metrics RPC. The hook is defensive: if the RPC isn't deployed yet it
// returns null (no retry) so the UI simply hides rather than erroring.
export interface NorthStarMetrics {
  week_start: string;
  north_star: { durable_mastery_items: number };
  inputs: {
    topic_breadth: number;
    new_first_attempt_acc: number;
    promotion_rate: number;
    review_completion_rate: number;
  };
  guardrails: {
    cram_rate: number;
    high_conf_wrong_rate: number;
    retention_30d: number;
    max_topic_share: number;
    active_days: number;
    attempts: number;
  };
}

export function useNorthStar(): { data: NorthStarMetrics | null; isLoading: boolean } {
  const { user } = useAuth();
  const { enrolledCourseIdsArray } = useEnrollments();

  const query = useQuery({
    queryKey: ['north-star', user?.id, enrolledCourseIdsArray],
    queryFn: async (): Promise<NorthStarMetrics | null> => {
      if (!user) return null;
      const { data, error } = await (supabase.rpc as CallableFunction)('get_north_star_metrics', {
        p_user_id: user.id,
        p_enrolled_course_ids: enrolledCourseIdsArray.length > 0 ? enrolledCourseIdsArray : null,
      });
      if (error) return null; // RPC not deployed / not permitted → hide the card
      return (typeof data === 'string' ? JSON.parse(data) : data) as NorthStarMetrics;
    },
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  return { data: query.data ?? null, isLoading: query.isLoading };
}
