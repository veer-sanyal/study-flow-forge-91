import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/lib/supabase";
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { StudyQuestion, mapDbQuestionToStudy, mapConfidenceToDb, deriveFsrsRating } from '@/types/study';
import { Tables } from '@/integrations/supabase/types';
import { dbRowToCard, cardToDbRow, createEmptyCard } from '@/lib/fsrs';
import { fsrsInstance } from '@/lib/fsrs';

type DbQuestion = Tables<'questions'>;
type DbTopic = Tables<'topics'>;

// Parameters for the recommendation algorithm
interface RecommendationParams {
  limit?: number;
  currentWeek?: number;
  paceOffset?: number;
  targetDifficulty?: number;
  // Filter parameters
  courseId?: string | null;
  examName?: string | null;
  topicIds?: string[];
  questionTypeId?: string | null;
  // Enrolled courses for filtering
  enrolledCourseIds?: string[];
  // When true, ignores topic coverage and difficulty constraints (for custom focus)
  ignoreConstraints?: boolean;
}

export function useStudyQuestions(params: RecommendationParams = {}) {
  const { user } = useAuth();
  const {
    limit = 10,
    currentWeek = 1,
    paceOffset = 1,
    targetDifficulty = 3,
    courseId = null,
    examName = null,
    topicIds = [],
    questionTypeId = null,
    enrolledCourseIds = [],
    ignoreConstraints = false,
  } = params;

  // Determine effective course filter
  // If specific courseId is set, use it. Otherwise, use first enrolled course for single-course mode
  const effectiveCourseId = courseId || (enrolledCourseIds.length === 1 ? enrolledCourseIds[0] : null);

  return useQuery({
    queryKey: ['study-questions', user?.id, limit, currentWeek, paceOffset, targetDifficulty, effectiveCourseId, examName, topicIds, questionTypeId, enrolledCourseIds, ignoreConstraints],
    queryFn: async (): Promise<StudyQuestion[]> => {
      if (!user) throw new Error('User not authenticated');

      // If user has enrollments but none match current filter, return empty
      if (enrolledCourseIds.length > 0 && effectiveCourseId && !enrolledCourseIds.includes(effectiveCourseId)) {
        return [];
      }

      // Call the recommendation algorithm function with filter parameters
      // Note: p_topic_ids is now uuid[] type in the database
      const { data: recommended, error: recError } = await supabase
        .rpc('get_recommended_questions', {
          p_user_id: user.id,
          p_limit: limit,
          p_current_week: currentWeek,
          p_pace_offset: paceOffset,
          p_target_difficulty: targetDifficulty,
          p_course_id: effectiveCourseId || undefined,
          p_exam_name: examName || undefined,
          p_topic_ids: topicIds.length > 0 ? topicIds : undefined,
          p_question_type_id: questionTypeId || undefined,
          p_ignore_constraints: ignoreConstraints,
          p_enrolled_course_ids: enrolledCourseIds.length > 0 ? enrolledCourseIds : undefined,
        } as any);

      if (recError) {
        console.error('Recommendation error:', recError);
        // Fallback to simple query if recommendation fails
        let fallbackQuery = supabase
          .from('questions')
          .select('*')
          .eq('needs_review', false);

        // Filter by enrolled courses
        if (enrolledCourseIds.length > 0) {
          fallbackQuery = fallbackQuery.in('course_pack_id', enrolledCourseIds);
        }

        const { data: questions, error: questionsError } = await fallbackQuery
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

      // Fetch full question data to include guide_me_steps, subparts, question_format, course_pack_id
      const questionIds = (recommended || []).map((q: any) => q.question_id);
      const { data: fullQuestions } = await supabase
        .from('questions')
        .select('id, guide_me_steps, image_url, question_format, subparts, course_pack_id')
        .in('id', questionIds);

      const questionExtras = new Map<string, {
        guide_me_steps: any;
        image_url: string | null;
        question_format: string | null;
        subparts: any;
        course_pack_id: string | null;
      }>();
      fullQuestions?.forEach(q => questionExtras.set(q.id, {
        guide_me_steps: q.guide_me_steps,
        image_url: q.image_url,
        question_format: q.question_format,
        subparts: q.subparts,
        course_pack_id: q.course_pack_id,
      }));

      // Fetch course names for all unique course_pack_ids
      const courseIds = [...new Set(
        (fullQuestions || []).map(q => q.course_pack_id).filter(Boolean)
      )] as string[];
      const courseNameMap = new Map<string, string>();
      if (courseIds.length > 0) {
        const { data: courses } = await supabase
          .from('course_packs')
          .select('id, title')
          .in('id', courseIds);
        courses?.forEach(c => courseNameMap.set(c.id, c.title));
      }

      // Map recommended questions to StudyQuestion format
      const studyQuestions = (recommended || []).map((q: any) => {
        const extras = questionExtras.get(q.question_id);
        const hasSubparts = extras?.subparts && Array.isArray(extras.subparts) && extras.subparts.length > 0;

        // Log questions with subparts for debugging
        if (hasSubparts) {
          console.log('[useStudyQuestions] Multi-part question found:', {
            id: q.question_id,
            subpartCount: extras.subparts.length,
            format: extras.question_format,
          });
        }

        const cpId = extras?.course_pack_id || null;
        return {
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
          questionType: extras?.question_format || 'multiple_choice',
          imageUrl: extras?.image_url || null,
          guideMeSteps: extras?.guide_me_steps || null,
          questionFormat: (extras?.question_format || 'multiple_choice') as 'multiple_choice' | 'short_answer' | 'numeric',
          subparts: extras?.subparts || null,
          coursePackId: cpId,
          courseName: cpId ? (courseNameMap.get(cpId) || null) : null,
          // Include scoring metadata for debugging
          _score: q.score,
          _dueUrgency: q.due_urgency,
          _knowledgeGap: q.knowledge_gap,
        };
      });

      console.log('[useStudyQuestions] Returned questions:', {
        total: studyQuestions.length,
        withSubparts: studyQuestions.filter(q => q.subparts && q.subparts.length > 0).length,
      });

      return studyQuestions;
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
  subpartId?: string;        // For multi-part questions
  answerText?: string;       // For free response
}

export function useSubmitAttempt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: SubmitAttemptParams) => {
      if (!user) throw new Error('User not authenticated');

      console.log('[useSubmitAttempt] Submitting attempt:', {
        questionId: params.questionId,
        isCorrect: params.isCorrect,
        userId: user.id,
      });

      // 1. Derive FSRS rating from correctness + confidence
      const rating = deriveFsrsRating(params.isCorrect, params.confidence);

      // 2. Fetch current SRS state (if any)
      const { data: existing } = await supabase
        .from('srs_state')
        .select('*')
        .eq('user_id', user.id)
        .eq('question_id', params.questionId)
        .maybeSingle();

      // 3. Build card from existing data or create new
      // DB now has full FSRS columns: stability, difficulty, elapsed_days, scheduled_days, lapses, learning_steps, state
      const now = new Date();
      const card = existing
        ? dbRowToCard({
          due_at: existing.due_at,
          last_reviewed_at: existing.last_reviewed_at,
          reps: existing.reps,
          stability: (existing as any).stability ?? existing.interval_days ?? 1,
          difficulty: (existing as any).difficulty ?? 5,
          elapsed_days: (existing as any).elapsed_days ?? 0,
          scheduled_days: (existing as any).scheduled_days ?? existing.interval_days ?? 0,
          lapses: (existing as any).lapses ?? 0,
          learning_steps: (existing as any).learning_steps ?? 0,
          state: (existing as any).state ?? (existing.reps > 0 ? 2 : 0),
        })
        : createEmptyCard(now);

      // 4. Run FSRS scheduling client-side
      const result = fsrsInstance.repeat(card, now);
      const updatedCard = result[rating].card;
      const dbRow = cardToDbRow(updatedCard);

      // 5. Upsert SRS state with full FSRS fields
      const { error: srsError } = await supabase
        .from('srs_state')
        .upsert({
          user_id: user.id,
          question_id: params.questionId,
          due_at: dbRow.due_at,
          last_reviewed_at: dbRow.last_reviewed_at,
          reps: dbRow.reps,
          interval_days: dbRow.scheduled_days, // Keep for backward compatibility
          ease: 2.5 - (dbRow.difficulty - 5) * 0.08, // Keep for backward compatibility
          // Full FSRS-6 fields
          stability: dbRow.stability,
          difficulty: dbRow.difficulty,
          elapsed_days: dbRow.elapsed_days,
          scheduled_days: dbRow.scheduled_days,
          lapses: dbRow.lapses,
          learning_steps: dbRow.learning_steps,
          state: dbRow.state,
        } as any, {
          onConflict: 'user_id,question_id',
        });

      if (srsError) {
        console.error('[useSubmitAttempt] Error upserting SRS state:', srsError);
        throw srsError;
      }

      // 6. Insert attempt row (topic mastery handled by DB trigger)
      const { data, error } = await supabase
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
          subpart_id: params.subpartId,
          answer_text: params.answerText,
          fsrs_rating: rating,
        } as any)
        .select();

      if (error) {
        console.error('[useSubmitAttempt] Error saving attempt:', error);
        throw error;
      }

      console.log('[useSubmitAttempt] Attempt saved successfully:', data);
      return data;
    },
    onSuccess: () => {
      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['topic-mastery'] });
      queryClient.invalidateQueries({ queryKey: ['srs-state'] });
      queryClient.invalidateQueries({ queryKey: ['study-dashboard'] });
    },
    onError: (error) => {
      console.error('[useSubmitAttempt] Mutation error:', error);
      toast({
        title: "Failed to save progress",
        description: "Your answer wasn't recorded. Please try again.",
        variant: "destructive",
      });
    },
  });
}

export function useTopicMastery(enrolledCourseIds?: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['topic-mastery', user?.id, enrolledCourseIds],
    queryFn: async () => {
      let query = supabase
        .from('topic_mastery')
        .select(`
          *,
          topics!inner(
            id,
            title,
            description,
            course_pack_id
          )
        `)
        .eq('user_id', user!.id);

      // Filter by enrolled courses if provided
      if (enrolledCourseIds && enrolledCourseIds.length > 0) {
        query = query.in('topics.course_pack_id', enrolledCourseIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useTopics(enrolledCourseIds?: string[]) {
  return useQuery({
    queryKey: ['topics', enrolledCourseIds],
    queryFn: async () => {
      let query = supabase
        .from('topics')
        .select('*')
        .order('scheduled_date', { ascending: true });

      // Filter by enrolled courses if provided
      if (enrolledCourseIds && enrolledCourseIds.length > 0) {
        query = query.in('course_pack_id', enrolledCourseIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
