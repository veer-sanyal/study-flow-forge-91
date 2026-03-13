import { useState, useCallback, useRef } from 'react';
import { StudyQuestion } from '@/types/study';
import { useReservePool } from './use-reserve-pool';

interface SequencerState {
  queue: StudyQuestion[];
  currentIndex: number;
  insertionCounts: Map<string, number>; // topicId -> insertion count (cap at 2)
  topicStreaks: Map<string, number>;     // topicId -> consecutive correct count
}

type QuestionResult = {
  isCorrect: boolean;
  guideUsed: boolean;
  confidence: number | null;
  questionTopicIds: string[];
};

const MAX_INSERTIONS_PER_TOPIC = 2;

export function useAdaptiveSequencer(): {
  initQueue: (questions: StudyQuestion[], allTopicIds: string[], excludeIds: string[]) => void;
  currentQuestion: StudyQuestion | null;
  advance: (result: QuestionResult) => void;
  queue: StudyQuestion[];
  currentIndex: number;
  totalQuestions: number;
  isInserted: (index: number) => boolean;
} {
  const [state, setState] = useState<SequencerState>({
    queue: [],
    currentIndex: 0,
    insertionCounts: new Map(),
    topicStreaks: new Map(),
  });
  const insertedIndicesRef = useRef<Set<number>>(new Set());
  const reservePool = useReservePool();

  const initQueue = useCallback((
    questions: StudyQuestion[],
    allTopicIds: string[],
    excludeIds: string[],
  ): void => {
    setState({
      queue: [...questions],
      currentIndex: 0,
      insertionCounts: new Map(),
      topicStreaks: new Map(),
    });
    insertedIndicesRef.current = new Set();

    // Fetch reserve pool in background
    reservePool.fetchReserve(allTopicIds, excludeIds);
  }, [reservePool]);

  const advance = useCallback((result: QuestionResult): void => {
    setState(prev => {
      const { queue, currentIndex, insertionCounts, topicStreaks } = prev;
      if (currentIndex >= queue.length) return prev;

      const newQueue = [...queue];
      const newInsertionCounts = new Map(insertionCounts);
      const newTopicStreaks = new Map(topicStreaks);
      let insertionOffset = 0;

      // Update topic streaks
      for (const topicId of result.questionTopicIds) {
        if (result.isCorrect) {
          newTopicStreaks.set(topicId, (newTopicStreaks.get(topicId) || 0) + 1);
        } else {
          newTopicStreaks.set(topicId, 0);
        }
      }

      // Rule 1: Wrong answer → insert reinforcement at position +2
      if (!result.isCorrect) {
        for (const topicId of result.questionTopicIds) {
          const count = newInsertionCounts.get(topicId) || 0;
          if (count >= MAX_INSERTIONS_PER_TOPIC) continue;

          const currentDifficulty = queue[currentIndex]?.difficulty || 3;
          const reserve = reservePool.getReserveForTopic(topicId, currentDifficulty);
          if (reserve) {
            const insertAt = Math.min(currentIndex + 2 + insertionOffset, newQueue.length);
            const studyQ = reserveToStudyQuestion(reserve);
            newQueue.splice(insertAt, 0, studyQ);
            insertedIndicesRef.current.add(insertAt);
            newInsertionCounts.set(topicId, count + 1);
            insertionOffset++;
            break; // Only 1 insertion per wrong answer
          }
        }
      }

      // Rule 2: Guide Me used → queue reinforcement within next 3 positions
      if (result.guideUsed && result.isCorrect) {
        for (const topicId of result.questionTopicIds) {
          const count = newInsertionCounts.get(topicId) || 0;
          if (count >= MAX_INSERTIONS_PER_TOPIC) continue;

          const reserve = reservePool.getReserveForTopic(topicId);
          if (reserve) {
            const insertAt = Math.min(currentIndex + 3 + insertionOffset, newQueue.length);
            const studyQ = reserveToStudyQuestion(reserve);
            newQueue.splice(insertAt, 0, studyQ);
            insertedIndicesRef.current.add(insertAt);
            newInsertionCounts.set(topicId, count + 1);
            insertionOffset++;
            break;
          }
        }
      }

      // Rule 3: 3+ correct streak → deprioritize topic (move remaining to end)
      for (const topicId of result.questionTopicIds) {
        if ((newTopicStreaks.get(topicId) || 0) >= 3) {
          // Find remaining questions for this topic after current position
          const remaining: { q: StudyQuestion; idx: number }[] = [];
          for (let i = currentIndex + 1 + insertionOffset; i < newQueue.length; i++) {
            if (newQueue[i].topicIds.includes(topicId)) {
              remaining.push({ q: newQueue[i], idx: i });
            }
          }
          // Move to end (remove in reverse order to maintain indices)
          if (remaining.length > 0) {
            const toMove = remaining.map(r => r.q);
            for (let i = remaining.length - 1; i >= 0; i--) {
              newQueue.splice(remaining[i].idx, 1);
            }
            newQueue.push(...toMove);
          }
        }
      }

      // Rule 4: Low confidence (correct but guessed) → queue reinforcement within next 2
      if (result.isCorrect && result.confidence === 1) {
        for (const topicId of result.questionTopicIds) {
          const count = newInsertionCounts.get(topicId) || 0;
          if (count >= MAX_INSERTIONS_PER_TOPIC) continue;

          const reserve = reservePool.getReserveForTopic(topicId);
          if (reserve) {
            const insertAt = Math.min(currentIndex + 2 + insertionOffset, newQueue.length);
            const studyQ = reserveToStudyQuestion(reserve);
            newQueue.splice(insertAt, 0, studyQ);
            insertedIndicesRef.current.add(insertAt);
            newInsertionCounts.set(topicId, count + 1);
            break;
          }
        }
      }

      // Check if reserve pool needs refetch
      if (reservePool.needsRefetch()) {
        const allTopicIds = [...new Set(newQueue.flatMap(q => q.topicIds))];
        const excludeIds = newQueue.map(q => q.id);
        reservePool.fetchReserve(allTopicIds, excludeIds);
      }

      return {
        queue: newQueue,
        currentIndex: currentIndex + 1,
        insertionCounts: newInsertionCounts,
        topicStreaks: newTopicStreaks,
      };
    });
  }, [reservePool]);

  const isInserted = useCallback((index: number): boolean => {
    return insertedIndicesRef.current.has(index);
  }, []);

  return {
    initQueue,
    currentQuestion: state.queue[state.currentIndex] ?? null,
    advance,
    queue: state.queue,
    currentIndex: state.currentIndex,
    totalQuestions: state.queue.length,
    isInserted,
  };
}

/** Convert a reserve pool question to a StudyQuestion shape */
function reserveToStudyQuestion(reserve: {
  question_id: string;
  prompt: string;
  choices: unknown;
  correct_answer: string;
  hint: string | null;
  solution_steps: unknown;
  difficulty: number;
  topic_ids: string[];
  course_pack_id: string | null;
}): StudyQuestion {
  const choices = reserve.choices as Array<{ id: string; text: string; isCorrect: boolean }> | null;
  return {
    id: reserve.question_id,
    prompt: reserve.prompt,
    choices: choices || [],
    correctChoiceId: choices?.find(c => c.isCorrect)?.id || null,
    hint: reserve.hint,
    difficulty: reserve.difficulty,
    topicIds: reserve.topic_ids,
    topicNames: [], // Will be filled lazily if needed
    sourceExam: null,
    solutionSteps: reserve.solution_steps as string[] | null,
    questionType: 'multiple_choice',
    imageUrl: null,
    guideMeSteps: null,
    questionFormat: 'multiple_choice',
    subparts: null,
    coursePackId: reserve.course_pack_id,
    courseName: null,
  };
}
