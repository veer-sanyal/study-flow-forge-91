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

// Fetch topics grouped by midterm coverage with question counts
export interface TopicGroup {
  midtermNumber: number | null;
  label: string;
  topics: { id: string; title: string; questionCount: number }[];
  totalQuestions: number;
}

export function useTopicsGroupedByMidterm(courseIds: string[]) {
  return useQuery({
    queryKey: ['topics-by-midterm', courseIds],
    queryFn: async () => {
      // Allow query to proceed - courseIds will be enrolled courses from component
      if (courseIds.length === 0) return [];

      // Get topics
      const { data: topicsData, error: topicsError } = await supabase
        .from('topics')
        .select('id, title, midterm_coverage')
        .in('course_pack_id', courseIds)
        .order('scheduled_week', { ascending: true });

      if (topicsError) throw topicsError;

      // Get questions to count per topic
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('topic_ids')
        .in('course_pack_id', courseIds)
        .eq('needs_review', false);

      if (questionsError) throw questionsError;

      // Count questions per topic
      const topicCountMap = new Map<string, number>();
      questions?.forEach((q) => {
        if (Array.isArray(q.topic_ids)) {
          q.topic_ids.forEach((topicId: string) => {
            topicCountMap.set(topicId, (topicCountMap.get(topicId) || 0) + 1);
          });
        }
      });

      // Group by midterm_coverage
      const groups: Map<number | null, TopicGroup> = new Map();
      
      (topicsData || []).forEach(topic => {
        const coverage = topic.midterm_coverage;
        const questionCount = topicCountMap.get(topic.id) || 0;
        
        if (!groups.has(coverage)) {
          groups.set(coverage, {
            midtermNumber: coverage,
            label: coverage ? `Midterm ${coverage} Topics` : 'Final Topics',
            topics: [],
            totalQuestions: 0,
          });
        }
        
        const group = groups.get(coverage)!;
        group.topics.push({ id: topic.id, title: topic.title, questionCount });
        group.totalQuestions += questionCount;
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

// Fetch question types for courses with question counts, grouped by midterm
export interface QuestionTypeWithCount {
  id: string;
  name: string;
  questionCount: number;
}

export interface QuestionTypeGroup {
  midtermNumber: number | null;
  label: string;
  types: QuestionTypeWithCount[];
  totalQuestions: number;
}

export function useQuestionTypesForCourses(courseIds: string[]) {
  return useQuery({
    queryKey: ['question-types-for-courses', courseIds],
    queryFn: async () => {
      // Get question types
      let typesQuery = supabase
        .from('question_types')
        .select('id, name, course_pack_id')
        .eq('status', 'active')
        .order('name');

      if (courseIds.length > 0) {
        typesQuery = typesQuery.or(`course_pack_id.in.(${courseIds.join(',')}),course_pack_id.is.null`);
      }

      const { data: types, error: typesError } = await typesQuery;
      if (typesError) throw typesError;

      // Get questions for counting
      let questionsQuery = supabase
        .from('questions')
        .select('question_type_id')
        .eq('needs_review', false);

      if (courseIds.length > 0) {
        questionsQuery = questionsQuery.in('course_pack_id', courseIds);
      }

      const { data: questions, error: questionsError } = await questionsQuery;
      if (questionsError) throw questionsError;

      // Count questions per type
      const typeCountMap = new Map<string, number>();
      questions?.forEach((q) => {
        if (q.question_type_id) {
          typeCountMap.set(q.question_type_id, (typeCountMap.get(q.question_type_id) || 0) + 1);
        }
      });

      return (types || []).map(type => ({
        id: type.id,
        name: type.name,
        questionCount: typeCountMap.get(type.id) || 0,
      }));
    },
  });
}

// Question types grouped by midterm (for display)
export function useQuestionTypesGroupedByMidterm(courseIds: string[]) {
  return useQuery({
    queryKey: ['question-types-by-midterm', courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return [];

      // Get question types
      const { data: types, error: typesError } = await supabase
        .from('question_types')
        .select('id, name')
        .or(`course_pack_id.in.(${courseIds.join(',')}),course_pack_id.is.null`)
        .eq('status', 'active')
        .order('name');

      if (typesError) throw typesError;

      // Get questions with type and midterm info
      const { data: questions, error: questionsError } = await supabase
        .from('questions')
        .select('question_type_id, midterm_number')
        .in('course_pack_id', courseIds)
        .eq('needs_review', false);

      if (questionsError) throw questionsError;

      // Build type -> midterm -> count map
      const typeMap = new Map<string, Map<number | null, number>>();
      
      questions?.forEach((q) => {
        if (!q.question_type_id) return;
        
        if (!typeMap.has(q.question_type_id)) {
          typeMap.set(q.question_type_id, new Map());
        }
        
        const midtermMap = typeMap.get(q.question_type_id)!;
        const midterm = q.midterm_number;
        midtermMap.set(midterm, (midtermMap.get(midterm) || 0) + 1);
      });

      // Group types by their primary midterm (highest question count)
      const midtermGroups = new Map<number | null, QuestionTypeGroup>();
      
      types?.forEach(type => {
        const midtermCounts = typeMap.get(type.id);
        let primaryMidterm: number | null = null;
        let totalCount = 0;
        
        if (midtermCounts) {
          let maxCount = 0;
          midtermCounts.forEach((count, midterm) => {
            totalCount += count;
            if (count > maxCount) {
              maxCount = count;
              primaryMidterm = midterm;
            }
          });
        }

        if (!midtermGroups.has(primaryMidterm)) {
          let label = 'Uncategorized';
          if (primaryMidterm === 0 || primaryMidterm === null) label = 'Final / General';
          else label = `Midterm ${primaryMidterm}`;
          
          midtermGroups.set(primaryMidterm, {
            midtermNumber: primaryMidterm,
            label,
            types: [],
            totalQuestions: 0,
          });
        }
        
        const group = midtermGroups.get(primaryMidterm)!;
        group.types.push({ id: type.id, name: type.name, questionCount: totalCount });
        group.totalQuestions += totalCount;
      });

      // Sort groups
      return Array.from(midtermGroups.values()).sort((a, b) => {
        if (a.midtermNumber === null) return 1;
        if (b.midtermNumber === null) return -1;
        return (a.midtermNumber ?? 0) - (b.midtermNumber ?? 0);
      });
    },
    enabled: courseIds.length > 0,
  });
}

// Fetch past exams grouped by exam type (Midterm 1, 2, 3, Final)
export interface ExamTypeGroup {
  examType: string; // "Midterm 1", "Midterm 2", "Midterm 3", "Final"
  sortOrder: number;
  exams: {
    name: string; // Original source_exam value
    label: string; // Display label like "Spring 2024"
    year: string;
    semester: string;
  }[];
}

export function usePastExamsHierarchy(courseIds: string[]) {
  return useQuery({
    queryKey: ['past-exams-hierarchy', courseIds],
    queryFn: async () => {
      // Allow query to proceed even with empty courseIds - it will be filtered by enrolled courses in the component
      if (courseIds.length === 0) return [];

      // First get published ingestion jobs to know which source_exams are published
      const { data: publishedJobs, error: jobsError } = await supabase
        .from('ingestion_jobs')
        .select('file_name, exam_year, exam_semester, exam_type')
        .in('course_pack_id', courseIds)
        .eq('is_published', true)
        .eq('status', 'completed');

      if (jobsError) throw jobsError;

      // Build a set of published source_exam patterns to match against
      // source_exam format is like "Spring 2024 Midterm 1" or "Fall 2023 Final"
      const publishedExamPatterns = new Set<string>();
      publishedJobs?.forEach(job => {
        if (job.exam_year && job.exam_semester && job.exam_type) {
          // Build the source_exam string pattern
          const examTypeLabel = job.exam_type === 'Final' ? 'Final' : `Midterm ${job.exam_type}`;
          const pattern = `${job.exam_semester} ${job.exam_year} ${examTypeLabel}`;
          publishedExamPatterns.add(pattern.toLowerCase());
        }
      });

      // Get questions with source_exam
      const { data, error } = await supabase
        .from('questions')
        .select('source_exam')
        .in('course_pack_id', courseIds)
        .eq('needs_review', false)
        .not('source_exam', 'is', null);

      if (error) throw error;

      // Get unique exam names and parse them
      const uniqueExams = [...new Set(data?.map(q => q.source_exam).filter(Boolean))] as string[];
      
      // Filter to only show published exams, with fallback
      let publishedExams: string[];

      if (publishedExamPatterns.size > 0) {
        // Primary path: match against published job patterns (loosened to 2+ parts)
        publishedExams = uniqueExams.filter(examName => {
          const normalized = examName.toLowerCase();
          return Array.from(publishedExamPatterns).some(pattern => {
            const patternParts = pattern.split(' ').filter(Boolean);
            const matchCount = patternParts.filter(part => normalized.includes(part)).length;
            // Require at least 2 parts to match (loosened from all parts)
            return matchCount >= Math.min(2, patternParts.length);
          });
        });

        // If strict matching filtered out everything, fall back to showing all
        if (publishedExams.length === 0) {
          publishedExams = uniqueExams;
        }
      } else {
        // Fallback: no published patterns exist, show ALL distinct source_exam values
        publishedExams = uniqueExams;
      }
      
      // Group by exam type (Midterm 1, 2, 3, Final)
      const examTypeMap: Map<string, ExamTypeGroup> = new Map();
      
      publishedExams.forEach(examName => {
        // Parse exam name like "Spring 2024 - Midterm 1" or "Fall 2023 Final"
        const yearMatch = examName.match(/20\d{2}/);
        const year = yearMatch ? yearMatch[0] : 'Unknown';
        
        let semester = '';
        if (/spring/i.test(examName)) semester = 'Spring';
        else if (/fall/i.test(examName)) semester = 'Fall';
        else if (/summer/i.test(examName)) semester = 'Summer';
        else if (/winter/i.test(examName)) semester = 'Winter';
        
        // Determine exam type
        let examType = 'Final';
        let sortOrder = 4;
        const midtermMatch = examName.match(/midterm\s*(\d)/i);
        if (midtermMatch) {
          const midtermNum = parseInt(midtermMatch[1], 10);
          examType = `Midterm ${midtermNum}`;
          sortOrder = midtermNum;
        } else if (/final/i.test(examName)) {
          examType = 'Final';
          sortOrder = 4;
        }
        
        if (!examTypeMap.has(examType)) {
          examTypeMap.set(examType, {
            examType,
            sortOrder,
            exams: [],
          });
        }
        
        examTypeMap.get(examType)!.exams.push({
          name: examName,
          label: semester && year ? `${semester} ${year}` : examName,
          year,
          semester,
        });
      });

      // Sort groups by sort order (Midterm 1, 2, 3, then Final)
      const result = Array.from(examTypeMap.values())
        .sort((a, b) => a.sortOrder - b.sortOrder);
      
      // Sort exams within each group by year (descending) then semester
      result.forEach(group => {
        group.exams.sort((a, b) => {
          const yearDiff = b.year.localeCompare(a.year);
          if (yearDiff !== 0) return yearDiff;
          // Fall before Spring within same year
          const semesterOrder: Record<string, number> = { 'Fall': 0, 'Summer': 1, 'Spring': 2, 'Winter': 3 };
          return (semesterOrder[a.semester] ?? 4) - (semesterOrder[b.semester] ?? 4);
        });
      });

      return result;
    },
    enabled: courseIds.length > 0,
  });
}
