import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { StudyQuestion, mapDbQuestionToStudy, mapConfidenceToDb } from '@/types/study';
import { Tables } from '@/integrations/supabase/types';

type DbQuestion = Tables<'questions'>;
type DbTopic = Tables<'topics'>;

// Parameters for the recommendation algorithm
interface RecommendationParams {
  limit?: number;
  currentWeek?: number;
  paceOffset?: number;
  targetDifficulty?: number;
}

export function useStudyQuestions(params: RecommendationParams = {}) {
  const { user } = useAuth();
  const { 
    limit = 10, 
    currentWeek = 1, 
    paceOffset = 1, 
    targetDifficulty = 3 
  } = params;

  return useQuery({
    queryKey: ['study-questions', user?.id, limit, currentWeek, paceOffset, targetDifficulty],
    queryFn: async (): Promise<StudyQuestion[]> => {
      if (!user) throw new Error('User not authenticated');

      // Call the recommendation algorithm function
      const { data: recommended, error: recError } = await supabase
        .rpc('get_recommended_questions', {
          p_user_id: user.id,
          p_limit: limit,
          p_current_week: currentWeek,
          p_pace_offset: paceOffset,
          p_target_difficulty: targetDifficulty,
        });

      if (recError) {
        console.error('Recommendation error:', recError);
        // Fallback to simple query if recommendation fails
        const { data: questions, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .eq('needs_review', false)
          .order('created_at', { ascending: true })
          .limit(limit);

        if (questionsError) throw questionsError;

        const { data: topics } = await supabase.from('topics').select('*');
        const topicMap = new Map<string, DbTopic>();
        topics?.forEach(topic => topicMap.set(topic.id, topic));

        return (questions || []).map(q => mapDbQuestionToStudy(q, topicMap));
      }

      // Fetch topics for name lookup
      const { data: topics, error: topicsError } = await supabase
        .from('topics')
        .select('*');

      if (topicsError) throw topicsError;

      const topicMap = new Map<string, DbTopic>();
      topics?.forEach(topic => topicMap.set(topic.id, topic));

      // Map recommended questions to StudyQuestion format
      return (recommended || []).map((q: any) => ({
        id: q.question_id,
        prompt: q.prompt,
        choices: q.choices as any,
        correctChoiceId: q.choices?.find((c: any) => c.isCorrect)?.id || null,
        hint: q.hint,
        difficulty: q.difficulty || 3,
        topicIds: q.topic_ids || [],
        topicNames: (q.topic_ids || []).map((id: string) => topicMap.get(id)?.title || 'Unknown Topic'),
        sourceExam: q.source_exam,
        solutionSteps: q.solution_steps as string[] | null,
        questionType: 'multiple_choice', // Default for now
        // Include scoring metadata for debugging
        _score: q.score,
        _dueUrgency: q.due_urgency,
        _knowledgeGap: q.knowledge_gap,
      }));
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes (shorter since recommendations change)
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
