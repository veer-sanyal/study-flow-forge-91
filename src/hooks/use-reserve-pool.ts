import { useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useEnrollments } from '@/hooks/use-enrollments';
import { StudyQuestion } from '@/types/study';

interface ReserveQuestion {
  question_id: string;
  prompt: string;
  choices: unknown;
  correct_answer: string;
  hint: string | null;
  solution_steps: unknown;
  difficulty: number;
  topic_ids: string[];
  course_pack_id: string | null;
}

export function useReservePool(): {
  fetchReserve: (topicIds: string[], excludeIds: string[]) => Promise<void>;
  getReserveForTopic: (topicId: string, maxDifficulty?: number) => ReserveQuestion | null;
  reserveCount: () => number;
  needsRefetch: () => boolean;
} {
  const { user } = useAuth();
  const { enrolledCourseIdsArray } = useEnrollments();
  const poolRef = useRef<ReserveQuestion[]>([]);
  const attemptedIdsRef = useRef<Set<string>>(new Set());

  const fetchReserve = useCallback(async (topicIds: string[], excludeIds: string[]): Promise<void> => {
    if (!user || topicIds.length === 0) return;

    // Merge attempted IDs into exclude list
    const allExcluded = [...new Set([...excludeIds, ...attemptedIdsRef.current])];

    const { data, error } = await (supabase.rpc as CallableFunction)('get_reserve_questions', {
      p_user_id: user.id,
      p_topic_ids: topicIds,
      p_exclude_ids: allExcluded.length > 0 ? allExcluded : null,
      p_per_topic_limit: 5,
      p_enrolled_course_ids: enrolledCourseIdsArray.length > 0 ? enrolledCourseIdsArray : null,
    });

    if (error) {
      console.error('[useReservePool] Error fetching reserve:', error);
      return;
    }

    poolRef.current = (data || []) as ReserveQuestion[];
  }, [user, enrolledCourseIdsArray]);

  const getReserveForTopic = useCallback((topicId: string, maxDifficulty?: number): ReserveQuestion | null => {
    const pool = poolRef.current;
    const match = pool.find(q => {
      if (attemptedIdsRef.current.has(q.question_id)) return false;
      if (!q.topic_ids.includes(topicId)) return false;
      if (maxDifficulty !== undefined && q.difficulty > maxDifficulty) return false;
      return true;
    });

    if (match) {
      // Mark as used — remove from pool
      poolRef.current = pool.filter(q => q.question_id !== match.question_id);
      attemptedIdsRef.current.add(match.question_id);
    }

    return match ?? null;
  }, []);

  const reserveCount = useCallback((): number => {
    return poolRef.current.filter(q => !attemptedIdsRef.current.has(q.question_id)).length;
  }, []);

  const needsRefetch = useCallback((): boolean => {
    return reserveCount() < 5;
  }, [reserveCount]);

  return { fetchReserve, getReserveForTopic, reserveCount, needsRefetch };
}
