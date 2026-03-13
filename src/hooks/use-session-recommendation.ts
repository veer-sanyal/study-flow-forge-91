import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useEnrollments } from '@/hooks/use-enrollments';

export interface SessionRecommendation {
  srs_due_count: number;
  new_question_count: number;
  recommended_total: number;
  estimated_minutes: number;
  intensity: 'light' | 'moderate' | 'heavy';
}

export function useSessionRecommendation(): {
  data: SessionRecommendation | null;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const { enrolledCourseIdsArray } = useEnrollments();

  const query = useQuery({
    queryKey: ['session-recommendation', user?.id, enrolledCourseIdsArray],
    queryFn: async (): Promise<SessionRecommendation> => {
      if (!user) throw new Error('Not authenticated');

      // Sync topic introductions first
      await (supabase.rpc as CallableFunction)('sync_topic_introductions', {
        p_user_id: user.id,
      });

      const { data, error } = await (supabase.rpc as CallableFunction)(
        'get_recommended_session_size',
        {
          p_user_id: user.id,
          p_enrolled_course_ids: enrolledCourseIdsArray.length > 0 ? enrolledCourseIdsArray : null,
        }
      );

      if (error) throw error;

      // RPC returns JSON, parse if string
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return parsed as SessionRecommendation;
    },
    enabled: !!user,
    staleTime: 60_000, // 1 minute
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
  };
}
