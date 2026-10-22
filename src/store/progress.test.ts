import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeStreak, emptyProgress, percent, sanitizeProgress, useProgress } from './progress';

describe('sanitizeProgress', () => {
  it.each([[null], ['x'], [42], [undefined], [{ completed: 'no' }], [[]]])('falls back to empty progress for %j', (raw) => {
    expect(sanitizeProgress(raw)).toEqual(emptyProgress);
  });

  it('keeps valid fields and drops malformed entries', () => {
    const result = sanitizeProgress({
      completed: ['array', 7, null, 'stack'],
      quizScores: { array: { correct: 3, total: 4 }, bad: { correct: 'x' }, worse: 5 },
      currentLesson: 'stack',
      activeDays: ['2026-10-13', 'not a date', 3],
      extra: true,
    });
    expect(result).toEqual({
      completed: ['array', 'stack'],
      quizScores: { array: { correct: 3, total: 4 } },
      currentLesson: 'stack',
      activeDays: ['2026-10-13'],
      exercises: [],
    });
  });

  it('keeps well-formed solved exercises once', () => {
    expect(sanitizeProgress({ completed: [] }).exercises).toEqual([]);
    expect(sanitizeProgress({ exercises: ['where/books', 'where/books', 3, 'nolesson', 'a/b/c', '/x', 'where/'] }).exercises).toEqual([
      'where/books',
    ]);
  });
});

describe('quiz score validation', () => {
  it('drops scores that cannot be compared', () => {
    const result = sanitizeProgress({
      quizScores: { a: { correct: 0, total: 0 }, b: { correct: 5, total: 4 }, c: { correct: -1, total: 4 }, d: { correct: 0, total: 4 } },
    });
    expect(result.quizScores).toEqual({ d: { correct: 0, total: 4 } });
  });
});

describe('computeStreak', () => {
  it('is 0 with no activity', () => {
    expect(computeStreak([], '2026-10-13')).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-10-11', '2026-10-12', '2026-10-13'], '2026-10-13')).toBe(3);
  });

  it('still counts a streak that ended yesterday', () => {
    expect(computeStreak(['2026-10-11', '2026-10-12'], '2026-10-13')).toBe(2);
  });

  it('resets after a missed day', () => {
    expect(computeStreak(['2026-10-10'], '2026-10-13')).toBe(0);
    expect(computeStreak(['2026-10-09', '2026-10-10', '2026-10-12', '2026-10-13'], '2026-10-13')).toBe(2);
  });

  it('ignores duplicates and order', () => {
    expect(computeStreak(['2026-10-13', '2026-10-12', '2026-10-13'], '2026-10-13')).toBe(2);
  });

  it('crosses month boundaries', () => {
    expect(computeStreak(['2026-09-30', '2026-10-01'], '2026-10-01')).toBe(2);
  });
});

describe('percent', () => {
  it('rounds and handles an empty total', () => {
    expect(percent(0, 0)).toBe(0);
    expect(percent(1, 3)).toBe(33);
    expect(percent(7, 7)).toBe(100);
  });
});

describe('useProgress', () => {
  beforeEach(() => useProgress.getState().reset());

  it('marks a lesson complete only once', () => {
    useProgress.getState().markComplete('array');
    useProgress.getState().markComplete('array');
    expect(useProgress.getState().completed).toEqual(['array']);
  });

  it('can unmark a lesson', () => {
    useProgress.getState().markComplete('array');
    useProgress.getState().unmarkComplete('array');
    expect(useProgress.getState().completed).toEqual([]);
  });

  it('keeps the best quiz score', () => {
    useProgress.getState().recordQuiz('array', 2, 4);
    useProgress.getState().recordQuiz('array', 1, 4);
    expect(useProgress.getState().quizScores.array).toEqual({ correct: 2, total: 4 });
    expect(useProgress.getState().completed).toEqual([]);
  });

  it('completes the lesson on a perfect quiz', () => {
    useProgress.getState().recordQuiz('array', 4, 4);
    expect(useProgress.getState().completed).toEqual(['array']);
  });

  it('records the current lesson and today as active on visit', () => {
    useProgress.getState().visit('stack');
    useProgress.getState().visit('stack');
    const state = useProgress.getState();
    expect(state.currentLesson).toBe('stack');
    expect(state.activeDays).toHaveLength(1);
    expect(state.activeDays[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('reset clears everything', () => {
    useProgress.getState().visit('stack');
    useProgress.getState().markComplete('stack');
    useProgress.getState().reset();
    const { completed, quizScores, currentLesson, activeDays, exercises } = useProgress.getState();
    expect({ completed, quizScores, currentLesson, activeDays, exercises }).toEqual({ ...emptyProgress, currentLesson: undefined });
  });
});

describe('solveExercise', () => {
  beforeEach(() => useProgress.getState().reset());

  it('completes the lesson once every exercise is solved', () => {
    const { solveExercise } = useProgress.getState();
    solveExercise('where', 'a', ['a', 'b']);
    expect(useProgress.getState().exercises).toEqual(['where/a']);
    expect(useProgress.getState().completed).not.toContain('where');
    solveExercise('where', 'b', ['a', 'b']);
    expect(useProgress.getState().completed).toContain('where');
  });

  it('records an exercise once', () => {
    const { solveExercise } = useProgress.getState();
    solveExercise('where', 'a', ['a', 'b']);
    solveExercise('where', 'a', ['a', 'b']);
    expect(useProgress.getState().exercises).toEqual(['where/a']);
  });

  it('is cleared by reset', () => {
    useProgress.getState().solveExercise('where', 'a', ['a']);
    useProgress.getState().reset();
    expect(useProgress.getState().exercises).toEqual([]);
  });
});

describe('blocked storage', () => {
  it('still loads and works when reading localStorage throws', async () => {
    vi.resetModules();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      const { useProgress: fresh } = await import('./progress');
      fresh.getState().markComplete('array');
      expect(fresh.getState().completed).toEqual(['array']);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
