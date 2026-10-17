import { describe, expect, it } from 'vitest';
import type { GridView, Step } from '../../types/visualization';
import { greedyCoins } from '../greedy/coins';
import { coinChange, coinChangeCode, coinChangeSteps } from './coinChange';
import { fibonacciDp, fibonacciDpCode, fibonacciDpSteps } from './fibonacci';
import { lcs, lcsCode, lcsSteps } from './lcs';
import { lis, lisCode, lisSteps } from './lis';
import { WALL_PRESET, gridPaths, gridPathsCode, gridPathsSteps, gridPathsStepsFor } from './gridPaths';
import { knapsack, knapsackCode, knapsackSteps } from './knapsack';

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

/** The grid of a step, whether it is shown alone or inside panels. */
function gridOf(step: Step): GridView {
  const view = step.view.kind === 'panels' ? step.view.panels.find((p) => p.view.kind === 'grid')!.view : step.view;
  if (view.kind !== 'grid') throw new Error(`expected a grid, got ${view.kind}`);
  return view;
}

const rowValues = (grid: GridView, row = 0) => grid.rows[row]!.cells.map((c) => c?.value);

/** No DP cell ever shows a raw JavaScript Infinity, NaN or -1. */
function expectCleanCells(steps: Step[]) {
  for (const step of steps) {
    const views = step.view.kind === 'panels' ? step.view.panels.map((p) => p.view) : [step.view];
    for (const view of views) {
      if (view.kind !== 'grid') continue;
      for (const row of view.rows) for (const cell of row.cells) expect(['Infinity', 'NaN', '-1', -1]).not.toContain(cell?.value);
    }
  }
}

describe('Fibonacci DP', () => {
  it('computes Fibonacci numbers', () => {
    expect(fibonacciDp(0)).toBe(0);
    expect(fibonacciDp(1)).toBe(1);
    expect(fibonacciDp(12)).toBe(144);
  });

  it('memoised recursion makes 2n − 1 calls and fills the memo', () => {
    const steps = fibonacciDpSteps({ n: '6', method: 'memo' });
    expectExplained(steps, fibonacciDpCode);
    expectCleanCells(steps);
    const last = steps[steps.length - 1]!.view;
    if (last.kind !== 'panels') throw new Error('expected panels');
    const calls = last.panels.find((p) => p.view.kind === 'calls')!.view;
    expect(calls.kind === 'calls' && calls.frames).toHaveLength(11);
    expect(rowValues(gridOf(steps[steps.length - 1]!)).at(-1)).toBe(8);
  });

  it('the table version fills left to right', () => {
    const steps = fibonacciDpSteps({ n: '6', method: 'table' });
    expectExplained(steps, fibonacciDpCode);
    expect(rowValues(gridOf(steps[steps.length - 1]!))).toEqual([0, 1, 1, 2, 3, 5, 8]);
    const fill = steps.find((s) => s.title.startsWith('dp[4]'))!;
    expect(gridOf(fill).arrows).toEqual([
      { from: [0, 3], to: [0, 4] },
      { from: [0, 2], to: [0, 4] },
    ]);
  });

  it('stays readable for the largest input', () => {
    expectExplained(fibonacciDpSteps({ n: '12', method: 'memo' }), fibonacciDpCode);
    expectExplained(fibonacciDpSteps({ n: '12', method: 'table' }), fibonacciDpCode);
  });

  it.each([{ n: '13', method: 'memo' }, { n: 'x', method: 'table' }, { n: '5', method: 'other' }])('refuses %o with one step', (values) => {
    expect(fibonacciDpSteps(values)).toHaveLength(1);
  });
});

function seededList(count: number, max: number, seed: number): number[] {
  return Array.from({ length: count }, () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return 1 + (seed % max);
  });
}

function bruteKnapsack(weights: number[], values: number[], capacity: number): number {
  let best = 0;
  for (let mask = 0; mask < 1 << weights.length; mask++) {
    let w = 0;
    let v = 0;
    weights.forEach((wi, i) => {
      if (mask & (1 << i)) (w += wi), (v += values[i]!);
    });
    if (w <= capacity) best = Math.max(best, v);
  }
  return best;
}

const knapsackValues = (w: number[], v: number[], c: number) => ({ weights: w.join(', '), values: v.join(', '), capacity: String(c) });

