import { describe, expect, it } from 'vitest';
import type { SqlTable } from '../../../types/visualization';
import { notesRow } from './tableNotes';

const table = (columnNotes?: string[]): SqlTable => ({ label: 't', columns: ['a', 'b', 'c'], rows: [], ...(columnNotes && { columnNotes }) });

describe('notesRow', () => {
  it('is absent when no column has a note', () => {
    expect(notesRow(table())).toBeUndefined();
    expect(notesRow(table(['', '', '']))).toBeUndefined();
  });

  it('pads the notes to the number of columns', () => {
    expect(notesRow(table(['PK', 'NOT NULL']))).toEqual(['PK', 'NOT NULL', '']);
  });
});
