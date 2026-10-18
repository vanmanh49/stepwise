import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { heapSort, heapSortCode, heapSortSteps } from './heap';

const ascending = (values: number[]) => values.toSorted((a, b) => a - b);
const items = (step: Step) => (step.view.kind === 'heap' ? step.view.items : []);

function seeded(count: number): number[] {
  let seed = 7;
  return Array.from({ length: count }, () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed % 2001) - 1000;
  });
}

describe('heapSort', () => {
  it.each([
    ['empty', []],
    ['single element', [7]],
    ['normal input', [5, 2, 8, 1, 9, 3]],
    ['duplicates', [3, 1, 3, 2, 1]],
    ['negative values', [-4, 0, -9, 6]],
    ['already sorted', [1, 2, 3, 4, 5]],
    ['reverse sorted', [5, 4, 3, 2, 1]],
    ['large input', seeded(2000)],
  ])('sorts %s', (_label, input) => {
    expect(heapSort(input)).toEqual(ascending(input));
  });

  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    heapSort(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('heapSortSteps', () => {
  const input = [5, 2, 8, 1, 9, 3];
  const steps = heapSortSteps(input);

  it('shows the heap in every step and ends sorted', () => {
    expect(steps.every((s) => s.view.kind === 'heap')).toBe(true);
    expect(items(steps[0]!).map((c) => c.value)).toEqual(input);
    const last = items(steps.at(-1)!);
    expect(last.map((c) => c.value)).toEqual(ascending(input));
    expect(last.every((c) => c.role === 'sorted')).toBe(true);
  });

  it('keeps every item identity', () => {
    const initial = items(steps[0]!).map((c) => c.id).toSorted();
    for (const step of steps) expect(items(step).map((c) => c.id).toSorted()).toEqual(initial);
  });

  it('never un-sorts an item that reached its final place', () => {
    let sortedFrom = input.length;
    for (const step of steps) {
      const first = items(step).findIndex((c) => c.role === 'sorted');
      if (first === -1) continue;
      expect(first).toBeLessThanOrEqual(sortedFrom);
      expect(items(step).slice(first).every((c) => c.role === 'sorted')).toBe(true);
      sortedFrom = first;
    }
  });

  it('explains every step and points at a real code line', () => {
    const lines = heapSortCode.split('\n').length;
    for (const step of steps) {
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });

  it('stays small and handles trivial input', () => {
    expect(heapSortSteps(Array.from({ length: 12 }, (_, i) => 12 - i)).length).toBeLessThan(400);
    expect(heapSortSteps([]).length).toBeGreaterThanOrEqual(1);
    expect(heapSortSteps([7]).length).toBeGreaterThanOrEqual(1);
  });
});
