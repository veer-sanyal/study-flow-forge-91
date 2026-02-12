import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/lib/supabase";
import { useAuth } from '@/hooks/use-auth';

export interface ExamReadiness {
  examId: string;
  examTitle: string;
  examDate: Date | null;
  daysUntil: number | null;
  courseId: string;
  courseTitle: string;
  coveragePercent: number;
  avgMastery: number;
  avgRetention: number;
  readinessScore: number;
  atRiskTopics: Array<{
    id: string;
    title: string;
    mastery: number;
    retention: number;
  }>;
  topicsInScope: number;
  topicsPracticed: number;
}

export function useExamReadiness() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['exam-readiness', user?.id],
    queryFn: async (): Promise<ExamReadiness[]> => {
      if (!user) return [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get upcoming exams
      const { data: exams, error: examsError } = await supabase
        .from('calendar_events')
        .select('id, title, event_date, course_pack_id')
        .in('event_type', ['midterm', 'exam', 'final'])
        .gte('event_date', today.toISOString())
        .order('event_date', { ascending: true })
        .limit(3);

      if (examsError || !exams || exams.length === 0) {
        return [];
      }

      // Get courses
      const courseIds = [...new Set(exams.map(e => e.course_pack_id).filter(Boolean))];
      const { data: courses } = await supabase
        .from('course_packs')
        .select('id, title')
        .in('id', courseIds);

      const courseMap = new Map(courses?.map(c => [c.id, c.title]) || []);

      // Get all topics with mastery data
      const { data: topics } = await supabase
        .from('topics')
        .select('id, title, course_pack_id, midterm_coverage, scheduled_week');

      const { data: masteryData } = await supabase
        .from('topic_mastery')
        .select('topic_id, mastery_0_1, retention_0_1')
        .eq('user_id', user.id);

      const masteryMap = new Map(
        masteryData?.map(m => [m.topic_id, { mastery: Number(m.mastery_0_1), retention: Number(m.retention_0_1) }]) || []
      );

      // Build readiness for each exam
      const readinessData: ExamReadiness[] = exams.map(exam => {
        const examDate = exam.event_date ? new Date(exam.event_date) : null;
        const daysUntil = examDate
          ? Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        // Get topics in scope for this exam's course
        // (topics from the same course that are scheduled before the exam)
        const examWeek = examDate ? Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7)) + getCurrentWeek() : 52;
        const topicsInScope = topics?.filter(t =>
          t.course_pack_id === exam.course_pack_id &&
          (t.scheduled_week === null || t.scheduled_week <= examWeek)
        ) || [];

        // Calculate metrics
        const practicedTopics = topicsInScope.filter(t => masteryMap.has(t.id));
        const coveragePercent = topicsInScope.length > 0
          ? Math.round((practicedTopics.length / topicsInScope.length) * 100)
          : 0;

        let avgMastery = 0;
        let avgRetention = 0;
        if (practicedTopics.length > 0) {
          avgMastery = practicedTopics.reduce((sum, t) => sum + (masteryMap.get(t.id)?.mastery || 0), 0) / practicedTopics.length;
          avgRetention = practicedTopics.reduce((sum, t) => sum + (masteryMap.get(t.id)?.retention || 0), 0) / practicedTopics.length;
        }

        // At-risk topics: practiced but retention < 50%, or unpracticed topics
        const atRiskTopics = topicsInScope
          .filter(t => {
            const m = masteryMap.get(t.id);
            // Not practiced OR retention too low
            return !m || m.retention < 0.5;
          })
          .map(t => {
            const m = masteryMap.get(t.id);
            return {
              id: t.id,
              title: t.title,
              mastery: m?.mastery || 0,
              retention: m?.retention || 0,
            };
          })
          .sort((a, b) => a.retention - b.retention);

        // Calculate readiness score
        const readinessScore = Math.round(
          (coveragePercent * 0.4) + (avgMastery * 100 * 0.3) + (avgRetention * 100 * 0.3)
        );

        return {
          examId: exam.id,
          examTitle: exam.title,
          examDate,
          daysUntil,
          courseId: exam.course_pack_id,
          courseTitle: courseMap.get(exam.course_pack_id) || 'Unknown Course',
          coveragePercent,
          avgMastery,
          avgRetention,
          readinessScore,
          atRiskTopics,
          topicsInScope: topicsInScope.length,
          topicsPracticed: practicedTopics.length,
        };
      });

      return readinessData;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

function getCurrentWeek(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil(diff / oneWeek);
}
