import { describe, expect, it } from 'vitest';
import type { GridView, Step } from '../../types/visualization';
import { fibonacciDp, fibonacciDpCode, fibonacciDpSteps } from './fibonacci';

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
