import type { SqlRow } from '../../../types/visualization';

/** Rows drawn per table; a big intermediate join would otherwise mean thousands of animated rows. */
export const MAX_VISIBLE_ROWS = 100;

/** Marks the row a step is about, as opposed to roles that colour whole result sets. */
const isCurrent = (row: SqlRow) => row.role === 'active' || row.role === 'compare' || (row.focus?.length ?? 0) > 0;

/** The first rows of a table, plus the row being checked if it lies further down, and how many are left out. */
export function visibleRows(rows: SqlRow[]): { shown: SqlRow[]; hidden: number } {
  if (rows.length <= MAX_VISIBLE_ROWS) return { shown: rows, hidden: 0 };
  const shown = [...rows.slice(0, MAX_VISIBLE_ROWS), ...rows.slice(MAX_VISIBLE_ROWS).filter(isCurrent)];
  return { shown, hidden: rows.length - shown.length };
}
