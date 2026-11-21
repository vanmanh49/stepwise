import { describe, expect, it } from 'vitest';
import { COMPLEXITIES, curveForNotation, formatOps, opsAt } from './complexities';

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

describe('opsAt', () => {
  it('counts the notations whose curve would understate them', () => {
    expect(opsAt('O(V³)', 50)).toBe(125_000);
    expect(opsAt('O(n!)', 5)).toBe(120);
    expect(opsAt('O(n!)', 100)).toBeGreaterThan(1e157);
  });

  it('gives no count when n alone does not decide it', () => {
    expect(opsAt('O(V × E²)', 50)).toBeUndefined();
  });

  it('uses the curve everywhere else', () => {
    expect(opsAt('O(n²)', 50)).toBe(2500);
    expect(opsAt('O(n log n)', 16)).toBe(64);
    expect(opsAt('O(something else)', 50)).toBeUndefined();
  });
});

describe('curveForNotation', () => {
  it('maps complexity strings from lessons to a curve', () => {
    expect(curveForNotation('O(log n)')?.id).toBe('log');
    expect(curveForNotation('O(n²)')?.id).toBe('n2');
    expect(curveForNotation('O(V + E)')?.id).toBe('n');
    expect(curveForNotation('O(V²)')?.id).toBe('n2');
    expect(curveForNotation('O(E log E)')?.id).toBe('nlogn');
    expect(curveForNotation('O(E log V)')?.id).toBe('nlogn');
    expect(curveForNotation('O(V × E)')?.id).toBe('n2');
    expect(curveForNotation('O(something else)')).toBeUndefined();
  });

  it('maps the notations of the newer algorithm lessons to the nearest curve', () => {
    expect(curveForNotation('O(n + k)')?.id).toBe('n');
    expect(curveForNotation('O(d × (n + 10))')?.id).toBe('n');
    expect(curveForNotation('O(n + m)')?.id).toBe('n');
    expect(curveForNotation('O(α(n))')?.id).toBe('1');
    expect(curveForNotation('O(V³)')?.id).toBe('n2');
    expect(curveForNotation('O(V × E²)')?.id).toBe('n2');
    expect(curveForNotation('O(n × C)')?.id).toBe('n2');
    expect(curveForNotation('O(n × amount)')?.id).toBe('n2');
    expect(curveForNotation('O(m × n)')?.id).toBe('n2');
    expect(curveForNotation('O(rows × cols)')?.id).toBe('n2');
    expect(curveForNotation('O(n!)')?.id).toBe('2n');
  });
});
