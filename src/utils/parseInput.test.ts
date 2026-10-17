import { describe, expect, it } from 'vitest';
import { parseNumberList, parseText, randomArray } from './parseInput';

const limits = { min: 2, max: 12 };

describe('parseNumberList', () => {
  it('parses comma-separated integers', () => {
    expect(parseNumberList('5, 2,8 ,1', limits)).toEqual({ ok: true, values: [5, 2, 8, 1] });
  });

  it('tolerates spaces, trailing commas and negatives', () => {
    expect(parseNumberList(' 3 -1, 4, ', limits)).toEqual({ ok: true, values: [3, -1, 4] });
  });

  it.each([
    ['empty input', ''],
    ['letters', 'a, b'],
    ['decimals', '1.5, 2'],
    ['too few values', '5'],
    ['too many values', Array.from({ length: 13 }, (_, i) => i).join(',')],
    ['out-of-range values', '1000, 2'],
  ])('rejects %s with a message', (_label, text) => {
    const result = parseNumberList(text, limits);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('parseText', () => {
  it('accepts short text, including spaces', () => {
    expect(parseText('LEVEL')).toEqual({ ok: true, value: 'LEVEL' });
    expect(parseText('a b')).toEqual({ ok: true, value: 'a b' });
  });

  it.each([
    ['empty text', ''],
    ['text longer than 12 characters', 'ABCDEFGHIJKLM'],
    ['emoji', 'hi😀'],
  ])('rejects %s with a message', (_label, text) => {
    const result = parseText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

describe('randomArray', () => {
  it('returns the requested number of integers within range', () => {
    const values = randomArray(8, 50);
    expect(values).toHaveLength(8);
    expect(values.every((v) => Number.isInteger(v) && v >= 1 && v <= 50)).toBe(true);
  });

  it('can include zero and negative values', () => {
    const values = Array.from({ length: 50 }, () => randomArray(8, 20, -20)).flat();
    expect(values.every((v) => Number.isInteger(v) && v >= -20 && v <= 20)).toBe(true);
    expect(values.some((v) => v < 0)).toBe(true);
  });
});
