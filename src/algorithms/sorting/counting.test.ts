import { describe, expect, it } from 'vitest';
import type { Cell, Step } from '../../types/visualization';
import { countingSort, countingSortCode, countingSortSteps } from './counting';
import { radixSort, radixSortCode, radixSortSteps } from './radix';

const ascending = (values: number[]) => [...values].sort((a, b) => a - b);

function seeded(count: number, max: number, seed: number): number[] {
  return Array.from({ length: count }, () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed % (max + 1);
  });
}

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

const finalCells = (steps: Step[]): Cell[] => {
  const view = steps[steps.length - 1]!.view;
  if (view.kind === 'array') return view.cells;
  if (view.kind === 'buckets') return view.input?.cells ?? [];
  return [];
};

const smallCases = [[4, 2, 2, 8, 3, 3, 1], [0], [9, 9, 0], ...Array.from({ length: 20 }, (_, i) => seeded(2 + (i % 11), 9, i + 1))];
const wideCases = [[170, 45, 75, 90, 802, 24, 2, 66], [0], [5, 0], ...Array.from({ length: 20 }, (_, i) => seeded(2 + (i % 11), 999, i + 1))];

describe('counting sort', () => {
  it.each(smallCases.map((c) => [c.join(','), c] as const))('sorts %s', (_label, values) => {
    expect(countingSort(values)).toEqual(ascending(values));
    const steps = countingSortSteps(values);
    expect(finalCells(steps).map((c) => c.value)).toEqual(ascending(values));
    expectExplained(steps, countingSortCode);
  });

  it('is stable', () => {
    const ids = finalCells(countingSortSteps([3, 1, 3])).map((c) => c.id);
    expect(ids.indexOf('c0')).toBeLessThan(ids.indexOf('c2'));
  });

  it('shows ten count cells', () => {
    const view = countingSortSteps([4, 2])[1]!.view;
    expect(view.kind === 'array' && view.aux?.cells.length).toBe(10);
  });

  it('refuses values outside 0–9 with one step', () => {
    expect(countingSortSteps([4, 12])).toHaveLength(1);
    expect(countingSortSteps([-1, 2])).toHaveLength(1);
  });
});

describe('radix sort', () => {
  it.each(wideCases.map((c) => [c.join(','), c] as const))('sorts %s', (_label, values) => {
    expect(radixSort(values)).toEqual(ascending(values));
    const steps = radixSortSteps(values);
    expect(finalCells(steps).map((c) => c.value)).toEqual(ascending(values));
    expectExplained(steps, radixSortCode);
  });

  it('uses ten digit buckets', () => {
    const bucketsStep = radixSortSteps([170, 45]).find((s) => s.view.kind === 'buckets')!;
    expect(bucketsStep.view.kind === 'buckets' && bucketsStep.view.buckets.map((b) => b.label)).toEqual(
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    );
  });

  it('makes one pass per digit of the largest value', () => {
    const labels = new Set(radixSortSteps([170, 45, 2]).flatMap((s) => (s.view.kind === 'buckets' && s.view.input ? [s.view.input.label] : [])));
    expect([...labels].filter((l) => l.startsWith('Pass'))).toHaveLength(3);
  });

  it('refuses values outside 0–999 with one step', () => {
    expect(radixSortSteps([-1, 5])).toHaveLength(1);
    expect(radixSortSteps([1000, 5])).toHaveLength(1);
  });
});
