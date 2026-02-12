import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/hooks/use-auth';
import { logger } from '@/lib/logger';
import { useUserSettings } from '@/hooks/use-settings';
import { Tables } from '@/integrations/supabase/types';

type DbTopic = Tables<'topics'>;

// Question category returned by build_daily_plan
export type QuestionCategory = 'review' | 'current' | 'bridge' | 'stretch';

// Extended study question with category and why_selected
export interface DailyPlanQuestion {
  id: string;
  prompt: string;
  choices: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    imageUrl?: string;
  }> | null;
  correctChoiceId: string | null;
  hint: string | null;
  difficulty: number;
  topicIds: string[];
  topicNames: string[];
  sourceExam: string | null;
  solutionSteps: string[] | null;
  questionType: string;
  imageUrl: string | null;
  guideMeSteps: any;
  // New fields from build_daily_plan
  category: QuestionCategory;
  whySelected: string;
  priorityScore: number;
}

export interface DailyPlanMix {
  review: number;
  current: number;
  bridge: number;
  stretch: number;
}

export interface DailyPlanData {
  questions: DailyPlanQuestion[];
  mix: DailyPlanMix;
  isBehind: boolean;
  estimatedMinutes: number;
}

interface UseDailyPlanParams {
  limit?: number;
  courseId?: string | null;
  enabled?: boolean;
}

export function useDailyPlan(params: UseDailyPlanParams = {}) {
  const { user } = useAuth();
  const { settings } = useUserSettings();

  const limit = params.limit ?? settings.daily_goal ?? 10;
  const courseId = params.courseId ?? null;
  const paceOffset = settings.pace_offset ?? 1;

  return useQuery({
    queryKey: ['daily-plan', user?.id, limit, courseId, paceOffset],
    queryFn: async (): Promise<DailyPlanData> => {
      if (!user) throw new Error('User not authenticated');

      return logger.time('build_daily_plan', async () => {
        // Call the new build_daily_plan RPC
        const { data: planData, error: planError } = await supabase
          .rpc('build_daily_plan', {
            p_user_id: user.id,
            p_course_id: courseId || undefined,
            p_limit: limit,
            p_pace_offset: paceOffset,
          });

        if (planError) {
          console.error('Daily plan error:', planError);
          throw planError;
        }

        // Fetch topics for name lookup
        const { data: topics } = await supabase
          .from('topics')
          .select('*');

        const topicMap = new Map<string, DbTopic>();
        topics?.forEach(topic => topicMap.set(topic.id, topic));

        // Get full question data (for guide_me_steps and image_url)
        const questionIds = (planData || []).map((q: any) => q.question_id);
        const { data: fullQuestions } = await supabase
          .from('questions')
          .select('id, guide_me_steps, image_url')
          .in('id', questionIds);

        const questionExtras = new Map<string, { guide_me_steps: any; image_url: string | null }>();
        fullQuestions?.forEach(q => questionExtras.set(q.id, {
          guide_me_steps: q.guide_me_steps,
          image_url: q.image_url
        }));

        // Map plan questions to DailyPlanQuestion format
        const questions: DailyPlanQuestion[] = (planData || []).map((q: any) => {
          const extras = questionExtras.get(q.question_id);
          const choices = q.choices as any[] | null;
          const correctChoice = choices?.find(c => c.isCorrect);

          return {
            id: q.question_id,
            prompt: q.prompt,
            choices,
            correctChoiceId: correctChoice?.id || null,
            hint: q.hint,
            difficulty: q.difficulty || 3,
            topicIds: q.topic_ids || [],
            topicNames: (q.topic_ids || []).map((id: string) => topicMap.get(id)?.title || 'Unknown Topic'),
            sourceExam: q.source_exam,
            solutionSteps: q.solution_steps as string[] | null,
            questionType: 'multiple_choice',
            imageUrl: extras?.image_url || null,
            guideMeSteps: extras?.guide_me_steps || null,
            category: q.category as QuestionCategory,
            whySelected: q.why_selected,
            priorityScore: q.priority_score,
          };
        });

        // Calculate mix counts
        const mix: DailyPlanMix = {
          review: questions.filter(q => q.category === 'review').length,
          current: questions.filter(q => q.category === 'current').length,
          bridge: questions.filter(q => q.category === 'bridge').length,
          stretch: questions.filter(q => q.category === 'stretch').length,
        };

        // Detect if user is in catch-up mode (bridge > 0 means behind)
        const isBehind = mix.bridge > 0;

        // Estimate time (1.5 min per question)
        const estimatedMinutes = Math.round(questions.length * 1.5);

        return {
          questions,
          mix,
          isBehind,
          estimatedMinutes,
        };
      }); // end logger.time
    },
    enabled: (params.enabled ?? true) && !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Helper to get category display info
export function getCategoryInfo(category: QuestionCategory): {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  icon: 'refresh' | 'book' | 'ladder' | 'rocket';
} {
  switch (category) {
    case 'review':
      return {
        label: 'Review',
        description: 'Retention refresh',
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
        icon: 'refresh',
      };
    case 'current':
      return {
        label: 'Current',
        description: 'Recent topics',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
        icon: 'book',
      };
    case 'bridge':
      return {
        label: 'Catch-up',
        description: 'Foundation building',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30',
        icon: 'ladder',
      };
    case 'stretch':
      return {
        label: 'Challenge',
        description: 'Level up',
        color: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-100 dark:bg-purple-900/30',
        icon: 'rocket',
      };
  }
}
