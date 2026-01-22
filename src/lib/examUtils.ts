// Utility functions for parsing and sorting exam information

export interface ParsedExamInfo {
  year: number | null;
  semester: "Spring" | "Summer" | "Fall" | "Winter" | null;
  examType: "Midterm" | "Final" | "Quiz" | "Exam" | null;
  midtermNumber: number | null;
  originalName: string;
}

/**
 * Exam period values for corresponds_to_exam field
 */
export type ExamPeriod = "midterm_1" | "midterm_2" | "midterm_3" | "final";

/**
 * Available semesters for exam metadata
 */
export const SEMESTERS = ["Spring", "Summer", "Fall", "Winter"] as const;
export type Semester = typeof SEMESTERS[number];

/**
 * Available exam types for exam metadata (stored as simple values)
 * 1, 2, 3 = Midterm 1, 2, 3; f = Final
 */
export const EXAM_TYPES = ["1", "2", "3", "f"] as const;
export type ExamType = typeof EXAM_TYPES[number];

/**
 * Convert simple exam type value to display format
 * "1" -> "Midterm 1", "f" -> "Final", etc.
 */
export function formatExamType(examType: string | null | undefined): string {
  if (!examType) return "";
  if (examType === "f" || examType.toLowerCase() === "final") return "Final";
  if (examType === "1" || examType === "2" || examType === "3") return `Midterm ${examType}`;
  // Legacy format support
  if (examType.startsWith("Midterm")) return examType;
  return examType;
}

/**
 * Build an exam title from structured exam details
 */
export function buildExamTitle(
  courseName: string | null | undefined,
  year: number | null | undefined,
  semester: string | null | undefined,
  examType: string | null | undefined
): string {
  const parts: string[] = [];
  if (courseName) parts.push(courseName);
  if (semester && year) {
    parts.push(`${semester} ${year}`);
  } else if (year) {
    parts.push(year.toString());
  } else if (semester) {
    parts.push(semester);
  }
  const formattedType = formatExamType(examType);
  if (formattedType) parts.push(formattedType);
  return parts.length > 0 ? parts.join(" - ") : "Untitled Exam";
}

export interface SemesterGroup {
  semester: "Spring" | "Summer" | "Fall" | "Winter";
  exams: ExamInfo[];
}

export interface YearGroup {
  year: string;
  semesters: SemesterGroup[];
}

export interface ExamInfo {
  sourceExam: string;
  parsed: ParsedExamInfo;
  questionCount: number;
  needsReviewCount: number;
  midtermNumber: number | null;
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

  // Extract midterm number from patterns like "Midterm 1", "Midterm 2", "Exam 1", "Exam 2" etc.
  const examNumberMatch = sourceExam.match(/(?:midterm|exam)\s*(\d)/i);
  if (examNumberMatch) {
    result.midtermNumber = parseInt(examNumberMatch[1], 10);
  }

  return result;
}

/**
 * Sort exams by year (descending), then by semester order, then by exam type, then by midterm number
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

  // Sort by exam type (Midterm before Final)
  const examTypeOrder: Record<string, number> = {
    Midterm: 1,
    Exam: 2,
    Quiz: 3,
    Final: 4,
  };
  const aExamOrder = a.examType ? examTypeOrder[a.examType] : 5;
  const bExamOrder = b.examType ? examTypeOrder[b.examType] : 5;
  if (aExamOrder !== bExamOrder) {
    return aExamOrder - bExamOrder;
  }

  // Sort by midterm number ascending
  return (a.midtermNumber || 0) - (b.midtermNumber || 0);
}

/**
 * Get short exam label (just exam type without semester/year)
 * Examples: "Midterm 1", "Midterm 2", "Final"
 */
export function getShortExamLabel(parsed: ParsedExamInfo): string {
  if (parsed.examType === "Midterm" && parsed.midtermNumber) {
    return `Midterm ${parsed.midtermNumber}`;
  }
  if (parsed.examType === "Exam" && parsed.midtermNumber) {
    return `Exam ${parsed.midtermNumber}`;
  }
  if (parsed.examType) {
    return parsed.examType;
  }
  return parsed.originalName;
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
 * Group exams by year, then by semester
 */
export function groupExamsByYearAndSemester(exams: ExamInfo[]): YearGroup[] {
  // First sort all exams
  const sortedExams = [...exams].sort((a, b) => sortExams(a.parsed, b.parsed));

  // Group by year
  const yearMap = new Map<string, Map<string, ExamInfo[]>>();
  
  for (const exam of sortedExams) {
    const yearKey = exam.parsed.year?.toString() || "Unknown Year";
    const semesterKey = exam.parsed.semester || "Unknown";
    
    if (!yearMap.has(yearKey)) {
      yearMap.set(yearKey, new Map());
    }
    const semesterMap = yearMap.get(yearKey)!;
    
    if (!semesterMap.has(semesterKey)) {
      semesterMap.set(semesterKey, []);
    }
    semesterMap.get(semesterKey)!.push(exam);
  }

  // Convert to array structure
  const semesterOrder = ["Spring", "Summer", "Fall", "Winter", "Unknown"];
  const yearGroups: YearGroup[] = [];
  
  // Sort years descending
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => {
    const aNum = parseInt(a) || 0;
    const bNum = parseInt(b) || 0;
    return bNum - aNum;
  });

  for (const year of sortedYears) {
    const semesterMap = yearMap.get(year)!;
    const semesters: SemesterGroup[] = [];
    
    // Sort semesters
    const sortedSemesters = Array.from(semesterMap.keys()).sort((a, b) => {
      return semesterOrder.indexOf(a) - semesterOrder.indexOf(b);
    });

    for (const semester of sortedSemesters) {
      semesters.push({
        semester: semester as SemesterGroup["semester"],
        exams: semesterMap.get(semester)!,
      });
    }

    yearGroups.push({ year, semesters });
  }

  return yearGroups;
}

/**
 * Get a color for a course card - uses consistent gold/primary accent system
 * All courses use the same brand colors with subtle variation
 */
export function getCourseCardColor(title: string, index: number): { 
  gradient: string; 
  accentColor: string;
} {
  // Use consistent primary/gold themed colors for brand consistency
  // Variations are subtle - different gold/amber shades
  const colors = [
    { gradient: "from-amber-500 to-yellow-600", accentColor: "bg-amber-400" },
    { gradient: "from-yellow-500 to-amber-600", accentColor: "bg-yellow-400" },
    { gradient: "from-orange-400 to-amber-500", accentColor: "bg-orange-400" },
    { gradient: "from-amber-400 to-yellow-500", accentColor: "bg-amber-300" },
  ];

  // Use index for consistent but varied assignment
  const colorIndex = index % colors.length;
  return colors[colorIndex];
}
