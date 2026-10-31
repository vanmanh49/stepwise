import { create, type StateCreator } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ProgressData {
  completed: string[];
  quizScores: Record<string, { correct: number; total: number }>;
  currentLesson?: string;
  /** Local dates (YYYY-MM-DD) on which a lesson was opened. */
  activeDays: string[];
  /** Solved SQL exercises, as "lessonId/exerciseId". */
  exercises: string[];
}

interface ProgressActions {
  markComplete(id: string): void;
  unmarkComplete(id: string): void;
  /** Keeps the best score; a perfect score also completes the lesson. */
  recordQuiz(id: string, correct: number, total: number): void;
  visit(id: string): void;
  /** Records a solved exercise; solving every exercise of a lesson also completes it. */
  solveExercise(lessonId: string, exerciseId: string, allExerciseIds: string[]): void;
  reset(): void;
}

export const emptyProgress: ProgressData = { completed: [], quizScores: {}, activeDays: [], exercises: [] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EXERCISE = /^[^/]+\/[^/]+$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Rebuilds progress from untrusted storage, dropping anything malformed. */
export function sanitizeProgress(raw: unknown): ProgressData {
  if (!isRecord(raw)) return emptyProgress;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
  const quizScores: ProgressData['quizScores'] = {};
  if (isRecord(raw.quizScores)) {
    for (const [id, score] of Object.entries(raw.quizScores)) {
      const { correct, total } = isRecord(score) ? score : {};
      // A zero total would make the best-score comparison divide by zero.
      if (typeof correct === 'number' && typeof total === 'number' && total > 0 && correct >= 0 && correct <= total) {
        quizScores[id] = { correct, total };
      }
    }
  }
  return {
    completed: [...new Set(strings(raw.completed))],
    quizScores,
    activeDays: strings(raw.activeDays).filter((d) => DAY.test(d)),
    exercises: [...new Set(strings(raw.exercises).filter((e) => EXERCISE.test(e)))],
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

/** How many lessons in `list` are completed; ids of lessons not in the list never count. */
export function countDone(list: readonly { id: string }[], completed: readonly string[]): number {
  return list.filter((lesson) => completed.includes(lesson.id)).length;
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
  solveExercise: (lessonId, exerciseId, allExerciseIds) =>
    set((s) => {
      const key = `${lessonId}/${exerciseId}`;
      const exercises = s.exercises.includes(key) ? s.exercises : [...s.exercises, key];
      const allSolved = allExerciseIds.every((id) => exercises.includes(`${lessonId}/${id}`));
      return {
        exercises,
        completed: allSolved && !s.completed.includes(lessonId) ? [...s.completed, lessonId] : s.completed,
      };
    }),
  reset: () => set({ ...emptyProgress, currentLesson: undefined }),
});

/**
 * The only place that knows where progress is stored. Components use the
 * selectors and actions, so swapping LocalStorage for an API changes this file only.
 */
// Reading localStorage throws when the browser blocks site data; progress then lasts one session.
const hasStorage = (() => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
})();

const STORAGE_KEY = 'dsa-progress';

function persistedStore() {
  const store = create(
    persist(creator, {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name),
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            // storage full: progress lasts this session instead of crashing the lesson that saved it
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      })),
      merge: (persisted, current) => ({ ...current, ...sanitizeProgress(persisted) }),
    }),
  );
  // Each save writes the whole state, so a tab must reload what another tab saved before its own next save erases it.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) void store.persist.rehydrate();
    });
  }
  return store;
}

export const useProgress = hasStorage ? persistedStore() : create(creator);
