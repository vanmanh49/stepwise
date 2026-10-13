import { create, type StateCreator } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProgressData {
  completed: string[];
  quizScores: Record<string, { correct: number; total: number }>;
  currentLesson?: string;
  /** Local dates (YYYY-MM-DD) on which a lesson was opened. */
  activeDays: string[];
}

interface ProgressActions {
  markComplete(id: string): void;
  unmarkComplete(id: string): void;
  /** Keeps the best score; a perfect score also completes the lesson. */
  recordQuiz(id: string, correct: number, total: number): void;
  visit(id: string): void;
  reset(): void;
}

export const emptyProgress: ProgressData = { completed: [], quizScores: {}, activeDays: [] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Rebuilds progress from untrusted storage, dropping anything malformed. */
export function sanitizeProgress(raw: unknown): ProgressData {
  if (!isRecord(raw)) return emptyProgress;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
  const quizScores: ProgressData['quizScores'] = {};
  if (isRecord(raw.quizScores)) {
    for (const [id, score] of Object.entries(raw.quizScores)) {
      if (isRecord(score) && typeof score.correct === 'number' && typeof score.total === 'number') {
        quizScores[id] = { correct: score.correct, total: score.total };
      }
    }
  }
  return {
    completed: [...new Set(strings(raw.completed))],
    quizScores,
    activeDays: strings(raw.activeDays).filter((d) => DAY.test(d)),
    ...(typeof raw.currentLesson === 'string' && { currentLesson: raw.currentLesson }),
  };
}

function localDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const previousDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Consecutive active days ending today, or yesterday if today has no activity yet. */
export function computeStreak(activeDays: string[], today: string = localDay()): number {
  const days = new Set(activeDays);
  let day = days.has(today) ? today : previousDay(today);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = previousDay(day);
  }
  return streak;
}

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

const creator: StateCreator<ProgressData & ProgressActions> = (set) => ({
  ...emptyProgress,
  markComplete: (id) => set((s) => (s.completed.includes(id) ? s : { completed: [...s.completed, id] })),
  unmarkComplete: (id) => set((s) => ({ completed: s.completed.filter((c) => c !== id) })),
  recordQuiz: (id, correct, total) =>
    set((s) => {
      const best = s.quizScores[id];
      const improved = !best || correct / total > best.correct / best.total;
      return {
        quizScores: improved ? { ...s.quizScores, [id]: { correct, total } } : s.quizScores,
        completed: correct === total && !s.completed.includes(id) ? [...s.completed, id] : s.completed,
      };
    }),
  visit: (id) =>
    set((s) => {
      const today = localDay();
      return {
        currentLesson: id,
        activeDays: s.activeDays.includes(today) ? s.activeDays : [...s.activeDays, today],
      };
    }),
  reset: () => set({ ...emptyProgress, currentLesson: undefined }),
});

/**
 * The only place that knows where progress is stored. Components use the
 * selectors and actions, so swapping LocalStorage for an API changes this file only.
 */
export const useProgress =
  typeof localStorage === 'undefined'
    ? create(creator)
    : create(
        persist(creator, {
          name: 'dsa-progress',
          version: 1,
          merge: (persisted, current) => ({ ...current, ...sanitizeProgress(persisted) }),
        }),
      );
