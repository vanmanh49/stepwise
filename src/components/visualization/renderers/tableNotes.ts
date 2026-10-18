import type { SqlTable } from '../../../types/visualization';

/** The constraint badges to show under a table's column names, or undefined when there are none. */
export function notesRow(table: SqlTable): string[] | undefined {
  const notes = table.columnNotes;
  if (!notes || notes.every((n) => n === '')) return undefined;
  return table.columns.map((_, i) => notes[i] ?? '');
}
