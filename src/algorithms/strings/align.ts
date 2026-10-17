import type { Cell, GridView, Role } from '../../types/visualization';

/**
 * The text on one row and the pattern on the row below, shifted so pattern[0]
 * sits under text[shift]. Pattern cells keep their ids, so they slide as the shift changes.
 */
export function alignGrid(
  text: string,
  pattern: string,
  shift: number,
  textRoles: Record<number, Role> = {},
  patternRoles: Record<number, Role> = {},
): GridView {
  const columns = Math.max(text.length, shift + pattern.length);
  const textCells: (Cell | null)[] = Array.from({ length: columns }, (_, i) =>
    i < text.length ? { id: `t${i}`, value: text[i]!, role: textRoles[i] ?? 'default' } : null,
  );
  const patternCells: (Cell | null)[] = Array.from({ length: columns }, (_, i) => {
    const k = i - shift;
    return k >= 0 && k < pattern.length ? { id: `p${k}`, value: pattern[k]!, role: patternRoles[k] ?? 'default' } : null;
  });
  return {
    kind: 'grid',
    colLabels: Array.from({ length: columns }, (_, i) => (i < text.length ? String(i) : '')),
    rows: [
      { label: 'text', cells: textCells },
      { label: 'pattern', cells: patternCells },
    ],
  };
}

export const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, k) => from + k);
export const paint = (indexes: number[], role: Role) => Object.fromEntries(indexes.map((i) => [i, role])) as Record<number, Role>;
