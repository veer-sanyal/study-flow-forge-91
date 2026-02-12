import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/lib/supabase";
import { useAuth } from '@/hooks/use-auth';
import { useUserSettings } from '@/hooks/use-settings';
import { useEnrollments } from '@/hooks/use-enrollments';
import { FocusPreset } from '@/contexts/FocusContext';

// ============================================
// UNIFIED DASHBOARD PAYLOAD
// ============================================

export interface LastSession {
  questionId: string;
  questionPrompt: string;
  courseId: string | null;
  courseTitle: string | null;
  topicId: string | null;
  topicTitle: string | null;
  timestamp: Date;
  totalAttempts: number;
  correctCount: number;
}

export interface TodayPlanSummary {
  totalQuestions: number;
  completedQuestions: number;
  correctCount: number;
  estimatedMinutes: number;
  primaryCourse: { id: string; title: string } | null;
  alsoDueCourses: { id: string; title: string; count: number }[];
  progressPercent: number;
}

export interface PracticeRecommendation {
  id: string;
  type: 'weak_topic' | 'overdue_review' | 'upcoming_exam' | 'question_type';
  label: string;
  description: string;
  icon: 'target' | 'refresh' | 'calendar' | 'alert';
  priority: number; // Lower = higher priority
  filters: Partial<{
    topicIds: string[];
    questionTypeId: string;
    midtermNumber: number;
  }>;
}

export interface StudyStats {
  streak: number;
  weeklyAccuracy: number;
  reviewsDue: number;
  questionsToday: number;
}

export interface StudyDashboardData {
  todayPlan: TodayPlanSummary;
  practiceRecommendations: PracticeRecommendation[];
  lastSession: LastSession | null;
  presets: FocusPreset[];
  stats: StudyStats;
}