describe('0/1 knapsack', () => {
  it('finds the best value and the items for the lesson example', () => {
    expect(knapsack([1, 3, 4, 5], [1, 4, 5, 7], 7)).toEqual({ best: 9, items: [1, 2] });
  });

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('matches brute force on seeded case %i', (seed) => {
    const count = 1 + (seed % 5);
    const weights = seededList(count, 8, seed);
    const values = seededList(count, 20, seed + 100);
    const capacity = seed % 11;
    const result = knapsack(weights, values, capacity);
    expect(result.best).toBe(bruteKnapsack(weights, values, capacity));
    expect(result.items.reduce((sum, i) => sum + weights[i]!, 0)).toBeLessThanOrEqual(capacity);
    expect(result.items.reduce((sum, i) => sum + values[i]!, 0)).toBe(result.best);
  });

  it('takes nothing with capacity 0', () => {
    expect(knapsack([1, 2], [3, 4], 0)).toEqual({ best: 0, items: [] });
  });

  it('fills the item × capacity table and traces back the chosen items', () => {
    const steps = knapsackSteps(knapsackValues([1, 3, 4, 5], [1, 4, 5, 7], 7));
    expectExplained(steps, knapsackCode);
    expectCleanCells(steps);
    const grid = gridOf(steps[steps.length - 1]!);
    expect(grid.rows).toHaveLength(5);
    expect(grid.colLabels).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
    expect(grid.rows[4]!.cells[7]!.value).toBe(9);
    expect(steps.some((s) => (gridOf(s).arrows ?? []).length > 0)).toBe(true);
  });

  it('stays readable for the largest input', () => {
    expectExplained(knapsackSteps(knapsackValues([1, 2, 3, 4, 5], [5, 4, 3, 2, 1], 10)), knapsackCode);
  });

  it('refuses lists of different lengths, naming both', () => {
    const steps = knapsackSteps(knapsackValues([1, 2], [3], 5));
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toContain('Weights');
    expect(steps[0]!.why).toContain('Values');
  });

  it.each([knapsackValues([1], [1], 11), knapsackValues([1, 2, 3, 4, 5, 6], [1, 1, 1, 1, 1, 1], 5), { weights: 'x', values: '1', capacity: '3' }])(
    'refuses %o with one step',
    (values) => {
      expect(knapsackSteps(values)).toHaveLength(1);
    },
  );
});

function bruteCoins(coins: number[], amount: number): number | null {
  let best: number | null = null;
  const search = (left: number, used: number, from: number) => {
    if (left === 0) {
      if (best === null || used < best) best = used;
      return;
    }
    for (let i = from; i < coins.length; i++) if (coins[i]! <= left) search(left - coins[i]!, used + 1, i);
  };
  search(amount, 0, 0);
  return best;
}

describe('coin change', () => {
  it('beats greedy where greedy is wrong', () => {
    expect(coinChange([1, 3, 4], 6)).toBe(2);
    expect(greedyCoins([1, 3, 4], 6)!.length).toBe(3);
  });

  it('reports an impossible amount as null', () => {
    expect(coinChange([5], 3)).toBeNull();
  });

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('matches brute force on seeded case %i', (seed) => {
    const coins = [...new Set(seededList(1 + (seed % 4), 9, seed))];
    const amount = seed % 21;
    expect(coinChange(coins, amount)).toBe(bruteCoins(coins, amount));
  });

  it('fills one cell per amount and shows the coins used', () => {
    const steps = coinChangeSteps({ coins: '1, 3, 4', amount: '6' });
    expectExplained(steps, coinChangeCode);
    expectCleanCells(steps);
    const grid = gridOf(steps[steps.length - 1]!);
    expect(rowValues(grid)).toEqual([0, 1, 2, 1, 1, 2, 2]);
    expect(steps[steps.length - 1]!.title).toContain('2 coins');
  });

  it('shows ∞ and says so when the amount is impossible', () => {
    const steps = coinChangeSteps({ coins: '5', amount: '3' });
    expectExplained(steps, coinChangeCode);
    expectCleanCells(steps);
    expect(rowValues(gridOf(steps[steps.length - 1]!)).at(-1)).toBe('∞');
    expect(steps[steps.length - 1]!.title.toLowerCase()).toContain('impossible');
  });

  it('stays readable for the largest input', () => {
    expectExplained(coinChangeSteps({ coins: '1, 2, 5, 10, 25', amount: '20' }), coinChangeCode);
  });

  it.each([{ coins: '1, 2', amount: '21' }, { coins: '', amount: '5' }, { coins: '1, 2, 3, 4, 5, 6', amount: '5' }, { coins: '26', amount: '5' }])(
    'refuses %o with one step',
    (values) => {
      expect(coinChangeSteps(values)).toHaveLength(1);
    },
  );
});

