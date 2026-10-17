import { describe, expect, it } from 'vitest';
import type { View } from '../types/visualization';
import { readInt, readInts, readText, refusal } from './form';

const range = { min: 0, max: 12 };

describe('readInt', () => {
  it('reads a whole number, ignoring surrounding spaces', () => {
    expect(readInt({ n: '6' }, 'n', 'n', range)).toEqual({ ok: true, value: 6 });
    expect(readInt({ n: ' 7 ' }, 'n', 'n', range)).toEqual({ ok: true, value: 7 });
  });

  it.each(['', 'abc', '3.5', '-1', '13'])('rejects %j and names the field and range', (text) => {
    const result = readInt({ n: text }, 'n', 'n', range);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.why).toContain('n');
      expect(result.why).toContain('0 to 12');
    }
  });

  it('rejects a missing field', () => {
    expect(readInt({}, 'n', 'n', range).ok).toBe(false);
  });
});

describe('readInts', () => {
  const count = { min: 1, max: 3 };
  const values = { min: 1, max: 20 };

  it('reads a comma-separated list', () => {
    expect(readInts({ w: '1, 3,4' }, 'w', 'Weights', count, values)).toEqual({ ok: true, value: [1, 3, 4] });
  });

  it.each(['', '1, 2, 3, 4', '1, 21', '1, x'])('rejects %j', (text) => {
    expect(readInts({ w: text }, 'w', 'Weights', count, values).ok).toBe(false);
  });
});

describe('readText', () => {
  const length = { min: 1, max: 8 };

  it('accepts spaces inside the text', () => {
    expect(readText({ t: 'AB CD' }, 't', 'Text', length)).toEqual({ ok: true, value: 'AB CD' });
  });

  it.each(['', 'ABCDEFGHI', 'A😀'])('rejects %j', (text) => {
    expect(readText({ t: text }, 't', 'Text', length).ok).toBe(false);
  });
});

describe('refusal', () => {
  it('is a single step pointing at the first code line', () => {
    const view: View = { kind: 'grid', rows: [] };
    const steps = refusal('Bad', 'because', view);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ title: 'Bad', why: 'because', codeLine: 1, view });
  });
});
