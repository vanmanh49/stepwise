import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { binarySearch, binarySearchCode, binarySearchSteps, prepareSearchInput } from './binary';
import { linearSearch, linearSearchCode, linearSearchSteps } from './linear';

const foundIndex = (step: Step) =>
  step.view.kind === 'array' ? step.view.cells.findIndex((c) => c.role === 'found') : -1;
const hasCompare = (step: Step) => step.view.kind === 'array' && step.view.cells.some((c) => c.role === 'compare');

describe.each([
  ['linear search', linearSearch, linearSearchSteps, linearSearchCode],
  ['binary search', binarySearch, binarySearchSteps, binarySearchCode],
] as const)('%s', (_name, search, steps, code) => {
  it('returns -1 for an empty array', () => {
    expect(search([], 3)).toBe(-1);
  });

  it('handles a single element', () => {
    expect(search([4], 4)).toBe(0);
    expect(search([4], 5)).toBe(-1);
  });

  it('finds a present value and reports a missing one', () => {
    expect(search([1, 3, 5, 7, 9, 11], 7)).toBe(3);
    expect(search([1, 3, 5, 7, 9, 11], 4)).toBe(-1);
  });

  it('handles negative values', () => {
    expect(search([-9, -4, 0, 6], -4)).toBe(1);
  });

  it('marks the found cell in the last step', () => {
    const result = steps([1, 3, 5, 7, 9, 11], 7);
    expect(foundIndex(result.at(-1)!)).toBe(3);
  });

  it('marks nothing as found when the target is missing', () => {
    const result = steps([1, 3, 5, 7, 9, 11], 4);
    expect(result.every((s) => foundIndex(s) === -1)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('explains every step and points at a real code line', () => {
    const lines = code.split('\n').length;
    for (const step of [...steps([1, 3, 5, 7, 9, 11], 9), ...steps([], 1)]) {
      expect(step.title).not.toBe('');
      expect(step.why).not.toBe('');
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lines);
    }
  });
});

describe('duplicates', () => {
  it('linear search returns the first match', () => {
    expect(linearSearch([2, 5, 5, 8], 5)).toBe(1);
  });

  it('binary search returns some matching index', () => {
    const arr = [2, 5, 5, 8];
    expect(arr[binarySearch(arr, 5)]).toBe(5);
  });
});

describe('binary search efficiency', () => {
  it('searches 100 000 values', () => {
    const big = Array.from({ length: 100_000 }, (_, i) => i * 2);
    expect(binarySearch(big, 199_998)).toBe(99_999);
    expect(binarySearch(big, 7)).toBe(-1);
  });

  it('needs at most 4 comparisons for 12 values', () => {
    const arr = Array.from({ length: 12 }, (_, i) => i * 3);
    for (const target of [0, 33, 15, 100, -1]) {
      expect(binarySearchSteps(arr, target).filter(hasCompare).length).toBeLessThanOrEqual(4);
    }
  });
});

describe('prepareSearchInput', () => {
  it('sorts unsorted input when the algorithm needs it', () => {
    expect(prepareSearchInput([5, 1, 3], true)).toEqual({ values: [1, 3, 5], wasSorted: true });
  });

  it('leaves sorted input alone', () => {
    expect(prepareSearchInput([1, 3, 5], true)).toEqual({ values: [1, 3, 5], wasSorted: false });
  });

  it('leaves input alone when order does not matter', () => {
    expect(prepareSearchInput([5, 1, 3], false)).toEqual({ values: [5, 1, 3], wasSorted: false });
  });
});
