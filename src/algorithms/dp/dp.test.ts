import { describe, expect, it } from 'vitest';
import type { GridView, Step } from '../../types/visualization';
import { greedyCoins } from '../greedy/coins';
import { coinChange, coinChangeCode, coinChangeSteps } from './coinChange';
import { fibonacciDp, fibonacciDpCode, fibonacciDpSteps } from './fibonacci';
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
