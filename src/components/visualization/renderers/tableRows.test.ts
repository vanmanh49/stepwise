import { describe, expect, it } from 'vitest';
import type { SqlRow } from '../../../types/visualization';
import { MAX_VISIBLE_ROWS, visibleRows } from './tableRows';

const rows = (n: number): SqlRow[] => Array.from({ length: n }, (_, i) => ({ id: String(i), cells: [i], role: 'default' }));

describe('visibleRows', () => {
  it('shows every row of a small table', () => {
    expect(visibleRows(rows(5))).toEqual({ shown: rows(5), hidden: 0 });
  });

  it('caps a large table and counts the rest', () => {
    const { shown, hidden } = visibleRows(rows(MAX_VISIBLE_ROWS + 30));
    expect(shown).toHaveLength(MAX_VISIBLE_ROWS);
    expect(hidden).toBe(30);
  });

  it('still caps a result where every row is marked', () => {
    const all = rows(MAX_VISIBLE_ROWS + 30).map((r) => ({ ...r, role: 'found' as const }));
    expect(visibleRows(all).shown).toHaveLength(MAX_VISIBLE_ROWS);
  });

  it('keeps the row being checked visible even past the cap', () => {
    const all = rows(MAX_VISIBLE_ROWS + 30);
    all[MAX_VISIBLE_ROWS + 10] = { ...all[MAX_VISIBLE_ROWS + 10]!, role: 'active' };
    const { shown, hidden } = visibleRows(all);
    expect(shown.at(-1)!.role).toBe('active');
    expect(hidden).toBe(29);
  });
});