export function useStudyDashboard() {
  const { user } = useAuth();
  const { settings } = useUserSettings();
  const { enrolledCourseIdsArray, isLoadingEnrollments } = useEnrollments();
  const dailyGoal = settings?.daily_goal || 10;
  const dailyPlanMode = settings?.daily_plan_mode || 'single_course';

  return useQuery({
    queryKey: ['study-dashboard', user?.id, dailyGoal, dailyPlanMode, enrolledCourseIdsArray],
    queryFn: async (): Promise<StudyDashboardData> => {
      if (!user) {
        return {
          todayPlan: {
            totalQuestions: dailyGoal,
            completedQuestions: 0,
            correctCount: 0,
            estimatedMinutes: Math.round(dailyGoal * 1.5),
            primaryCourse: null,
            alsoDueCourses: [],
            progressPercent: 0,
          },
          practiceRecommendations: [],
          lastSession: null,
          presets: [],
          stats: {
            streak: 0,
            weeklyAccuracy: 0,
            reviewsDue: 0,
            questionsToday: 0,
          },
        };
      }

      // Run all queries in parallel
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate week ago for weekly stats
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [
        attemptsResult,
        coursesResult,
        upcomingExamsResult,
        overdueReviewsResult,
        weakTopicsResult,
        lastSessionResult,
        weeklyAttemptsResult,
      ] = await Promise.all([
        // Today's attempts
        supabase
          .from('attempts')
          .select('id, is_correct, question_id')
          .eq('user_id', user.id)
          .gte('created_at', today.toISOString()),

        // Published courses (filter to enrolled only)
        supabase
          .from('course_packs')
          .select('id, title')
          .eq('is_published', true)
          .in('id', enrolledCourseIdsArray.length > 0 ? enrolledCourseIdsArray : ['00000000-0000-0000-0000-000000000000']),

        // Upcoming exams (filter to enrolled courses)
        enrolledCourseIdsArray.length > 0
          ? supabase
            .from('calendar_events')
            .select('id, title, event_date, course_pack_id')
            .eq('event_type', 'exam')
            .in('course_pack_id', enrolledCourseIdsArray)
            .gte('event_date', today.toISOString())
            .order('event_date', { ascending: true })
            .limit(5)
          : Promise.resolve({ data: [], error: null }),

        // Overdue SRS reviews (filter to enrolled courses via question)
        supabase
          .from('srs_state')
          .select(`
            question_id,
            questions!inner(course_pack_id)
          `)
          .eq('user_id', user.id)
          .lt('due_at', new Date().toISOString())
          .in('questions.course_pack_id', enrolledCourseIdsArray.length > 0 ? enrolledCourseIdsArray : ['00000000-0000-0000-0000-000000000000']),

        // Weak topics (low mastery, filter to enrolled courses)
        enrolledCourseIdsArray.length > 0
          ? supabase
            .from('topic_mastery')
            .select(`
                topic_id,
                mastery_0_1,
                topics!inner(id, title, course_pack_id)
              `)
            .eq('user_id', user.id)
            .in('topics.course_pack_id', enrolledCourseIdsArray)
            .order('mastery_0_1', { ascending: true })
            .limit(5)
          : Promise.resolve({ data: [], error: null }),

        // Last session (most recent attempt)
        supabase
          .from('attempts')
          .select(`
            id,
            created_at,
            question_id,
            is_correct,
            questions!inner(id, prompt, course_pack_id, topic_ids)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),

        // Weekly attempts (for 7-day accuracy)
        supabase
          .from('attempts')
          .select('id, is_correct, created_at')
          .eq('user_id', user.id)
          .gte('created_at', weekAgo.toISOString()),
      ]);

      // Process today's attempts
      const todayAttempts = attemptsResult.data || [];
      const completedQuestions = todayAttempts.length;
      const correctCount = todayAttempts.filter(a => a.is_correct).length;
      const progressPercent = dailyGoal > 0
        ? Math.round((completedQuestions / dailyGoal) * 100)
        : 0;

      // Process courses and exams
      const courses = coursesResult.data || [];
      const upcomingExams = upcomingExamsResult.data || [];

      let primaryCourse: { id: string; title: string } | null = null;
      const alsoDueCourses: { id: string; title: string; count: number }[] = [];

      if (dailyPlanMode === 'single_course' && upcomingExams.length > 0) {
        const soonestExam = upcomingExams[0];
        const course = courses.find(c => c.id === soonestExam.course_pack_id);
        if (course) {
          primaryCourse = { id: course.id, title: course.title };
        }

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

      // Build practice recommendations
      const practiceRecommendations: PracticeRecommendation[] = [];

      // 1. Overdue reviews (highest priority)
      const overdueCount = overdueReviewsResult.data?.length || 0;
      if (overdueCount > 0) {
        practiceRecommendations.push({
          id: 'overdue-reviews',
          type: 'overdue_review',
          label: `${overdueCount} overdue review${overdueCount > 1 ? 's' : ''}`,
          description: 'Highest impact on retention',
          icon: 'refresh',
          priority: 1,
          filters: {},
        });
      }

      // 2. Weak topics
      const weakTopics = (weakTopicsResult.data || []).filter(
        (tm: any) => tm.topics && tm.mastery_0_1 < 0.7
      );
      if (weakTopics.length > 0) {
        const weakest = weakTopics[0] as any;
        practiceRecommendations.push({
          id: 'weak-topic',
          type: 'weak_topic',
          label: `Weak: ${weakest.topics.title}`,
          description: `${Math.round(weakest.mastery_0_1 * 100)}% mastery`,
          icon: 'target',
          priority: 2,
          filters: {
            topicIds: [weakest.topic_id],
          },
        });
      }

      // 3. Upcoming exam
      if (upcomingExams.length > 0) {
        const nextExam = upcomingExams[0];
        let daysUntil: number | null = null;
        if (nextExam.event_date) {
          const examDate = new Date(nextExam.event_date);
          examDate.setHours(0, 0, 0, 0);
          daysUntil = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        const daysText = daysUntil === 0 ? 'today' :
          daysUntil === 1 ? 'tomorrow' :
            daysUntil !== null ? `in ${daysUntil} days` : '';

        let midtermNumber: number | null = null;
        const midtermMatch = nextExam.title.match(/midterm\s*(\d)/i);
        if (midtermMatch) {
          midtermNumber = parseInt(midtermMatch[1], 10);
        }

        practiceRecommendations.push({
          id: 'upcoming-exam',
          type: 'upcoming_exam',
          label: nextExam.title,
          description: daysText,
          icon: 'calendar',
          priority: 3,
          filters: {
            midtermNumber: midtermNumber ?? undefined,
          },
        });
      }

      // Build last session data
      let lastSession: LastSession | null = null;
      const lastAttempts = lastSessionResult.data || [];

      if (lastAttempts.length > 0) {
        // Find the most recent session (consecutive attempts within a short time)
        const recentAttempt = lastAttempts[0] as any;
        const sessionAttempts = lastAttempts.filter((a: any) => {
          const diff = new Date(recentAttempt.created_at).getTime() - new Date(a.created_at).getTime();
          return diff < 30 * 60 * 1000; // Within 30 minutes
        });

        // Get course info for display
        const courseId = recentAttempt.questions?.course_pack_id;
        const course = courseId ? courses.find(c => c.id === courseId) : null;

        // Get first topic for display
        const topicIds = recentAttempt.questions?.topic_ids || [];
        let topicTitle: string | null = null;
        if (topicIds.length > 0) {
          const { data: topic } = await supabase
            .from('topics')
            .select('title')
            .eq('id', topicIds[0])
            .single();
          topicTitle = topic?.title || null;
        }

        lastSession = {
          questionId: recentAttempt.question_id,
          questionPrompt: recentAttempt.questions?.prompt?.substring(0, 60) + '...' || '',
          courseId: courseId || null,
          courseTitle: course?.title || null,
          topicId: topicIds[0] || null,
          topicTitle,
          timestamp: new Date(recentAttempt.created_at),
          totalAttempts: sessionAttempts.length,
          correctCount: sessionAttempts.filter((a: any) => a.is_correct).length,
        };
      }

      // Build presets from recommendations
      const presets: FocusPreset[] = practiceRecommendations.slice(0, 3).map(rec => ({
        id: rec.id,
        label: rec.label,
        description: rec.description,
        isRecommended: rec.priority <= 2,
        icon: rec.icon,
        filters: rec.filters,
      }));

      // Calculate stats
      const weeklyAttempts = weeklyAttemptsResult.data || [];
      const weeklyCorrect = weeklyAttempts.filter(a => a.is_correct).length;
      const weeklyAccuracy = weeklyAttempts.length > 0
        ? Math.round((weeklyCorrect / weeklyAttempts.length) * 100)
        : 0;

      // Calculate streak (consecutive days with attempts)
      // For now, simplified: just check if there are attempts today
      const streak = completedQuestions > 0 ? 1 : 0; // Simplified for now

      return {
        todayPlan: {
          totalQuestions: dailyGoal,
          completedQuestions,
          correctCount,
          estimatedMinutes: Math.round(Math.max(0, dailyGoal - completedQuestions) * 1.5),
          primaryCourse,
          alsoDueCourses,
          progressPercent,
        },
        practiceRecommendations,
        lastSession,
        presets,
        stats: {
          streak,
          weeklyAccuracy,
          reviewsDue: overdueCount,
          questionsToday: completedQuestions,
        },
      };
    },
    enabled: !!user && !isLoadingEnrollments,
    staleTime: 30 * 1000, // 30 seconds
  });
}
