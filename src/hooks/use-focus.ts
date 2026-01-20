import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';

// Filter configuration for the focus system
export interface FocusFilters {
  courseIds: string[];
  examNames: string[];
  midtermNumber: number | null;
  topicIds: string[];
  questionTypeId: string | null;
}

export interface FocusPreset {
  id: string;
  label: string;
  description?: string;
  isRecommended?: boolean;
  filters: Partial<FocusFilters>;
  icon?: 'target' | 'alert' | 'calendar' | 'refresh';
}

const DEFAULT_FILTERS: FocusFilters = {
  courseIds: [],
  examNames: [],
  midtermNumber: null,
  topicIds: [],
  questionTypeId: null,
};

export type NarrowByOption = 'midterm' | 'exam' | 'topics' | 'types' | null;

export function useFocus() {
  const [filters, setFilters] = useState<FocusFilters>(DEFAULT_FILTERS);
  const [narrowBy, setNarrowBy] = useState<NarrowByOption>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const setCourseIds = useCallback((courseIds: string[]) => {
    setFilters(prev => ({
      ...DEFAULT_FILTERS,
      courseIds,
    }));
    setNarrowBy(null);
  }, []);

  const setExamNames = useCallback((examNames: string[]) => {
    setFilters(prev => ({
      ...prev,
      examNames,
    }));
  }, []);

  const setMidtermNumber = useCallback((midtermNumber: number | null) => {
    setFilters(prev => ({
      ...prev,
      midtermNumber,
      // Clear exam filter when selecting midterm
      examNames: [],
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

  const applyPreset = useCallback((preset: FocusPreset) => {
    setFilters(prev => ({
      ...prev,
      ...preset.filters,
    }));
    setIsDrawerOpen(false);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setNarrowBy(null);
  }, []);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.courseIds.length > 0 ||
      filters.examNames.length > 0 ||
      filters.midtermNumber !== null ||
      filters.topicIds.length > 0 ||
      filters.questionTypeId !== null
    );
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.courseIds.length > 0) count++;
    if (filters.examNames.length > 0) count++;
    if (filters.midtermNumber !== null) count++;
    if (filters.topicIds.length > 0) count++;
    if (filters.questionTypeId !== null) count++;
    return count;
  }, [filters]);

  // Generate summary text for the Focus Pill
  const filterSummary = useMemo(() => {
    if (!hasActiveFilters) return 'All courses';
    
    const parts: string[] = [];
    
    if (filters.courseIds.length === 1) {
      // Will be resolved by the component with course name
      parts.push('{{course}}');
    } else if (filters.courseIds.length > 1) {
      parts.push(`${filters.courseIds.length} courses`);
    }
    
    if (filters.midtermNumber) {
      parts.push(`Midterm ${filters.midtermNumber}`);
    }
    
    if (filters.examNames.length === 1) {
      parts.push(filters.examNames[0]);
    } else if (filters.examNames.length > 1) {
      parts.push(`${filters.examNames.length} exams`);
    }
    
    if (filters.topicIds.length > 0) {
      parts.push(`${filters.topicIds.length} topic${filters.topicIds.length > 1 ? 's' : ''}`);
    }
    
    if (filters.questionTypeId) {
      parts.push('1 type');
    }
    
    return parts.join(' • ') || 'All courses';
  }, [filters, hasActiveFilters]);

  return {
    filters,
    narrowBy,
    setNarrowBy,
    isDrawerOpen,
    setIsDrawerOpen,
    setCourseIds,
    setExamNames,
    setMidtermNumber,
    setTopicIds,
    setQuestionTypeId,
    applyPreset,
    clearFilters,
    hasActiveFilters,
    activeFilterCount,
    filterSummary,
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

// Fetch upcoming exams from calendar_events
export interface UpcomingExam {
  id: string;
  title: string;
  midtermNumber: number | null;
  eventDate: string | null;
  daysUntil: number | null;
  coursePackId: string;
}

export function useUpcomingExams(courseIds: string[]) {
  return useQuery({
    queryKey: ['upcoming-exams', courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) {
        // Fetch all published course exams
        const { data, error } = await supabase
          .from('calendar_events')
          .select('id, title, event_date, course_pack_id')
          .eq('event_type', 'exam')
          .order('event_date', { ascending: true });

        if (error) throw error;
        return processExams(data || []);
      }

      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, event_date, course_pack_id')
        .eq('event_type', 'exam')
        .in('course_pack_id', courseIds)
        .order('event_date', { ascending: true });

      if (error) throw error;
      return processExams(data || []);
    },
    enabled: true,
  });
}

function processExams(data: any[]): UpcomingExam[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return data.map(exam => {
    // Extract midterm number from title
    let midtermNumber: number | null = null;
    const midtermMatch = exam.title.match(/midterm\s*(\d)/i);
    if (midtermMatch) {
      midtermNumber = parseInt(midtermMatch[1], 10);
    } else if (/final/i.test(exam.title)) {
      midtermNumber = null; // null indicates final
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
      eventDate: exam.event_date,
      daysUntil,
      coursePackId: exam.course_pack_id,
    };
  });
}

// Fetch topics grouped by midterm coverage
export interface TopicGroup {
  midtermNumber: number | null;
  label: string;
  topics: { id: string; title: string }[];
}

export function useTopicsGroupedByMidterm(courseIds: string[]) {
  return useQuery({
    queryKey: ['topics-by-midterm', courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return [];

      const { data, error } = await supabase
        .from('topics')
        .select('id, title, midterm_coverage')
        .in('course_pack_id', courseIds)
        .order('scheduled_week', { ascending: true });

      if (error) throw error;

      // Group by midterm_coverage
      const groups: Map<number | null, TopicGroup> = new Map();
      
      (data || []).forEach(topic => {
        const coverage = topic.midterm_coverage;
        if (!groups.has(coverage)) {
          groups.set(coverage, {
            midtermNumber: coverage,
            label: coverage ? `Midterm ${coverage} Topics` : 'Final Topics',
            topics: [],
          });
        }
        groups.get(coverage)!.topics.push({ id: topic.id, title: topic.title });
      });

      // Sort: midterm 1, 2, 3, then final (null)
      return Array.from(groups.values()).sort((a, b) => {
        if (a.midtermNumber === null) return 1;
        if (b.midtermNumber === null) return -1;
        return a.midtermNumber - b.midtermNumber;
      });
    },
    enabled: courseIds.length > 0,
  });
}

// Fetch question types for courses
export function useQuestionTypesForCourses(courseIds: string[]) {
  return useQuery({
    queryKey: ['question-types-for-courses', courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) {
        // Fetch all active types
        const { data, error } = await supabase
          .from('question_types')
          .select('id, name')
          .eq('status', 'active')
          .order('name');

        if (error) throw error;
        return data || [];
      }

      const { data, error } = await supabase
        .from('question_types')
        .select('id, name')
        .or(`course_pack_id.in.(${courseIds.join(',')}),course_pack_id.is.null`)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      return data || [];
    },
  });
}

// Fetch past exams grouped by year/semester
export interface ExamYear {
  year: string;
  semesters: {
    semester: string;
    exams: string[];
  }[];
}

export function usePastExamsHierarchy(courseIds: string[]) {
  return useQuery({
    queryKey: ['past-exams-hierarchy', courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return [];

      const { data, error } = await supabase
        .from('questions')
        .select('source_exam')
        .in('course_pack_id', courseIds)
        .eq('needs_review', false)
        .not('source_exam', 'is', null);

      if (error) throw error;

      // Get unique exam names and parse them
      const uniqueExams = [...new Set(data?.map(q => q.source_exam).filter(Boolean))] as string[];
      
      // Parse and group by year/semester
      const yearMap: Map<string, Map<string, string[]>> = new Map();
      
      uniqueExams.forEach(examName => {
        // Parse exam name like "Spring 2024 - Midterm 1" or "Fall 2023 Final"
        const yearMatch = examName.match(/20\d{2}/);
        const year = yearMatch ? yearMatch[0] : 'Unknown';
        
        let semester = 'Unknown';
        if (/spring/i.test(examName)) semester = 'Spring';
        else if (/fall/i.test(examName)) semester = 'Fall';
        else if (/summer/i.test(examName)) semester = 'Summer';
        else if (/winter/i.test(examName)) semester = 'Winter';
        
        if (!yearMap.has(year)) {
          yearMap.set(year, new Map());
        }
        if (!yearMap.get(year)!.has(semester)) {
          yearMap.get(year)!.set(semester, []);
        }
        yearMap.get(year)!.get(semester)!.push(examName);
      });

      // Convert to array and sort
      const result: ExamYear[] = [];
      const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b.localeCompare(a)); // Descending
      
      sortedYears.forEach(year => {
        const semesterMap = yearMap.get(year)!;
        const semesters = Array.from(semesterMap.entries()).map(([semester, exams]) => ({
          semester,
          exams: exams.sort(),
        }));
        result.push({ year, semesters });
      });

      return result;
    },
    enabled: courseIds.length > 0,
  });
}
