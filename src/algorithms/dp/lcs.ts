import type { Step } from '../../types/visualization';
import { readText, refusal } from '../form';
import { at, tableGrid, type Mark } from './table';

export const lcsCode = `function lcs(a: string, b: string): string {
  const dp = table(a.length + 1, b.length + 1, 0); // dp[i][j]: LCS length of a[0..i) and b[0..j)
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1; // match: extend diagonally
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); // drop a character from one string
    }
  }
  return traceBack(dp, a, b); // walk back from dp[a.length][b.length]
}`;

const LINE = { init: 2, match: 5, skip: 6, trace: 9 };

function fill(a: string, b: string): number[][] {
  const dp = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  return dp;
}

/** The cells walked from the bottom-right corner; ties go up before left. */
function walk(dp: number[][], a: string, b: string): { path: [number, number][]; matches: [number, number][]; result: string } {
  const path: [number, number][] = [];
  const matches: [number, number][] = [];
  let result = '';
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    path.push([i, j]);
    if (a[i - 1] === b[j - 1]) {
      matches.push([i, j]);
      result = a[i - 1] + result;
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) i--;
    else j--;
  }
  path.push([i, j]);
  return { path, matches, result };
}

export function lcs(a: string, b: string): string {
  return walk(fill(a, b), a, b).result;
}

export function lcsSteps(input: Record<string, string>): Step[] {
  const empty = tableGrid([]);
  const aRead = readText(input, 'a', 'First string', { min: 1, max: 8 });
  if (!aRead.ok) return refusal('Check the first string', aRead.why, empty);
  const bRead = readText(input, 'b', 'Second string', { min: 1, max: 8 });
  if (!bRead.ok) return refusal('Check the second string', bRead.why, empty);
  const a = aRead.value;
  const b = bRead.value;

  const dp = fill(a, b);
  const shown: (number | undefined)[][] = dp.map((row, i) => row.map((v, j) => (i === 0 || j === 0 ? v : undefined)));
  const grid = (marks: Mark = {}, arrows: { from: [number, number]; to: [number, number] }[] = []) =>
    tableGrid(shown, { rowLabels: ['', ...a], colLabels: ['', ...b], marks, arrows });

  const steps: Step[] = [
    {
      title: 'The empty prefix has an LCS of length 0',
      why: `dp[i][j] is the length of the longest common subsequence of the first i characters of "${a}" and the first j of "${b}". With an empty string on either side there is nothing in common, so the first row and column are 0.`,
      next: 'Fill the table row by row.',
      codeLine: LINE.init,
      view: grid(),
    },
  ];

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      shown[i]![j] = dp[i]![j];
      const ca = a[i - 1]!;
      const cb = b[j - 1]!;
      if (ca === cb) {
        steps.push({
          title: `${ca} = ${cb}: dp[${i}][${j}] = ${dp[i]![j]}`,
          why: `The characters match, so this ${ca} extends the best subsequence of the shorter prefixes: dp[${i - 1}][${j - 1}] + 1 = ${dp[i]![j]}.`,
          codeLine: LINE.match,
          variables: { i, j },
          view: grid({ [at(i, j)]: 'found', [at(i - 1, j - 1)]: 'compare' }, [{ from: [i - 1, j - 1], to: [i, j] }]),
        });
      } else {
        const up = dp[i - 1]![j]!;
        const left = dp[i]![j - 1]!;
        const from: [number, number] = up >= left ? [i - 1, j] : [i, j - 1];
        steps.push({
          title: `${ca} ≠ ${cb}: dp[${i}][${j}] = ${dp[i]![j]}`,
          why: `No match, so one of the two characters is not used. Drop ${ca} (above: ${up}) or drop ${cb} (left: ${left}) and keep the better.`,
          codeLine: LINE.skip,
          variables: { i, j, up, left },
          view: grid({ [at(i, j)]: 'active', [at(i - 1, j)]: 'compare', [at(i, j - 1)]: 'compare' }, [{ from, to: [i, j] }]),
        });
      }
    }
  }

  const { path, matches, result } = walk(dp, a, b);
  const marks: Mark = Object.fromEntries(path.map(([i, j]) => [at(i, j), 'active']));
  for (const [i, j] of matches) marks[at(i, j)] = 'found';
  steps.push({
    title: result === '' ? 'The longest common subsequence is empty' : `LCS: "${result}" (length ${result.length})`,
    why:
      result === ''
        ? `"${a}" and "${b}" share no character, so every cell is 0.`
        : `Walk back from the bottom-right cell. At a match, take the character and move diagonally; otherwise move toward the larger neighbour. The diagonal moves spell "${result}".`,
    codeLine: LINE.trace,
    variables: { length: result.length },
    view: grid(marks),
  });
  return steps;
}
