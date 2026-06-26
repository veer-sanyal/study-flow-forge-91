/**
 * Quality streak: consecutive days with a real retrieval *success*, not logins.
 *
 * Binary "did anything today" streaks are an extrinsic vanity metric — research on
 * over-justification (Deci, Koestner & Ryan 1999) and gamification (Sailer & Homner
 * 2020) shows contingent rewards for mere activity can crowd out intrinsic motivation
 * and invite gaming (speed-running to protect a number). Distributed practice across
 * days is the behavior that actually predicts retention, so a day only counts when the
 * learner gets at least one question correct that day.
 *
 * ponytail: window-bounded by whatever attempts you pass in (the dashboard passes the
 * last 7 days), so the streak caps at that window. Widen the query if a longer streak
 * matters.
 */
export interface StreakAttempt {
  is_correct: boolean;
  created_at: string;
}

export function computeQualityStreak(
  attempts: StreakAttempt[],
  now: Date = new Date(),
): number {
  const qualityDays = new Set<string>();
  for (const a of attempts) {
    if (a.is_correct) qualityDays.add(new Date(a.created_at).toDateString());
  }

  let streak = 0;
  const cursor = new Date(now);
  // Today may still be in progress — if it has no quality attempt yet, don't break the
  // run; start counting from yesterday so the streak survives until a full day is missed.
  if (!qualityDays.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (qualityDays.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
