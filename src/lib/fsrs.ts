import { FSRS, Card, Rating, State, createEmptyCard, generatorParameters } from 'ts-fsrs';

// Singleton FSRS instance with app-wide parameters
const params = generatorParameters({
  enable_fuzz: true,
  maximum_interval: 365,
  request_retention: 0.9,
});

export const fsrsInstance = new FSRS(params);

// Shape of the srs_state DB row (FSRS fields only)
export interface DbSrsRow {
  due_at: string;
  last_reviewed_at: string | null;
  reps: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  lapses: number;
  learning_steps: number;
  state: number;
}

// Convert a DB srs_state row into a ts-fsrs Card
export function dbRowToCard(row: DbSrsRow): Card {
  return {
    due: new Date(row.due_at),
    last_review: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
    reps: row.reps,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    lapses: row.lapses,
    learning_steps: row.learning_steps,
    state: row.state as State,
  };
}

// Convert a ts-fsrs Card into a DB-writable partial row
export function cardToDbRow(card: Card): DbSrsRow {
  return {
    due_at: card.due.toISOString(),
    last_reviewed_at: card.last_review ? card.last_review.toISOString() : null,
    reps: card.reps,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    state: card.state as number,
  };
}

// Schedule a card given a rating. Returns the updated Card.
export function scheduleCard(card: Card, rating: Rating, now: Date = new Date()): Card {
  const result = fsrsInstance.repeat(card, now);
  return result[rating].card;
}

export { Rating, State, createEmptyCard };
