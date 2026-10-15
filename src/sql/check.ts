import type { Dataset } from './datasets';
import type { SqlError } from './errors';
import { runQuery } from './execute';
import { valueKey, type SqlValue } from './values';

export type CheckResult =
  | { status: 'correct' }
  | { status: 'error'; error: SqlError }
  | { status: 'columns'; expected: number; actual: number }
  | { status: 'rows'; missing: number; extra: number }
  | { status: 'order' };

const rowKey = (row: SqlValue[]) => row.map(valueKey).join('|');

function counts(keys: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const key of keys) map.set(key, (map.get(key) ?? 0) + 1);
  return map;
}

/** Rows of `a` not matched by a row of `b`, counting duplicates. */
function surplus(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  for (const [key, n] of a) total += Math.max(0, n - (b.get(key) ?? 0));
  return total;
}

/**
 * Compares the learner's query with the exercise's solution by result: column count, then rows
 * as a multiset, then order when it matters. Column names are ignored. Throws if the solution fails,
 * which is a bug in the lesson.
 */
export function checkExercise(db: Dataset, query: string, exercise: { solution: string; orderMatters: boolean }): CheckResult {
  const expected = runQuery(db, exercise.solution);
  if (!expected.ok) throw new Error(`Exercise solution fails: ${expected.error.message}`);
  const actual = runQuery(db, query);
  if (!actual.ok) return { status: 'error', error: actual.error };

  const want = expected.result;
  const got = actual.result;
  if (want.columns.length !== got.columns.length) {
    return { status: 'columns', expected: want.columns.length, actual: got.columns.length };
  }
  const wantKeys = want.rows.map(rowKey);
  const gotKeys = got.rows.map(rowKey);
  const missing = surplus(counts(wantKeys), counts(gotKeys));
  const extra = surplus(counts(gotKeys), counts(wantKeys));
  if (missing > 0 || extra > 0) return { status: 'rows', missing, extra };
  if (exercise.orderMatters && wantKeys.some((key, i) => key !== gotKeys[i])) return { status: 'order' };
  return { status: 'correct' };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function describeCheck(result: CheckResult): string {
  switch (result.status) {
    case 'correct':
      return 'Correct!';
    case 'error':
      return `${result.error.message} (line ${result.error.line}, col ${result.error.column})`;
    case 'columns':
      return `Expected ${count(result.expected, 'column')}, got ${result.actual}.`;
    case 'rows': {
      const parts = [
        ...(result.missing > 0 ? [`${count(result.missing, 'row')} missing`] : []),
        ...(result.extra > 0 ? [`${result.extra} extra ${result.extra === 1 ? 'row' : 'rows'}`] : []),
      ];
      return `${parts.join(', ')}.`;
    }
    case 'order':
      return 'Right rows, wrong order.';
  }
}
