import { describe, expect, it } from 'vitest';
import { COMPLEXITIES, curveForNotation, formatOps } from './complexities';

describe('COMPLEXITIES', () => {
  it('lists the six classes in order of growth', () => {
    expect(COMPLEXITIES.map((c) => c.label)).toEqual(['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)']);
  });

  it('computes operation counts', () => {
    expect(COMPLEXITIES.map((c) => c.fn(16))).toEqual([1, 4, 16, 64, 256, 65536]);
  });

  it('never drops below one operation', () => {
    expect(COMPLEXITIES.every((c) => c.fn(1) >= 1)).toBe(true);
  });
});

describe('formatOps', () => {
  it('formats counts for reading', () => {
    expect(formatOps(1234)).toBe('1,234');
    expect(formatOps(6.64)).toBe('7');
    expect(formatOps(2 ** 40)).toBe('1.1e+12');
    expect(formatOps(Infinity)).toBe('∞');
  });
});

describe('curveForNotation', () => {
  it('maps complexity strings from lessons to a curve', () => {
    expect(curveForNotation('O(log n)')?.id).toBe('log');
    expect(curveForNotation('O(n²)')?.id).toBe('n2');
    expect(curveForNotation('O(V + E)')?.id).toBe('n');
    expect(curveForNotation('O(V²)')?.id).toBe('n2');
    expect(curveForNotation('O(something else)')).toBeUndefined();
  });
});