function isSubsequence(sub: string, of: string): boolean {
  let i = 0;
  for (const ch of of) if (ch === sub[i]) i++;
  return i === sub.length;
}

function bruteLcsLength(a: string, b: string): number {
  let best = 0;
  for (let mask = 0; mask < 1 << a.length; mask++) {
    const sub = [...a].filter((_, i) => mask & (1 << i)).join('');
    if (sub.length > best && isSubsequence(sub, b)) best = sub.length;
  }
  return best;
}

function seededText(length: number, seed: number): string {
  return Array.from({ length }, () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return 'ABC'[seed % 3];
  }).join('');
}

describe('longest common subsequence', () => {
  it('finds a common subsequence of length 4 in the lesson example', () => {
    const result = lcs('ABCBDAB', 'BDCABA');
    expect(result).toHaveLength(4);
    expect(isSubsequence(result, 'ABCBDAB')).toBe(true);
    expect(isSubsequence(result, 'BDCABA')).toBe(true);
  });

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('matches brute force on seeded strings %i', (seed) => {
    const a = seededText(1 + (seed % 6), seed);
    const b = seededText(1 + ((seed * 7) % 6), seed + 50);
    const result = lcs(a, b);
    expect(result.length).toBe(bruteLcsLength(a, b));
    expect(isSubsequence(result, a) && isSubsequence(result, b)).toBe(true);
  });

  it('fills the table and traces back the subsequence', () => {
    const steps = lcsSteps({ a: 'ABCBDAB', b: 'BDCABA' });
    expectExplained(steps, lcsCode);
    expectCleanCells(steps);
    const grid = gridOf(steps[steps.length - 1]!);
    expect(grid.colLabels).toEqual(['', 'B', 'D', 'C', 'A', 'B', 'A']);
    expect(grid.rows.map((r) => r.label)).toEqual(['', 'A', 'B', 'C', 'B', 'D', 'A', 'B']);
    expect(grid.rows[7]!.cells[6]!.value).toBe(4);
    expect(steps[steps.length - 1]!.title).toContain(lcs('ABCBDAB', 'BDCABA'));
  });

  it('says when there is no common character', () => {
    expect(lcs('ABC', 'XYZ')).toBe('');
    const steps = lcsSteps({ a: 'ABC', b: 'XYZ' });
    expectExplained(steps, lcsCode);
    expect(steps[steps.length - 1]!.title.toLowerCase()).toContain('empty');
  });

  it('stays readable for the largest input', () => {
    expectExplained(lcsSteps({ a: 'ABCDEFGH', b: 'HGFEDCBA' }), lcsCode);
  });

  it.each([{ a: 'ABCDEFGHI', b: 'AB' }, { a: '', b: 'AB' }])('refuses %o with one step', (values) => {
    expect(lcsSteps(values)).toHaveLength(1);
  });
});

function bruteLisLength(values: number[]): number {
  let best = 0;
  for (let mask = 1; mask < 1 << values.length; mask++) {
    const picked = values.filter((_, i) => mask & (1 << i));
    if (picked.every((v, i) => i === 0 || picked[i - 1]! < v)) best = Math.max(best, picked.length);
  }
  return best;
}

const strictlyIncreasing = (values: number[]) => values.every((v, i) => i === 0 || values[i - 1]! < v);

