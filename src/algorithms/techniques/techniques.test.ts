import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { prefixSumCode, prefixSumSteps, prefixSums, rangeSum } from './prefixSum';
import { maxWindowSum, slidingWindowCode, slidingWindowSteps } from './slidingWindow';
import { twoPointersCode, twoPointersSteps, twoSumSorted } from './twoPointers';

const cells = (step: Step) => (step.view.kind === 'array' ? step.view.cells : []);
const indicesWith = (step: Step, role: string) =>
  cells(step).flatMap((c, i) => (c.role === role ? [i] : []));

function expectExplained(steps: Step[], code: string) {
  const lines = code.split('\n').length;
  for (const step of steps) {
    expect(step.view.kind).toBe('array');
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

describe('two pointers', () => {
  it('finds a pair that adds up to the target', () => {
    expect(twoSumSorted([1, 3, 4, 6, 8, 11], 14)).toEqual([1, 5]);
    expect(twoSumSorted([2, 2, 3], 4)).toEqual([0, 1]);
    expect(twoSumSorted([-5, -1, 0, 4], -6)).toEqual([0, 1]);
  });

  it('returns null when no pair exists', () => {
    expect(twoSumSorted([1, 2, 3], 100)).toBeNull();
    expect(twoSumSorted([5], 10)).toBeNull();
    expect(twoSumSorted([], 0)).toBeNull();
  });

  it('never pairs a value with itself', () => {
    expect(twoSumSorted([1, 5, 9], 10)).toEqual([0, 2]);
    expect(twoSumSorted([1, 5, 8], 10)).toBeNull();
  });

  it('ends on the found pair', () => {
    const steps = twoPointersSteps([1, 3, 4, 6, 8, 11], 14);
    expect(indicesWith(steps.at(-1)!, 'found')).toEqual([1, 5]);
    expectExplained(steps, twoPointersCode);
  });

  it('ends without a pair when there is none', () => {
    for (const input of [[1, 2, 3], [5], []]) {
      const steps = twoPointersSteps(input, 100);
      expect(steps.length).toBeGreaterThanOrEqual(2);
      expect(steps.every((s) => indicesWith(s, 'found').length === 0)).toBe(true);
      expectExplained(steps, twoPointersCode);
    }
  });
});

describe('sliding window', () => {
  it('finds the largest sum of k neighbours', () => {
    expect(maxWindowSum([2, 1, 5, 1, 3, 2], 3)).toEqual({ sum: 9, start: 2 });
    expect(maxWindowSum([2, 1, 5, 1, 3, 2], 1)).toEqual({ sum: 5, start: 2 });
    expect(maxWindowSum([2, 1, 5, 1, 3, 2], 6)).toEqual({ sum: 14, start: 0 });
    expect(maxWindowSum([-3, -1, -2], 2)).toEqual({ sum: -3, start: 1 });
  });

  it('returns the first window on a tie', () => {
    expect(maxWindowSum([4, 4, 4, 4], 2)).toEqual({ sum: 8, start: 0 });
  });

  it.each([0, 7, -1, 1.5])('rejects the window size %j', (k) => {
    expect(maxWindowSum([2, 1, 5, 1, 3, 2], k)).toBeNull();
    expect(slidingWindowSteps([2, 1, 5, 1, 3, 2], k)).toHaveLength(1);
  });

  it('ends on the best window in at most n + 3 steps', () => {
    const input = [2, 1, 5, 1, 3, 2];
    const steps = slidingWindowSteps(input, 3);
    expect(indicesWith(steps.at(-1)!, 'found')).toEqual([2, 3, 4]);
    expect(steps.length).toBeLessThanOrEqual(input.length + 3);
    expectExplained(steps, slidingWindowCode);
  });
});

describe('prefix sums', () => {
  it('builds running totals with a leading zero', () => {
    expect(prefixSums([3, 1, 4])).toEqual([0, 3, 4, 8]);
    expect(prefixSums([])).toEqual([0]);
  });

  it('answers range sums by subtraction', () => {
    expect(rangeSum(prefixSums([3, 1, 4, 1, 5]), 1, 3)).toBe(6);
    const values = [5, -2, 7, 0, 3, 9];
    const prefix = prefixSums(values);
    for (let left = 0; left < values.length; left++) {
      for (let right = left; right < values.length; right++) {
        const direct = values.slice(left, right + 1).reduce((a, b) => a + b, 0);
        expect(rangeSum(prefix, left, right)).toBe(direct);
      }
    }
  });

  it('builds the prefix row and then answers a query', () => {
    const steps = prefixSumSteps([3, 1, 4, 1, 5, 9, 2]);
    const last = steps.at(-1)!;
    expect(last.variables).toMatchObject({ left: 1, right: 5, result: 20 });
    if (last.view.kind !== 'array') throw new Error('expected an array view');
    expect(last.view.aux!.cells.map((c) => c.value)).toEqual([0, 3, 4, 8, 9, 14, 23, 25]);
    expectExplained(steps, prefixSumCode);
  });

  it('queries the whole list when it is short', () => {
    expect(prefixSumSteps([7, 2]).at(-1)!.variables).toMatchObject({ left: 0, right: 1, result: 9 });
    expect(prefixSumSteps([7]).at(-1)!.variables).toMatchObject({ left: 0, right: 0, result: 7 });
  });

  it('handles an empty list', () => {
    const steps = prefixSumSteps([]);
    expect(steps.length).toBeGreaterThanOrEqual(1);
    expectExplained(steps, prefixSumCode);
  });
});

describe('wording for edge cases', () => {
  it('does not overstate the saving when only one pair exists', () => {
    expect(twoPointersSteps([3, 3], 6).at(-1)!.why).not.toMatch(/far more/);
    expect(twoPointersSteps([1, 3, 4, 6, 8, 11], 14).at(-1)!.why).toMatch(/far more/);
  });

  it('describes a window of one value without nonsense', () => {
    const first = slidingWindowSteps([4, 2, 9], 1)[0]!;
    expect(first.title).not.toMatch(/1 neighbouring values/);
    expect(first.why).not.toMatch(/share 0/);
  });

  it('writes negative values in brackets inside the arithmetic', () => {
    const slide = slidingWindowSteps([-5, -7, -3], 2).find((s) => s.title.startsWith('Slide'))!;
    expect(slide.title).toBe('Slide right: add (-3), drop (-5)');
    expect(slide.why).toContain('(-12) + (-3) − (-5) = (-10)');
  });

  it('shows the guard for a window that does not fit in the displayed code', () => {
    const lines = slidingWindowCode.split('\n');
    const guard = lines.findIndex((line) => line.includes('k > arr.length')) + 1;
    expect(guard).toBeGreaterThan(0);
    expect(slidingWindowSteps([1, 2, 3], 9)[0]!.codeLine).toBe(guard);
  });
});
