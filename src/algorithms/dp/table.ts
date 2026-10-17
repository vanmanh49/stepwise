import type { GridView, Role } from '../../types/visualization';

export type Mark = Record<string, Role>;
export const at = (r: number, c: number) => `${r},${c}`;

/**
 * A DP table as a grid. Unfilled cells (undefined) show "—"; callers turn
 * Infinity into "∞" before passing values in, so raw JavaScript values never reach the screen.
 */
export function tableGrid(
  cells: (number | string | undefined)[][],
  options: { rowLabels?: string[]; colLabels?: string[]; marks?: Mark; arrows?: GridView['arrows'] } = {},
): GridView {
  const { rowLabels, colLabels, marks = {}, arrows = [] } = options;
  return {
    kind: 'grid',
    ...(colLabels && { colLabels }),
    rows: cells.map((row, r) => ({
      ...(rowLabels?.[r] !== undefined && { label: rowLabels[r] }),
      cells: row.map((value, c) => ({ id: `d${r}-${c}`, value: value ?? '—', role: marks[at(r, c)] ?? 'default' })),
    })),
    ...(arrows.length > 0 && { arrows }),
  };
}