describe('longest increasing subsequence', () => {
  it('finds a run of length 4 in the lesson example', () => {
    const result = lis([10, 9, 2, 5, 3, 7, 101, 18]);
    expect(result).toHaveLength(4);
    expect(strictlyIncreasing(result)).toBe(true);
  });

  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('matches brute force on seeded array %i', (seed) => {
    const values = seededList(2 + (seed % 11), 30, seed);
    const result = lis(values);
    expect(result.length).toBe(bruteLisLength(values));
    expect(strictlyIncreasing(result)).toBe(true);
    expect(isSubsequenceOf(result, values)).toBe(true);
  });

  it('gives length 1 for a strictly decreasing list', () => {
    expect(lis([5, 4, 3, 2, 1])).toHaveLength(1);
  });

  it('shows value, length and predecessor rows, ending on the sequence', () => {
    const steps = lisSteps([10, 9, 2, 5, 3, 7, 101, 18]);
    expectExplained(steps, lisCode);
    expectCleanCells(steps);
    const grid = gridOf(steps[steps.length - 1]!);
    expect(grid.rows.map((r) => r.label)).toEqual(['value', 'length', 'from']);
    expect(rowValues(grid, 1)).toEqual([1, 1, 1, 2, 2, 3, 4, 4]);
    const found = grid.rows[0]!.cells.flatMap((c) => (c?.role === 'found' ? [c.value] : []));
    expect(found).toEqual(lis([10, 9, 2, 5, 3, 7, 101, 18]));
  });

  it('stays readable for the largest input', () => {
    expectExplained(lisSteps(seededList(12, 30, 4)), lisCode);
  });
});

function isSubsequenceOf(sub: number[], of: number[]): boolean {
  let i = 0;
  for (const v of of) if (v === sub[i]) i++;
  return i === sub.length;
}

function dfsPaths(rows: number, cols: number, blocked: [number, number][]): number {
  const isBlocked = (r: number, c: number) => blocked.some(([br, bc]) => br === r && bc === c);
  const count = (r: number, c: number): number => {
    if (r >= rows || c >= cols || isBlocked(r, c)) return 0;
    if (r === rows - 1 && c === cols - 1) return 1;
    return count(r + 1, c) + count(r, c + 1);
  };
  return count(0, 0);
}

describe('grid paths', () => {
  it('counts paths in an open grid', () => {
    expect(gridPaths(3, 4, [])).toBe(10);
    expect(gridPaths(6, 6, [])).toBe(252);
  });

  it.each([2, 3, 4, 5, 6].flatMap((r) => [2, 3, 4, 5, 6].map((c) => [r, c] as const)))('matches DFS with the wall for %i × %i', (r, c) => {
    const wall = WALL_PRESET(r, c);
    expect(wall.some(([br, bc]) => (br === 0 && bc === 0) || (br === r - 1 && bc === c - 1))).toBe(false);
    expect(gridPaths(r, c, wall)).toBe(dfsPaths(r, c, wall));
  });

  it('fills the grid cell by cell', () => {
    const steps = gridPathsSteps({ rows: '3', cols: '4', blocked: 'none' });
    expectExplained(steps, gridPathsCode);
    expectCleanCells(steps);
    expect(gridOf(steps[steps.length - 1]!).rows[2]!.cells[3]!.value).toBe(10);
  });

  it('shows the wall as blocked cells', () => {
    const steps = gridPathsSteps({ rows: '4', cols: '5', blocked: 'wall' });
    expectExplained(steps, gridPathsCode);
    const grid = gridOf(steps[steps.length - 1]!);
    const walls = grid.rows.flatMap((row) => row.cells.filter((c) => c?.value === '■'));
    expect(walls).toHaveLength(WALL_PRESET(4, 5).length);
    expect(walls.every((c) => c?.role === 'discarded')).toBe(true);
  });

  it('says when no path exists', () => {
    expect(gridPaths(3, 3, [[0, 0]])).toBe(0);
    const steps = gridPathsStepsFor(3, 3, [[0, 0]]);
    expectExplained(steps, gridPathsCode);
    expect(steps[steps.length - 1]!.title.toLowerCase()).toContain('no path');
  });

  it('stays readable for the largest input', () => {
    expectExplained(gridPathsSteps({ rows: '6', cols: '6', blocked: 'wall' }), gridPathsCode);
  });

  it.each([{ rows: '7', cols: '3', blocked: 'none' }, { rows: '3', cols: '0', blocked: 'none' }, { rows: '3', cols: '3', blocked: 'maze' }])(
    'refuses %o with one step',
    (values) => {
      expect(gridPathsSteps(values)).toHaveLength(1);
    },
  );
});
