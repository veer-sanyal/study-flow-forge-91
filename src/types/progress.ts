/** FSRS-native progress dashboard types */

/** Per-topic row returned from get_progress_stats RPC */
export interface TopicProgressRow {
  topic_id: string;
  topic_title: string;
  course_pack_id: string | null;
  // Card counts
  total_cards: number;
  new_cards: number;       // state = 0
  learning_cards: number;  // state = 1 or 3
  review_cards: number;    // state = 2
  due_today: number;
  // FSRS aggregates (from DB percentile_cont)
  median_stability: number | null;   // S50
  p10_stability: number | null;      // S10 (weak-tail)
  median_difficulty: number | null;   // D50
  median_elapsed_days: number | null;
  // Attempt stats (within time window)
  attempts_count: number;
  correct_count: number;
  total_reps: number;      // sum of reps across cards
  total_lapses: number;
  // Client-computed (filled in by hook)
  r_now: number | null;
  risk: 'safe' | 'warning' | 'danger';
}

/** Global summary computed client-side from TopicProgressRow[] */
export interface ProgressSummary {
  totalDueToday: number;
  atRiskTopicCount: number;
  globalMedianStability: number | null;
  globalMedianDifficulty: number | null;
  observedRecall: number | null;       // correct_count / attempts_count in window
  targetRetention: number;             // 0.9
  totalAttempts: number;
}

/** Single day in the review forecast */
export interface ForecastDay {
  date: string;              // ISO date string YYYY-MM-DD
  label: string;             // formatted "Mon 3", "Tue 4"
  reviewCount: number;
  coursePackId: string | null;
  isOverdue: boolean;
}

/** Per-topic exam projection */
export interface TopicExamProjection {
  topicId: string;
  topicTitle: string;
  currentR: number;
  projectedR: number;       // R at exam date
  medianStability: number | null;
  recommendation: string | null;
}

/** Full exam readiness data */
export interface ExamProjection {
  examId: string;
  examTitle: string;
  courseTitle: string;
  examDate: string;
  daysUntil: number;
  overallProjectedR: number;
  topics: TopicExamProjection[];
}

/** Sort options for the topic risk list */
export type TopicSortKey = 'most-at-risk' | 'most-due' | 'lowest-stability' | 'highest-difficulty';

/** Time range filter options */
export type TimeRange = '7d' | '30d' | 'all';
