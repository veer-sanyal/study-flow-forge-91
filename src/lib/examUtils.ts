// Utility functions for parsing and sorting exam information

export interface ParsedExamInfo {
  year: number | null;
  semester: "Spring" | "Summer" | "Fall" | "Winter" | null;
  examType: "Midterm" | "Final" | "Quiz" | "Exam" | null;
  midtermNumber: number | null;
  originalName: string;
}

/**
 * Parse exam source name to extract year, semester, and exam type
 * Examples:
 * - "Fall 2023 Midterm 1" → { year: 2023, semester: "Fall", examType: "Midterm", midtermNumber: 1 }
 * - "Spring 2024 Final" → { year: 2024, semester: "Spring", examType: "Final", midtermNumber: null }
 * - "MA 266 Exam 2 Fall 2022" → { year: 2022, semester: "Fall", examType: "Exam", midtermNumber: null }
 */
export function parseExamName(sourceExam: string): ParsedExamInfo {
  const result: ParsedExamInfo = {
    year: null,
    semester: null,
    examType: null,
    midtermNumber: null,
    originalName: sourceExam,
  };

  // Extract year (4-digit number)
  const yearMatch = sourceExam.match(/\b(20\d{2})\b/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1], 10);
  }

  // Extract semester
  const lowerName = sourceExam.toLowerCase();
  if (lowerName.includes("spring")) {
    result.semester = "Spring";
  } else if (lowerName.includes("summer")) {
    result.semester = "Summer";
  } else if (lowerName.includes("fall")) {
    result.semester = "Fall";
  } else if (lowerName.includes("winter")) {
    result.semester = "Winter";
  }

  // Extract exam type
  if (lowerName.includes("final")) {
    result.examType = "Final";
  } else if (lowerName.includes("midterm")) {
    result.examType = "Midterm";
  } else if (lowerName.includes("quiz")) {
    result.examType = "Quiz";
  } else if (lowerName.includes("exam")) {
    result.examType = "Exam";
  }

  // Extract midterm number from patterns like "Midterm 1", "Midterm 2", etc.
  const midtermMatch = sourceExam.match(/midterm\s*(\d)/i);
  if (midtermMatch) {
    result.midtermNumber = parseInt(midtermMatch[1], 10);
  }

  return result;
}

/**
 * Sort exams by year (descending), then by semester order, then by midterm number
 */
export function sortExams(a: ParsedExamInfo, b: ParsedExamInfo): number {
  // Sort by year descending (newest first)
  if (a.year !== b.year) {
    return (b.year || 0) - (a.year || 0);
  }

  // Sort by semester (Spring = 1, Summer = 2, Fall = 3, Winter = 4)
  const semesterOrder: Record<string, number> = {
    Spring: 1,
    Summer: 2,
    Fall: 3,
    Winter: 4,
  };
  const aSemOrder = a.semester ? semesterOrder[a.semester] : 5;
  const bSemOrder = b.semester ? semesterOrder[b.semester] : 5;
  if (aSemOrder !== bSemOrder) {
    return aSemOrder - bSemOrder;
  }

  // Sort by midterm number ascending
  return (a.midtermNumber || 0) - (b.midtermNumber || 0);
}

/**
 * Generate a display label for an exam
 */
export function getExamDisplayLabel(parsed: ParsedExamInfo): string {
  const parts: string[] = [];
  
  if (parsed.semester) parts.push(parsed.semester);
  if (parsed.year) parts.push(parsed.year.toString());
  if (parsed.examType) {
    if (parsed.midtermNumber) {
      parts.push(`${parsed.examType} ${parsed.midtermNumber}`);
    } else {
      parts.push(parsed.examType);
    }
  }

  return parts.length > 0 ? parts.join(" ") : parsed.originalName;
}

/**
 * Get exam grouping key for organizing exams by year
 */
export function getYearGroupKey(parsed: ParsedExamInfo): string {
  return parsed.year?.toString() || "Unknown Year";
}

/**
 * Get a color for a course card based on its index or title hash
 */
export function getCourseCardColor(title: string, index: number): { 
  gradient: string; 
  accentColor: string;
} {
  const colors = [
    { gradient: "from-rose-500 to-pink-600", accentColor: "bg-rose-400" },
    { gradient: "from-purple-500 to-indigo-600", accentColor: "bg-purple-400" },
    { gradient: "from-blue-500 to-cyan-600", accentColor: "bg-blue-400" },
    { gradient: "from-emerald-500 to-teal-600", accentColor: "bg-emerald-400" },
    { gradient: "from-orange-500 to-amber-600", accentColor: "bg-orange-400" },
    { gradient: "from-red-500 to-rose-600", accentColor: "bg-red-400" },
    { gradient: "from-violet-500 to-purple-600", accentColor: "bg-violet-400" },
    { gradient: "from-sky-500 to-blue-600", accentColor: "bg-sky-400" },
  ];

  // Use a simple hash of the title to get consistent colors
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash = hash & hash;
  }

  const colorIndex = Math.abs(hash) % colors.length;
  return colors[colorIndex];
}
