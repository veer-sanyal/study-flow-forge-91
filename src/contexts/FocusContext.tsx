import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

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

export type NarrowByOption = 'midterm' | 'exam' | 'topics' | 'types' | null;

const DEFAULT_FILTERS: FocusFilters = {
  courseIds: [],
  examNames: [],
  midtermNumber: null,
  topicIds: [],
  questionTypeId: null,
};

interface FocusContextValue {
  filters: FocusFilters;
  narrowBy: NarrowByOption;
  setNarrowBy: (option: NarrowByOption) => void;
  setCourseIds: (courseIds: string[]) => void;
  setExamNames: (examNames: string[]) => void;
  setMidtermNumber: (midtermNumber: number | null) => void;
  setTopicIds: (topicIds: string[]) => void;
  setQuestionTypeId: (questionTypeId: string | null) => void;
  applyPreset: (preset: FocusPreset) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  filterSummary: string;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FocusFilters>(DEFAULT_FILTERS);
  const [narrowBy, setNarrowBy] = useState<NarrowByOption>(null);

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

  const filterSummary = useMemo(() => {
    if (!hasActiveFilters) return 'All courses';
    
    const parts: string[] = [];
    
    if (filters.courseIds.length === 1) {
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

  const value: FocusContextValue = {
    filters,
    narrowBy,
    setNarrowBy,
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

  return (
    <FocusContext.Provider value={value}>
      {children}
    </FocusContext.Provider>
  );
}

export function useFocusContext(): FocusContextValue {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocusContext must be used within a FocusProvider');
  }
  return context;
}
