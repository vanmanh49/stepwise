import type { Cell, GridView, PanelsView, Role, Step } from '../../types/visualization';
import { readInt, refusal } from '../form';
import { CallTree } from './callTree';

export const nQueensCode = `function solveNQueens(n: number): number[] | null {
  const cols: number[] = []; // cols[row] = column of the queen in that row
  const place = (row: number): boolean => {
    if (row === n) return true; // every row has a queen
    for (let col = 0; col < n; col++) {
      if (safe(cols, row, col)) {
        cols.push(col); // try it
        if (place(row + 1)) return true;
        cols.pop(); // dead end: undo and try the next column
      }
    }
    return false; // no column works in this row
  };
  return place(0) ? cols : null;
}`;

const LINE = { start: 2, done: 4, check: 6, place: 7, undo: 9, fail: 12 };
const QUEEN = '♛';

function safe(cols: number[], row: number, col: number): boolean {
  return cols.every((c, r) => c !== col && Math.abs(c - col) !== row - r);
}

export function solveNQueens(n: number): number[] | null {
  const cols: number[] = [];
  const place = (row: number): boolean => {
    if (row === n) return true;
    for (let col = 0; col < n; col++) {
      if (!safe(cols, row, col)) continue;
      cols.push(col);
      if (place(row + 1)) return true;
      cols.pop();
    }
    return false;
  };
  return place(0) ? cols : null;
}

function board(n: number, cols: number[], marks: Record<string, Role> = {}): GridView {
  return {
    kind: 'grid',
    colLabels: Array.from({ length: n }, (_, c) => String(c)),
    rows: Array.from({ length: n }, (_, r) => ({
      label: `row ${r}`,
      cells: Array.from({ length: n }, (_, c): Cell => {
        const queen = cols[r] === c;
        const mark = marks[`${r},${c}`];
        return { id: `r${r}c${c}`, value: queen ? QUEEN : mark === 'discarded' ? '×' : '', role: mark ?? (queen ? 'found' : 'default') };
      }),
    })),
  };
}

export function nQueensSteps(values: Record<string, string>): Step[] {
  const nRead = readInt(values, 'n', 'n', { min: 4, max: 6 });
  if (!nRead.ok) {
    return refusal('Check n', `${nRead.why} With fewer than 4 queens there is no interesting solution, and more makes the search too long to follow.`, board(4, []));
  }
  const n = nRead.value;
  const cols: number[] = [];
  const tree = new CallTree();
  const view = (marks: Record<string, Role> = {}): PanelsView => ({
    kind: 'panels',
    panels: [
      { label: 'Board', view: board(n, cols, marks) },
      { label: 'Calls to place(row)', view: tree.view() },
    ],
  });
  const steps: Step[] = [
    {
      title: `Place ${n} queens so none attack each other`,
      why: 'Queens attack along rows, columns and diagonals, so each row needs exactly one queen. Backtracking places them row by row, and when a row has no safe square it undoes the previous choice and tries the next one.',
      next: 'Try the squares of row 0 from left to right.',
      codeLine: LINE.start,
      view: view(),
    },
  ];

  const place = (row: number): boolean => {
    tree.call(`place(${row})`);
    if (row === n) {
      tree.finish('✓');
      steps.push({
        title: `All ${n} queens are placed`,
        why: 'Every row has a queen and no two attack each other. The search stops at this first solution.',
        codeLine: LINE.done,
        variables: { cols: `[${cols.join(', ')}]` },
        view: view(),
      });
      return true;
    }
    const attacked: number[] = [];
    for (let col = 0; col < n; col++) {
      if (!safe(cols, row, col)) {
        attacked.push(col);
        continue;
      }
      const skipped = Object.fromEntries(attacked.map((c) => [`${row},${c}`, 'discarded' as Role]));
      cols.push(col);
      steps.push({
        title: `Place a queen at row ${row}, column ${col}`,
        why: `${attacked.length > 0 ? `Column${attacked.length > 1 ? 's' : ''} ${attacked.join(', ')} ${attacked.length > 1 ? 'are' : 'is'} attacked by an earlier queen. ` : ''}Column ${col} is safe, so try a queen there and move on to the next row.`,
        codeLine: LINE.place,
        variables: { row, col },
        view: view({ ...skipped, [`${row},${col}`]: 'active' }),
      });
      if (place(row + 1)) {
        tree.finish('✓');
        return true;
      }
      cols.pop();
      attacked.push(col);
      steps.push({
        title: `Remove the queen from row ${row}, column ${col}`,
        why: `Every way of continuing from here hit a dead end, so this choice cannot be part of a solution. Undo it and try the next column of row ${row}.`,
        codeLine: LINE.undo,
        variables: { row, col },
        view: view({ [`${row},${col}`]: 'discarded' }),
      });
    }
    steps.push({
      title: `No safe square in row ${row}`,
      why: `Every column of row ${row} is attacked by the queens above. Report failure so the previous row can try something else.`,
      codeLine: LINE.fail,
      variables: { row },
      view: view(Object.fromEntries(Array.from({ length: n }, (_, c) => [`${row},${c}`, 'discarded' as Role]))),
    });
    tree.finish('✗', true);
    return false;
  };
  place(0);
  return steps;
}
