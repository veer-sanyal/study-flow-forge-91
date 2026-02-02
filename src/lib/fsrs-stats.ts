/**
 * Pure FSRS statistics utilities.
 * No side effects — only math, formatting, and classification.
 */
import { fsrsInstance } from '@/lib/fsrs';

/** Compute median of a sorted-or-unsorted numeric array. Returns null for empty input. */
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Compute the p-th percentile (0–1) using linear interpolation. */
export function computePercentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/** Classify retrievability against target retention. */
export function classifyRisk(r: number | null, target: number = 0.9): 'safe' | 'warning' | 'danger' {
  if (r === null) return 'warning';
  // "danger" if more than ~15% below target, "warning" if below target
  if (r < target - 0.05) return 'danger';
  if (r < target) return 'warning';
  return 'safe';
}

/** Format stability as a human-readable duration string. */
export function formatStability(days: number | null): string {
  if (days === null || days === 0) return '--';
  if (days < 1) return `${Math.round(days * 24)}h`;
  if (days < 7) return `${days.toFixed(1)}d`;
  if (days < 30) return `${(days / 7).toFixed(1)}w`;
  return `${(days / 30).toFixed(1)}mo`;
}

/** Format difficulty on a 0–10 scale to one decimal place. */
export function formatDifficulty(d: number | null): string {
  if (d === null) return '--';
  return `${d.toFixed(1)}/10`;
}

/**
 * Compute retrievability (R) using FSRS forgetting curve.
 * R = (1 + elapsed_days / (9 * stability))^(-1)
 * Uses the ts-fsrs instance for parameter consistency.
 */
export function projectRetention(
  stability: number,
  elapsedDays: number,
  additionalDays: number = 0
): number {
  const totalElapsed = elapsedDays + additionalDays;
  if (stability <= 0 || totalElapsed < 0) return 1;
  return fsrsInstance.forgetting_curve(totalElapsed, stability);
}

/** Color class for risk badges. */
export function riskColorClass(risk: 'safe' | 'warning' | 'danger'): string {
  switch (risk) {
    case 'safe': return 'bg-green-500/10 text-green-600 dark:text-green-400';
    case 'warning': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'danger': return 'bg-red-500/10 text-red-600 dark:text-red-400';
  }
}

/** Estimate review time in minutes (rough: ~1.5 min per card). */
export function estimateReviewMinutes(dueCount: number): number {
  return Math.round(dueCount * 1.5);
}
