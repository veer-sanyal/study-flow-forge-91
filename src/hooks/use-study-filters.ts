import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StudyFilters {
  courseId: string | null;
  examName: string | null;
  topicIds: string[];
  questionTypeId: string | null;
}

const DEFAULT_FILTERS: StudyFilters = {
  courseId: null,
  examName: null,
  topicIds: [],
  questionTypeId: null,
};

export function useStudyFilters() {
  const [filters, setFilters] = useState<StudyFilters>(DEFAULT_FILTERS);

  const setCourseId = useCallback((courseId: string | null) => {
    setFilters(prev => ({
      ...DEFAULT_FILTERS,
      courseId,
    }));
  }, []);

  const setExamName = useCallback((examName: string | null) => {
    setFilters(prev => ({
      ...prev,
      examName,
      // Keep course, clear downstream filters
      topicIds: [],
      questionTypeId: null,
    }));
  }, []);

  const setTopicIds = useCallback((topicIds: string[]) => {
    setFilters(prev => ({
      ...prev,
      topicIds,
    }));
  }, []);

  const setQuestionTypeId = useCallback((questionTypeId: string | null) => {
    setFilters(prev => ({
      ...prev,
      questionTypeId,
    }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.courseId !== null ||
      filters.examName !== null ||
      filters.topicIds.length > 0 ||
      filters.questionTypeId !== null
    );
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.courseId) count++;
    if (filters.examName) count++;
    if (filters.topicIds.length > 0) count++;
    if (filters.questionTypeId) count++;
    return count;
  }, [filters]);

  return {
    filters,
    setCourseId,
    setExamName,
    setTopicIds,
    setQuestionTypeId,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
  };
}

// Fetch published courses
export function useCourses() {
  return useQuery({
    queryKey: ['courses-published'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_packs')
        .select('id, title')
        .eq('is_published', true)
        .order('title');

      if (error) throw error;
      return data || [];
    },
  });
}

// Fetch distinct exams for a course
export function useExamsForCourse(courseId: string | null) {
  return useQuery({
    queryKey: ['exams-for-course', courseId],
    queryFn: async () => {
      if (!courseId) return [];

      const { data, error } = await supabase
        .from('questions')
        .select('source_exam')
        .eq('course_pack_id', courseId)
        .eq('needs_review', false)
        .not('source_exam', 'is', null);

      if (error) throw error;

      // Get unique exam names
      const uniqueExams = [...new Set(data?.map(q => q.source_exam).filter(Boolean))] as string[];
      return uniqueExams.sort();
    },
    enabled: !!courseId,
  });
}

// Fetch topics for a course
export function useTopicsForCourse(courseId: string | null) {
  return useQuery({
    queryKey: ['topics-for-course', courseId],
    queryFn: async () => {
      if (!courseId) return [];

      const { data, error } = await supabase
        .from('topics')
        .select('id, title')
        .eq('course_pack_id', courseId)
        .order('scheduled_week', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!courseId,
  });
}

// Fetch question types for a course
export function useQuestionTypesForCourse(courseId: string | null) {
  return useQuery({
    queryKey: ['question-types-for-course', courseId],
    queryFn: async () => {
      if (!courseId) return [];

      const { data, error } = await supabase
        .from('question_types')
        .select('id, name')
        .or(`course_pack_id.eq.${courseId},course_pack_id.is.null`)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!courseId,
  });
}
