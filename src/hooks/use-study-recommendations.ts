import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { FocusPreset } from './use-focus';

// Weak areas based on topic mastery
export interface WeakArea {
  id: string;
  title: string;
  mastery: number;
  type: 'topic' | 'questionType';
}

export function useWeakAreas(courseIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['weak-areas', user?.id, courseIds],
    queryFn: async () => {
      if (!user) return { weakTopics: [], weakTypes: [] };

      // Fetch topic mastery for user
      let topicQuery = supabase
        .from('topic_mastery')
        .select(`
          topic_id,
          mastery_0_1,
          topics!inner(id, title, course_pack_id)
        `)
        .eq('user_id', user.id)
        .order('mastery_0_1', { ascending: true })
        .limit(5);

      if (courseIds.length > 0) {
        topicQuery = topicQuery.in('topics.course_pack_id', courseIds);
      }

      const { data: topicData, error: topicError } = await topicQuery;
      
      const weakTopics: WeakArea[] = [];
      if (!topicError && topicData) {
        topicData.forEach((tm: any) => {
          if (tm.topics && tm.mastery_0_1 < 0.7) {
            weakTopics.push({
              id: tm.topic_id,
              title: tm.topics.title,
              mastery: tm.mastery_0_1,
              type: 'topic',
            });
          }
        });
      }

      // Fetch question types with low performance from attempts
      // This is a simplified version - could be expanded
      const weakTypes: WeakArea[] = [];

      return { weakTopics, weakTypes };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

// Overdue SRS reviews
export function useOverdueReviews(courseIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['overdue-reviews', user?.id, courseIds],
    queryFn: async () => {
      if (!user) return { count: 0, questionIds: [] };

      let query = supabase
        .from('srs_state')
        .select('question_id, questions!inner(id, course_pack_id)')
        .eq('user_id', user.id)
        .lt('due_at', new Date().toISOString());

      if (courseIds.length > 0) {
        query = query.in('questions.course_pack_id', courseIds);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        count: data?.length || 0,
        questionIds: data?.map((s: any) => s.question_id) || [],
      };
    },
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Today's plan stats
export interface TodayPlanStats {
  totalQuestions: number;
  completedQuestions: number;
  correctCount: number;
  estimatedMinutes: number;
  primaryCourse: { id: string; title: string } | null;
  alsoDueCourses: { id: string; title: string; count: number }[];
}

export function useTodayPlanStats(dailyGoal: number, dailyPlanMode: 'single_course' | 'mixed') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['today-plan-stats', user?.id, dailyGoal, dailyPlanMode],
    queryFn: async (): Promise<TodayPlanStats> => {
      if (!user) {
        return {
          totalQuestions: dailyGoal,
          completedQuestions: 0,
          correctCount: 0,
          estimatedMinutes: Math.round(dailyGoal * 1.5),
          primaryCourse: null,
          alsoDueCourses: [],
        };
      }

      // Get today's attempts
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: todayAttempts, error: attemptsError } = await supabase
        .from('attempts')
        .select('id, is_correct, question_id')
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString());

      const completedQuestions = todayAttempts?.length || 0;
      const correctCount = todayAttempts?.filter(a => a.is_correct).length || 0;

      // Get published courses with upcoming exams
      const { data: coursesData } = await supabase
        .from('course_packs')
        .select('id, title')
        .eq('is_published', true);

      const courses = coursesData || [];

      // Get upcoming exams to determine primary course
      const { data: upcomingExams } = await supabase
        .from('calendar_events')
        .select('id, title, event_date, course_pack_id')
        .eq('event_type', 'exam')
        .gte('event_date', today.toISOString())
        .order('event_date', { ascending: true })
        .limit(5);

      let primaryCourse: { id: string; title: string } | null = null;
      const alsoDueCourses: { id: string; title: string; count: number }[] = [];

      if (dailyPlanMode === 'single_course' && upcomingExams && upcomingExams.length > 0) {
        // Primary course is the one with the soonest exam
        const soonestExam = upcomingExams[0];
        const course = courses.find(c => c.id === soonestExam.course_pack_id);
        if (course) {
          primaryCourse = { id: course.id, title: course.title };
        }

        // Other courses with exams
        const otherCourseIds = new Set(
          upcomingExams
            .slice(1)
            .map(e => e.course_pack_id)
            .filter(id => id !== primaryCourse?.id)
        );

        otherCourseIds.forEach(courseId => {
          const course = courses.find(c => c.id === courseId);
          if (course) {
            alsoDueCourses.push({ id: course.id, title: course.title, count: 2 });
          }
        });
      }

      const remaining = Math.max(0, dailyGoal - completedQuestions);
      
      return {
        totalQuestions: dailyGoal,
        completedQuestions,
        correctCount,
        estimatedMinutes: Math.round(remaining * 1.5),
        primaryCourse,
        alsoDueCourses,
      };
    },
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Generate recommended presets based on user data
export function useRecommendedPresets(courseIds: string[]): FocusPreset[] {
  const { data: upcomingExams } = useUpcomingExamsForPresets(courseIds);
  const { data: weakAreas } = useWeakAreas(courseIds);
  const { data: overdueReviews } = useOverdueReviews(courseIds);

  const presets: FocusPreset[] = [];

  // Upcoming midterm preset
  if (upcomingExams && upcomingExams.length > 0) {
    const nextExam = upcomingExams.find(e => e.daysUntil !== null && e.daysUntil >= 0);
    if (nextExam) {
      const daysText = nextExam.daysUntil === 0 ? 'today' : 
                       nextExam.daysUntil === 1 ? 'tomorrow' : 
                       `in ${nextExam.daysUntil} days`;
      presets.push({
        id: 'upcoming-exam',
        label: nextExam.title,
        description: daysText,
        isRecommended: true,
        icon: 'calendar',
        filters: {
          midtermNumber: nextExam.midtermNumber,
        },
      });
    }
  }

  // Weak topic preset
  if (weakAreas?.weakTopics && weakAreas.weakTopics.length > 0) {
    const weakest = weakAreas.weakTopics[0];
    presets.push({
      id: 'weak-topic',
      label: `Weak: ${weakest.title}`,
      description: `${Math.round(weakest.mastery * 100)}% mastery`,
      isRecommended: true,
      icon: 'target',
      filters: {
        topicIds: [weakest.id],
      },
    });
  }

  // Overdue reviews preset
  if (overdueReviews && overdueReviews.count > 0) {
    presets.push({
      id: 'overdue-reviews',
      label: `${overdueReviews.count} overdue reviews`,
      description: 'Due for review',
      isRecommended: true,
      icon: 'refresh',
      filters: {
        // Special case handled in the study hook
      },
    });
  }

  return presets;
}

// Helper hook for presets
function useUpcomingExamsForPresets(courseIds: string[]) {
  return useQuery({
    queryKey: ['upcoming-exams-presets', courseIds],
    queryFn: async () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      let query = supabase
        .from('calendar_events')
        .select('id, title, event_date, course_pack_id')
        .eq('event_type', 'exam')
        .gte('event_date', now.toISOString())
        .order('event_date', { ascending: true })
        .limit(3);

      if (courseIds.length > 0) {
        query = query.in('course_pack_id', courseIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(exam => {
        let midtermNumber: number | null = null;
        const midtermMatch = exam.title.match(/midterm\s*(\d)/i);
        if (midtermMatch) {
          midtermNumber = parseInt(midtermMatch[1], 10);
        }

        let daysUntil: number | null = null;
        if (exam.event_date) {
          const examDate = new Date(exam.event_date);
          examDate.setHours(0, 0, 0, 0);
          daysUntil = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
          id: exam.id,
          title: exam.title,
          midtermNumber,
          daysUntil,
          coursePackId: exam.course_pack_id,
        };
      });
    },
  });
}
