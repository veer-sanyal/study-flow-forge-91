import { describe, it, expect } from 'vitest';
import { aggregateCalendarReviewData } from '@/hooks/use-calendar';

describe('aggregateCalendarReviewData', () => {
  it('returns empty map for empty rows', () => {
    const result = aggregateCalendarReviewData([]);
    expect(result.size).toBe(0);
  });

  it('aggregates a single date with a single topic correctly', () => {
    const result = aggregateCalendarReviewData([
      {
        due_date: '2026-02-05',
        topic_id: 't1',
        topic_title: 'Derivatives',
        course_pack_id: 'c1',
        due_count: 7,
        is_overdue: false,
      },
    ]);

    expect(result.size).toBe(1);
    const day = result.get('2026-02-05')!;
    expect(day.totalDue).toBe(7);
    expect(day.overdueCount).toBe(0);
    expect(day.topTopics).toHaveLength(1);
    expect(day.topTopics[0]).toEqual({
      topicId: 't1',
      topicTitle: 'Derivatives',
      dueCount: 7,
    });
  });

  it('keeps only top 3 topics sorted by dueCount descending', () => {
    const result = aggregateCalendarReviewData([
      { due_date: '2026-02-05', topic_id: 't1', topic_title: 'A', course_pack_id: 'c1', due_count: 2, is_overdue: false },
      { due_date: '2026-02-05', topic_id: 't2', topic_title: 'B', course_pack_id: 'c1', due_count: 10, is_overdue: false },
      { due_date: '2026-02-05', topic_id: 't3', topic_title: 'C', course_pack_id: 'c1', due_count: 5, is_overdue: false },
      { due_date: '2026-02-05', topic_id: 't4', topic_title: 'D', course_pack_id: 'c1', due_count: 1, is_overdue: false },
    ]);

    const day = result.get('2026-02-05')!;
    expect(day.totalDue).toBe(18);
    expect(day.topTopics).toHaveLength(3);
    // Sorted: B(10), C(5), A(2) — D(1) dropped
    expect(day.topTopics[0].topicTitle).toBe('B');
    expect(day.topTopics[1].topicTitle).toBe('C');
    expect(day.topTopics[2].topicTitle).toBe('A');
  });

  it('counts overdue rows correctly', () => {
    const result = aggregateCalendarReviewData([
      { due_date: '2026-02-02', topic_id: 't1', topic_title: 'X', course_pack_id: 'c1', due_count: 3, is_overdue: true },
      { due_date: '2026-02-02', topic_id: 't2', topic_title: 'Y', course_pack_id: 'c1', due_count: 5, is_overdue: false },
    ]);

    const day = result.get('2026-02-02')!;
    expect(day.totalDue).toBe(8);
    expect(day.overdueCount).toBe(3);
  });

  it('creates separate map entries for different dates', () => {
    const result = aggregateCalendarReviewData([
      { due_date: '2026-02-03', topic_id: 't1', topic_title: 'A', course_pack_id: 'c1', due_count: 4, is_overdue: false },
      { due_date: '2026-02-04', topic_id: 't2', topic_title: 'B', course_pack_id: 'c1', due_count: 6, is_overdue: false },
      { due_date: '2026-02-03', topic_id: 't3', topic_title: 'C', course_pack_id: 'c1', due_count: 2, is_overdue: true },
    ]);

    expect(result.size).toBe(2);

    const feb3 = result.get('2026-02-03')!;
    expect(feb3.totalDue).toBe(6);
    expect(feb3.overdueCount).toBe(2);
    expect(feb3.topTopics).toHaveLength(2);

    const feb4 = result.get('2026-02-04')!;
    expect(feb4.totalDue).toBe(6);
    expect(feb4.overdueCount).toBe(0);
    expect(feb4.topTopics).toHaveLength(1);
  });

  it('merges duplicate topic rows within the same date', () => {
    const result = aggregateCalendarReviewData([
      { due_date: '2026-02-05', topic_id: 't1', topic_title: 'A', course_pack_id: 'c1', due_count: 3, is_overdue: false },
      { due_date: '2026-02-05', topic_id: 't1', topic_title: 'A', course_pack_id: 'c2', due_count: 4, is_overdue: true },
    ]);

    const day = result.get('2026-02-05')!;
    expect(day.totalDue).toBe(7);
    expect(day.overdueCount).toBe(4);
    // Same topic_id should be merged
    expect(day.topTopics).toHaveLength(1);
    expect(day.topTopics[0].dueCount).toBe(7);
  });
});
