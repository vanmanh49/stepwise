import { describe, expect, it } from 'vitest';
import { Value } from './autograd';
import { cosine, layerNorm, softmax } from './tensor';

describe('tensor helpers', () => {
  it('keeps softmax finite and summing to 1 for huge logits', () => {
    const p = softmax([1000, 1000, 999]);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(Math.abs(p.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-12);
    expect(p[0]).toBe(p[1]);
  });

  it('gives masked (-Infinity) logits zero probability', () => {
    expect(softmax([0, -Infinity])).toEqual([1, 0]);
  });

  it('measures cosine similarity', () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([2, 2], [1, 1])).toBeCloseTo(1, 12);
  });

  it('normalises to mean 0 and variance 1', () => {
    const v = layerNorm([1, 2, 3]);
    const mean = v.reduce((a, b) => a + b, 0) / 3;
    expect(mean).toBeCloseTo(0, 12);
    expect(v.reduce((a, b) => a + (b - mean) ** 2, 0) / 3).toBeCloseTo(1, 4);
  });
});

describe('Value autograd', () => {
  const f = (a: number | Value, b: number | Value) => {
    const A = a instanceof Value ? a : new Value(a);
    const B = b instanceof Value ? b : new Value(b);
    return A.mul(B).exp().add(A.sub(B).relu()).log().div(B.pow(2));
  };

  it.each([
    [0.7, -1.3],
    [1.5, 0.4],
  ])('matches finite differences at a = %d, b = %d', (a, b) => {
    const A = new Value(a);
    const B = new Value(b);
    f(A, B).backward();
    const h = 1e-6;
    expect(A.grad).toBeCloseTo((f(a + h, b).data - f(a - h, b).data) / (2 * h), 5);
    expect(B.grad).toBeCloseTo((f(a, b + h).data - f(a, b - h).data) / (2 * h), 5);
  });

  it('runs backward on a deep chain without overflowing the stack', () => {
    const x = new Value(1);
    let y = x;
    for (let i = 0; i < 20_000; i++) y = y.add(1);
    y.backward();
    expect(x.grad).toBe(1);
  });
});
