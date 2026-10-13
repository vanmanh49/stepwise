import type { ArrayView, Cell, Role } from '../../types/visualization';

/** Ids follow the original position so a value can be tracked as it moves. */
export function toCells(values: number[]): Cell[] {
  return values.map((value, i) => ({ id: `c${i}`, value, role: 'default' }));
}

export function withRoles(cells: Cell[], roles: Record<number, Role>, sortedIdx: Iterable<number> = []): Cell[] {
  const sorted = new Set(sortedIdx);
  return cells.map((cell, i) => ({ ...cell, role: roles[i] ?? (sorted.has(i) ? 'sorted' : 'default') }));
}

export function val(cells: Cell[], i: number): number {
  return cells[i]!.value as number;
}

export function swapCells(cells: Cell[], i: number, j: number): void {
  const tmp = cells[i]!;
  cells[i] = cells[j]!;
  cells[j] = tmp;
}

export function arrayView(
  cells: Cell[],
  roles: Record<number, Role> = {},
  sortedIdx: Iterable<number> = [],
  pointers?: Record<string, number>,
): ArrayView {
  return { kind: 'array', cells: withRoles(cells, roles, sortedIdx), ...(pointers && { pointers }) };
}

export const allIndices = (cells: Cell[]) => cells.map((_, i) => i);
