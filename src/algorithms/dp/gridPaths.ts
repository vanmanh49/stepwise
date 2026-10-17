import type { Step } from '../../types/visualization';
import { readInt, refusal } from '../form';
import { at, tableGrid, type Mark } from './table';

export const gridPathsCode = `function uniquePaths(rows: number, cols: number, blocked: Set<string>): number {
  const dp = table(rows, cols, 0); // dp[r][c]: ways to reach (r, c) moving only right or down
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (blocked.has(\`\${r},\${c}\`)) dp[r][c] = 0; // nobody can stand here
      else if (r === 0 && c === 0) dp[r][c] = 1; // the start
      else dp[r][c] = (r > 0 ? dp[r - 1][c] : 0) + (c > 0 ? dp[r][c - 1] : 0); // from above + from the left
    }
  }
  return dp[rows - 1][cols - 1];
}`;

const LINE = { init: 2, blocked: 5, start: 6, fill: 7, done: 10 };
const WALL = '■';

/** A wall down the middle column that leaves the bottom row open; never covers the start or the goal. */
export const WALL_PRESET = (rows: number, cols: number): [number, number][] => {
  const c = Math.floor(cols / 2);
  if (cols < 2 || c === 0) return [];
  return Array.from({ length: rows - 1 }, (_, r) => [r, c] as [number, number]);
};

function fill(rows: number, cols: number, blocked: [number, number][]): number[][] {
  const isBlocked = new Set(blocked.map(([r, c]) => at(r, c)));
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlocked.has(at(r, c))) dp[r]![c] = 0;
      else if (r === 0 && c === 0) dp[r]![c] = 1;
      else dp[r]![c] = (r > 0 ? dp[r - 1]![c]! : 0) + (c > 0 ? dp[r]![c - 1]! : 0);
    }
  }
  return dp;
}

export function gridPaths(rows: number, cols: number, blocked: [number, number][]): number {
  return fill(rows, cols, blocked)[rows - 1]![cols - 1]!;
}

export function gridPathsStepsFor(rows: number, cols: number, blocked: [number, number][]): Step[] {
  const isBlocked = new Set(blocked.map(([r, c]) => at(r, c)));
  const dp = fill(rows, cols, blocked);
  const shown: (number | string | undefined)[][] = dp.map((row, r) => row.map((_, c) => (isBlocked.has(at(r, c)) ? WALL : undefined)));
  const wallMarks: Mark = Object.fromEntries(blocked.map(([r, c]) => [at(r, c), 'discarded']));
  const grid = (marks: Mark = {}, arrows: { from: [number, number]; to: [number, number] }[] = []) =>
    tableGrid(shown, {
      rowLabels: Array.from({ length: rows }, (_, r) => `row ${r}`),
      colLabels: Array.from({ length: cols }, (_, c) => String(c)),
      marks: { ...wallMarks, ...marks },
      arrows,
    });

  const steps: Step[] = [
    {
      title: `Count the paths across a ${rows} × ${cols} grid`,
      why: `A path starts in the top-left corner and may only move right or down until it reaches the bottom-right corner${blocked.length > 0 ? `, never stepping on a blocked square (${WALL})` : ''}. dp[r][c] will hold the number of ways to reach square (r, c).`,
      next: 'Fill the squares row by row.',
      codeLine: LINE.init,
      variables: { rows, cols },
      view: grid(),
    },
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlocked.has(at(r, c))) {
        if (r === 0 && c === 0) {
          steps.push({ title: 'The start is blocked', why: 'No path can begin on a blocked square, so 0 ways lead anywhere.', codeLine: LINE.blocked, view: grid({ [at(r, c)]: 'discarded' }) });
        }
        continue;
      }
      shown[r]![c] = dp[r]![c];
      if (r === 0 && c === 0) {
        steps.push({
          title: 'One way to be at the start',
          why: 'Standing still is the only way to "reach" the starting square, so dp[0][0] = 1.',
          codeLine: LINE.start,
          view: grid({ [at(0, 0)]: 'active' }),
        });
        continue;
      }
      const sources: [number, number][] = [];
      if (r > 0 && !isBlocked.has(at(r - 1, c))) sources.push([r - 1, c]);
      if (c > 0 && !isBlocked.has(at(r, c - 1))) sources.push([r, c - 1]);
      const marks: Mark = { [at(r, c)]: 'active' };
      for (const [sr, sc] of sources) marks[at(sr, sc)] = 'compare';
      const above = r > 0 ? (isBlocked.has(at(r - 1, c)) ? `blocked above` : `${dp[r - 1]![c]} from above`) : 'nothing above';
      const left = c > 0 ? (isBlocked.has(at(r, c - 1)) ? `blocked on the left` : `${dp[r]![c - 1]} from the left`) : 'nothing on the left';
      steps.push({
        title: `dp[${r}][${c}] = ${dp[r]![c]}`,
        why: `The last move into (${r}, ${c}) came either down from above or right from the left: ${above}, ${left}. Add them.`,
        codeLine: LINE.fill,
        variables: { r, c, 'dp[r][c]': dp[r]![c]! },
        view: grid(marks, sources.map(([sr, sc]) => ({ from: [sr, sc] as [number, number], to: [r, c] as [number, number] }))),
      });
    }
  }

  const answer = dp[rows - 1]![cols - 1]!;
  steps.push({
    title: answer === 0 ? 'No path exists' : `${answer} different path${answer === 1 ? '' : 's'}`,
    why:
      answer === 0
        ? 'Blocked squares cut the start off from the goal, so the bottom-right cell stays 0.'
        : `The bottom-right cell adds up every way of arriving there. Trying all paths one by one would take far longer: their number grows exponentially with the grid size, while the table needs just ${rows * cols} cells.`,
    codeLine: LINE.done,
    variables: { paths: answer },
    view: grid({ [at(rows - 1, cols - 1)]: answer === 0 ? 'discarded' : 'found' }),
  });
  return steps;
}

export function gridPathsSteps(values: Record<string, string>): Step[] {
  const empty = tableGrid([]);
  const rowsRead = readInt(values, 'rows', 'Rows', { min: 1, max: 6 });
  if (!rowsRead.ok) return refusal('Check the rows', rowsRead.why, empty);
  const colsRead = readInt(values, 'cols', 'Columns', { min: 1, max: 6 });
  if (!colsRead.ok) return refusal('Check the columns', colsRead.why, empty);
  const blocked = values['blocked'];
  if (blocked !== 'none' && blocked !== 'wall') return refusal('Choose the blocked squares', 'Pick none or wall.', empty);
  const rows = rowsRead.value;
  const cols = colsRead.value;
  return gridPathsStepsFor(rows, cols, blocked === 'wall' ? WALL_PRESET(rows, cols) : []);
}
