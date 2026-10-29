import type { CSSProperties } from 'react';
import type { GridCell, GridView, Role } from '../../../types/visualization';
import { roleBoxStyle } from '../roles';

/**
 * Role styling for cells rendered as motion elements. Motion keeps the last value of a
 * style key that disappears, so boxShadow is always set, or an old ring would stick.
 */
export function gridCellStyle(role: Role): CSSProperties {
  return { boxShadow: 'none', ...roleBoxStyle(role) };
}

/**
 * Shades a default-role cell by its heat (0–1), mixing up to 60% accent into the surface.
 * The text keeps --text: the 60% cap keeps it above 4.5:1 contrast in both themes.
 */
export function heatStyle(cell: GridCell): CSSProperties {
  if (cell.heat === undefined || cell.role !== 'default') return {};
  return { background: `color-mix(in oklab, var(--accent) ${Math.round(cell.heat * 60)}%, var(--surface))`, color: 'var(--text)' };
}

/** Values up to this length fit a fixed square cell. */
const CELL_CHARS = 6;

/** A grid of text (messages, sentences) is drawn as a wrapping table; arrows need the fixed square cells. */
export function isTextGrid(view: GridView): boolean {
  if (view.arrows && view.arrows.length > 0) return false;
  return view.rows.some((r) => r.cells.some((c) => c !== null && String(c.value).length > CELL_CHARS));
}
