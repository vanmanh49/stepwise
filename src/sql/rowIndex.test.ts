import { describe, expect, it } from 'vitest';
import type { Row } from './execute';
import { rowIndex } from './steps';

const rows = (...ids: string[]): Row[] => ids.map((id) => ({ id, values: [] }));

describe('rowIndex', () => {
  it('finds each row where findIndex would', () => {
    const list = rows('r1', 'r2', 'r3+r1', 'r4');
    for (const row of list) expect(rowIndex(list, row.id)).toBe(list.findIndex((r) => r.id === row.id));
  });

  it('returns -1 for an id that is not there', () => {
    expect(rowIndex(rows('r1', 'r2'), 'r9')).toBe(-1);
    expect(rowIndex([], 'r1')).toBe(-1);
  });

  it('returns the first position when an id repeats', () => {
    expect(rowIndex(rows('a', 'b', 'a'), 'a')).toBe(0);
  });

  it('answers for each array separately', () => {
    const first = rows('a', 'b', 'c');
    const second = rows('c', 'b', 'a');
    expect(rowIndex(first, 'a')).toBe(0);
    expect(rowIndex(second, 'a')).toBe(2);
    expect(rowIndex(first, 'c')).toBe(2);
    expect(rowIndex(second, 'c')).toBe(0);
  });
});
