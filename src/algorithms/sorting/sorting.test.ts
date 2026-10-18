import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { bubbleSort, bubbleSortCode, bubbleSortSteps } from './bubble';
import { insertionSort, insertionSortCode, insertionSortSteps } from './insertion';
import { mergeSort, mergeSortCode, mergeSortSteps } from './merge';
import { quickSort, quickSortCode, quickSortSteps } from './quick';
import { selectionSort, selectionSortCode, selectionSortSteps } from './selection';

const ascending = (values: number[]) => values.toSorted((a, b) => a - b);

function seeded(count: number): number[] {
  let seed = 42;
  return Array.from({ length: count }, () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed % 2001) - 1000;
  });
}

const cases: [string, number[]][] = [
  ['empty', []],
  ['single element', [7]],
  ['normal input', [5, 2, 8, 1, 9, 3]],
  ['duplicates', [3, 1, 3, 2, 1]],
  ['negative values', [-4, 0, -9, 6]],
  ['already sorted', [1, 2, 3, 4, 5]],
  ['reverse sorted', [5, 4, 3, 2, 1]],
  ['large input', seeded(2000)],
];

const mainValues = (step: Step) => (step.view.kind === 'array' ? step.view.cells.map((c) => c.value) : []);

function realIds(step: Step): string[] {
  if (step.view.kind !== 'array') return [];
  const all = [...step.view.cells, ...(step.view.aux?.cells ?? [])];
  return all.map((c) => c.id).filter((id) => !id.startsWith('hole'));
}

describe.each([
  ['bubble sort', bubbleSort, bubbleSortSteps, bubbleSortCode],
  ['selection sort', selectionSort, selectionSortSteps, selectionSortCode],
  ['insertion sort', insertionSort, insertionSortSteps, insertionSortCode],
  ['merge sort', mergeSort, mergeSortSteps, mergeSortCode],
  ['quick sort', quickSort, quickSortSteps, quickSortCode],
] as const)('%s', (_name, sort, steps, code) => {
  it.each(cases)('sorts %s', (_label, input) => {
    expect(sort(input)).toEqual(ascending(input));
  });

  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    sort(input);
    expect(input).toEqual([3, 1, 2]);
  });

  it.each([[[5, 2, 8, 1, 9, 3]], [[3, 1, 3, 2, 1]]])('generates steps that end sorted for %j', (input) => {
    const result = steps(input);
    const last = result.at(-1)!;
    expect(mainValues(last)).toEqual(ascending(input));
    expect(last.view.kind === 'array' && last.view.cells.every((c) => c.role === 'sorted')).toBe(true);
    expect(mainValues(result[0]!)).toEqual(input);
  });

  it('keeps every cell identity through every step', () => {
    const result = steps([5, 2, 8, 1, 9, 3]);
    const initial = realIds(result[0]!).toSorted();
    expect(initial).toHaveLength(6);
    for (const step of result) {
      expect(step.view.kind).toBe('array');
      const ids = realIds(step);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.toSorted()).toEqual(initial);
    }
  });

  it('explains every step and points at a real code line', () => {
    const lines = code.split('\n').length;
    for (const step of steps([5, 2, 8, 1, 9, 3])) {
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });

  it('stays under 400 steps for 12 reversed items', () => {
    const input = Array.from({ length: 12 }, (_, i) => 12 - i);
    expect(steps(input).length).toBeLessThan(400);
  });

  it.each([[[]], [[7]]])('handles %j without throwing', (input) => {
    expect(steps(input).length).toBeGreaterThanOrEqual(1);
  });
});
