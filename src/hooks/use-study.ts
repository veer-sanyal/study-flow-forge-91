import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { StudyQuestion, mapDbQuestionToStudy, mapConfidenceToDb } from '@/types/study';
import { Tables } from '@/integrations/supabase/types';

type DbQuestion = Tables<'questions'>;
type DbTopic = Tables<'topics'>;

export function useStudyQuestions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['study-questions', user?.id],
    queryFn: async (): Promise<StudyQuestion[]> => {
      // Fetch all available questions
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .order('created_at', { ascending: true });

      if (questionsError) throw questionsError;

      // Fetch all topics for name lookup
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('*');

      if (topicsError) throw topicsError;

      // Create topic map for quick lookup
      const topicMap = new Map<string, DbTopic>();
      topics?.forEach(topic => topicMap.set(topic.id, topic));

      // Map to study questions
      return (questions || []).map(q => mapDbQuestionToStudy(q, topicMap));
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

interface SubmitAttemptParams {
  questionId: string;
  selectedChoiceId: string | null;
  isCorrect: boolean;
  confidence: number | null;
  hintUsed: boolean;
  guideUsed: boolean;
  timeSpentMs?: number;
}

export function useSubmitAttempt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SubmitAttemptParams) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('attempts')
        .insert({
          user_id: user.id,
          question_id: params.questionId,
          selected_choice_id: params.selectedChoiceId,
          is_correct: params.isCorrect,
          confidence: mapConfidenceToDb(params.confidence),
          hint_used: params.hintUsed,
          guide_used: params.guideUsed,
          time_spent_ms: params.timeSpentMs,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['topic-mastery'] });
      queryClient.invalidateQueries({ queryKey: ['srs-state'] });
    },
  });
}

export function useTopicMastery() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['topic-mastery', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topic_mastery')
        .select(`
          *,
          topics (
            id,
            title,
            description
          )
        `)
        .eq('user_id', user!.id);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useTopics() {
  return useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('scheduled_week', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
