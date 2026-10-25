import { describe, expect, it } from 'vitest';
import { seeded } from '../utils/random';
import { draw, reshape } from './sample';
import { softmax } from './tensor';

const L = [2, 1, 0.5, 0.5, -1];
const none = { temperature: 1, topK: 5, topP: 1 };
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe('reshape', () => {
  it('top-k 2 cuts every id after the two most likely', () => {
    expect(reshape(L, { ...none, topK: 2 }).topKCut.toSorted()).toEqual([2, 3, 4]);
  });

  it('top-p keeps the smallest set of most likely ids that reaches p', () => {
    const p = softmax(L);
    let kept = 0;
    for (let total = 0; total < 0.75; kept++) total += p[kept]!;
    const r = reshape(L, { ...none, topP: 0.75 });
    expect(r.topPCut).toHaveLength(5 - kept);
    expect(r.final.filter((x) => x > 0)).toHaveLength(kept);
  });

  it('cuts nothing with top-k = all and top-p = 1', () => {
    const r = reshape(L, none);
    expect([...r.topKCut, ...r.topPCut]).toEqual([]);
    expect(r.final).toEqual(r.scaled);
  });

  it('renormalises what is left', () => {
    expect(sum(reshape(L, { temperature: 1.5, topK: 3, topP: 0.9 }).final)).toBeCloseTo(1, 12);
  });

  it('sharpens at low temperature and flattens at high temperature', () => {
    expect(reshape(L, { ...none, temperature: 0.1 }).scaled[0]).toBeGreaterThan(0.99);
    expect(Math.max(...reshape(L, { ...none, temperature: 2 }).scaled)).toBeLessThan(Math.max(...softmax(L)));
  });

  it('stays finite for huge logits at temperature 0.1', () => {
    const r = reshape([1000, 999, 0], { ...none, topK: 3, temperature: 0.1 });
    expect(r.final.every(Number.isFinite)).toBe(true);
    expect(sum(r.final)).toBeCloseTo(1, 12);
  });

  it('orders ids by probability, ties to the lower id', () => {
    expect(reshape(L, none).order).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('draw', () => {
  it('repeats for the same seed', () => {
    const { final } = reshape(L, none);
    expect(draw(final, seeded(3))).toBe(draw(final, seeded(3)));
  });

  it('only draws ids with probability', () => {
    expect(draw([0, 1, 0], seeded(1))).toBe(1);
  });

  it('draws each id about as often as its probability', () => {
    const rng = seeded(9);
    const counts = [0, 0, 0];
    for (let i = 0; i < 2000; i++) counts[draw([0.5, 0.3, 0.2], rng)]!++;
    [0.5, 0.3, 0.2].forEach((p, i) => expect(Math.abs(counts[i]! / 2000 - p)).toBeLessThan(0.05));
  });
});
