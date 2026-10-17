import { describe, expect, it } from 'vitest';
import type { CallsView, Step } from '../../types/visualization';
import { factorial, fibonacciNaive, recursionCode, recursionSteps } from './basics';
import { maxSubarray, maxSubarrayCode, maxSubarraySteps } from './maxSubarray';
import { nQueensCode, nQueensSteps, solveNQueens } from './nQueens';

function expectExplained(steps: Step[], code: string) {
  const lines = code.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

const lastCalls = (steps: Step[]): CallsView => {
  const view = steps[steps.length - 1]!.view;
  if (view.kind !== 'calls') throw new Error(`expected a calls view, got ${view.kind}`);
  return view;
};

describe('recursion basics', () => {
  it('computes factorial and naive Fibonacci', () => {
    expect(factorial(5)).toBe(120);
    expect(factorial(0)).toBe(1);
    expect(fibonacciNaive(5)).toEqual({ value: 5, calls: 15 });
    expect(fibonacciNaive(6)).toEqual({ value: 8, calls: 25 });
  });

  it('draws one frame per Fibonacci call and returns the answer at the root', () => {
    const steps = recursionSteps({ fn: 'fibonacci', n: '5' });
    const view = lastCalls(steps);
    expect(view.frames).toHaveLength(15);
    expect(view.frames[0]).toMatchObject({ label: 'fib(5)', result: '5' });
    expect(view.frames.every((f) => f.role === 'sorted')).toBe(true);
    expectExplained(steps, recursionCode);
  });

  it('draws a chain of frames for factorial', () => {
    const steps = recursionSteps({ fn: 'factorial', n: '5' });
    const view = lastCalls(steps);
    expect(view.frames.map((f) => f.label)).toEqual(['factorial(5)', 'factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)']);
    expect(view.frames[0]!.result).toBe('120');
    expectExplained(steps, recursionCode);
  });

  it('points out repeated work', () => {
    const steps = recursionSteps({ fn: 'fibonacci', n: '5' });
    expect(steps.some((s) => /again/i.test(s.why))).toBe(true);
  });

  it('stays readable for the largest input', () => {
    expectExplained(recursionSteps({ fn: 'fibonacci', n: '6' }), recursionCode);
  });

  it.each([
    { fn: 'fibonacci', n: '7' },
    { fn: 'fibonacci', n: '-1' },
    { fn: 'other', n: '3' },
  ])('refuses %o with one step', (values) => {
    expect(recursionSteps(values)).toHaveLength(1);
  });
});

function validQueens(cols: number[]): boolean {
  return cols.every((c, r) => cols.every((c2, r2) => r === r2 || (c !== c2 && Math.abs(c - c2) !== Math.abs(r - r2))));
}

describe('N-Queens backtracking', () => {
  it('finds the first solution in search order', () => {
    expect(solveNQueens(4)).toEqual([1, 3, 0, 2]);
  });

  it.each([5, 6])('finds a valid solution for %i queens', (n) => {
    const cols = solveNQueens(n)!;
    expect(cols).toHaveLength(n);
    expect(validQueens(cols)).toBe(true);
  });

  it('returns null when no solution exists', () => {
    expect(solveNQueens(3)).toBeNull();
  });

  it.each([4, 5, 6])('ends with the solution on the board for %i queens', (n) => {
    const steps = nQueensSteps({ n: String(n) });
    expectExplained(steps, nQueensCode);
    const last = steps[steps.length - 1]!.view;
    if (last.kind !== 'panels') throw new Error('expected panels');
    const board = last.panels[0]!.view;
    if (board.kind !== 'grid') throw new Error('expected a board');
    const queens = board.rows.map((row) => row.cells.findIndex((c) => c?.value === '♛'));
    expect(queens).toEqual(solveNQueens(n));
    expect(last.panels[1]!.view.kind).toBe('calls');
  });

  it('shows dead ends being undone', () => {
    const steps = nQueensSteps({ n: '4' });
    expect(steps.some((s) => /remove/i.test(s.title))).toBe(true);
    const last = steps[steps.length - 1]!.view;
    const calls = last.kind === 'panels' ? last.panels[1]!.view : last;
    expect(calls.kind === 'calls' && calls.frames.some((f) => f.role === 'discarded')).toBe(true);
  });

  it.each(['3', '7', 'x'])('refuses n = %s with one step', (n) => {
    expect(nQueensSteps({ n })).toHaveLength(1);
  });
});

/** Best sum; ties go to the smallest start, then the smallest end. */
function bruteForceMax(values: number[]): { sum: number; start: number; end: number } {
  let best = { sum: -Infinity, start: 0, end: 0 };
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let j = i; j < values.length; j++) {
      sum += values[j]!;
      if (sum > best.sum) best = { sum, start: i, end: j };
    }
  }
  return best;
}

function seededSigned(count: number, seed: number): number[] {
  return Array.from({ length: count }, () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed % 21) - 10;
  });
}

describe('maximum subarray by divide and conquer', () => {
  it('finds the best run in the lesson example', () => {
    expect(maxSubarray([-2, 1, -3, 4, -1, 2, 1, -5, 4])).toEqual({ sum: 6, start: 3, end: 6 });
  });

  it.each(Array.from({ length: 30 }, (_, i) => [i + 1, seededSigned(2 + (i % 11), i + 1)] as const))(
    'matches brute force on seeded array %i',
    (_seed, values) => {
      expect(maxSubarray(values)).toEqual(bruteForceMax(values));
    },
  );

  it('returns the single largest value when all are negative', () => {
    expect(maxSubarray([-5, -2, -8])).toEqual({ sum: -2, start: 1, end: 1 });
  });

  it('shows the array and the calls, ending on the best run', () => {
    const steps = maxSubarraySteps([-2, 1, -3, 4, -1, 2, 1, -5, 4]);
    expectExplained(steps, maxSubarrayCode);
    const last = steps[steps.length - 1]!.view;
    if (last.kind !== 'panels') throw new Error('expected panels');
    const array = last.panels[0]!.view;
    const found = array.kind === 'array' ? array.cells.flatMap((c, i) => (c.role === 'found' ? [i] : [])) : [];
    expect(found).toEqual([3, 4, 5, 6]);
    const calls = last.panels[1]!.view;
    expect(calls.kind === 'calls' && calls.frames[0]!.result).toBe('6');
  });

  it('stays readable for the largest input', () => {
    expectExplained(maxSubarraySteps(seededSigned(12, 9)), maxSubarrayCode);
  });
});
