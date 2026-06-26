import { describe, it, expect } from 'vitest';
import { computeQualityStreak } from '@/lib/streak';

const day = (iso: string, correct = true) => ({ is_correct: correct, created_at: iso });

describe('computeQualityStreak', () => {
  const now = new Date('2026-06-25T20:00:00Z');

  it('counts consecutive days ending today', () => {
    const attempts = [
      day('2026-06-25T10:00:00Z'),
      day('2026-06-24T10:00:00Z'),
      day('2026-06-23T10:00:00Z'),
    ];
    expect(computeQualityStreak(attempts, now)).toBe(3);
  });

  it('breaks the streak on a gap day', () => {
    const attempts = [
      day('2026-06-25T10:00:00Z'),
      // 24th missing
      day('2026-06-23T10:00:00Z'),
    ];
    expect(computeQualityStreak(attempts, now)).toBe(1);
  });

  it('keeps yesterday-anchored streak when today not done yet', () => {
    const attempts = [
      day('2026-06-24T10:00:00Z'),
      day('2026-06-23T10:00:00Z'),
    ];
    expect(computeQualityStreak(attempts, now)).toBe(2);
  });

  it('does not count days with only incorrect attempts (quality, not logins)', () => {
    const attempts = [
      day('2026-06-25T10:00:00Z', false),
      day('2026-06-24T10:00:00Z', false),
    ];
    expect(computeQualityStreak(attempts, now)).toBe(0);
  });

  it('returns 0 with no attempts', () => {
    expect(computeQualityStreak([], now)).toBe(0);
  });
});
