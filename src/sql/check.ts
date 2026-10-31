import type { Dataset } from './datasets';
import { SqlError, type ConstraintInfo } from './errors';
import { runQuery, type QueryResult } from './execute';
import { parseScript } from './parse';
import { runScript } from './script';
import { isSessionsScript } from './sessions';
import { valueKey, type SqlValue } from './values';

/** What a probe did: returned rows (none for a write that succeeded), broke a constraint, or failed otherwise. */
type ProbeOutcome =
  /** `plan` marks EXPLAIN QUERY PLAN rows, which compare more loosely (see samePlan). */
  | { kind: 'rows'; columns: number; keys: string[]; plan?: boolean }
  | { kind: 'constraint'; rule: ConstraintInfo['rule']; table: string }
  | { kind: 'error'; message: string };

export type CheckResult =
  | { status: 'correct' }
  | { status: 'error'; error: SqlError }
  | { status: 'columns'; expected: number; actual: number }
  | { status: 'rows'; missing: number; extra: number }
  | { status: 'order' }
  | { status: 'probe'; index: number; probe: string; expected: ProbeOutcome; actual: ProbeOutcome };

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
 * Runs `script` on a fresh copy of `db`, then each probe on its own copy of the result.
 * Returns the script's error when the script itself fails.
 */
export function probeOutcomes(db: Dataset, script: string, probes: string[]): ProbeOutcome[] | SqlError {
  const base = script.trim() === '' ? { ok: true as const, db } : runScript(db, script);
  if (!base.ok) return base.error;
  return probes.map((probe): ProbeOutcome => {
    const run = runScript(base.db, probe);
    if (!run.ok) {
      const { error } = run;
      return error.constraint ? { kind: 'constraint', rule: error.constraint.rule, table: error.constraint.table.toLowerCase() } : { kind: 'error', message: error.message };
    }
    const last = run.statements.at(-1)!;
    if (!last.result) return { kind: 'rows', columns: 0, keys: [] };
    // A plan names the index it uses; any name the learner chose is as good as the solution's.
    const rows = last.kind === 'explain' ? last.result.rows.map((row) => row.map((v) => (typeof v === 'string' ? v.replace(/INDEX \S+/, 'INDEX ?') : v))) : last.result.rows;
    return { kind: 'rows', columns: last.result.columns.length, keys: rows.map(rowKey), ...(last.kind === 'explain' && { plan: true }) };
  });
}

/** PRIMARY KEY and UNIQUE refuse a duplicate in the same way, so either answers a "no repeats" probe. */
const sameRule = (a: ConstraintInfo['rule'], b: ConstraintInfo['rule']) => {
  const duplicate = (rule: ConstraintInfo['rule']) => rule === 'PRIMARY KEY' || rule === 'UNIQUE';
  return a === b || (duplicate(a) && duplicate(b));
};

/**
 * Plans match line by line, except that a covering index is as good as a plain one: it answers
 * the query without reading the table. A COVERING INDEX the solution needs must still be there.
 */
function samePlan(expected: string[], actual: string[]): boolean {
  const plain = (k: string) => k.replace('COVERING INDEX', 'INDEX');
  return expected.length === actual.length && expected.every((e, i) => plain(e) === plain(actual[i]!) && (!e.includes('COVERING') || actual[i]!.includes('COVERING')));
}

function sameOutcome(a: ProbeOutcome, b: ProbeOutcome, orderMatters: boolean): boolean {
  if (a.kind === 'rows' && b.kind === 'rows' && a.plan && b.plan) return samePlan(a.keys, b.keys);
  if (a.kind === 'rows' && b.kind === 'rows') {
    if (a.columns !== b.columns || a.keys.length !== b.keys.length) return false;
    if (orderMatters) return a.keys.every((k, i) => k === b.keys[i]);
    return surplus(counts(a.keys), counts(b.keys)) === 0;
  }
  if (a.kind === 'constraint' && b.kind === 'constraint') return sameRule(a.rule, b.rule) && a.table === b.table;
  if (a.kind === 'error' && b.kind === 'error') return a.message === b.message;
  return false;
}

/**
 * The rows a query returns. A two-session script returns the rows of its last SELECT that ran,
 * so an exercise can ask what a session ends up seeing.
 */
function finalResult(db: Dataset, sql: string): { ok: true; result: QueryResult } | { ok: false; error: SqlError } {
  const parsed = parseScript(sql);
  if (!parsed.ok || !isSessionsScript(parsed.statements)) return runQuery(db, sql);
  const run = runScript(db, sql);
  if (!run.ok) return run;
  // What each SELECT read, in script order, then the data both sessions left behind: one line each.
  const reads = run.statements.flatMap((st, i) => (st.kind === 'select' && st.result && !st.error ? [`read ${i + 1}: ${st.result.rows.map(rowKey).join(' / ')}`] : []));
  const tables = run.db.tables.map((t) => `${t.name}: ${t.rows.map((r) => r.map(valueKey).join('|')).join(' / ')}`);
  return { ok: true, result: { columns: ['outcome'], rows: [...reads, ...tables].map((line) => [line]) } };
}

/**
 * Compares the learner's query with the exercise's solution by result: column count, then rows
 * as a multiset, then order when it matters. Column names are ignored. Throws if the solution fails,
 * which is a bug in the lesson.
 */
export function checkExercise(db: Dataset, query: string, exercise: { solution: string; orderMatters: boolean; probes?: string[] }): CheckResult {
  if (exercise.probes) {
    const expected = probeOutcomes(db, exercise.solution, exercise.probes);
    if (!Array.isArray(expected)) throw new Error(`Exercise solution fails: ${expected.message}`);
    const actual = probeOutcomes(db, query, exercise.probes);
    if (!Array.isArray(actual)) return { status: 'error', error: actual };
    const index = expected.findIndex((want, i) => !sameOutcome(want, actual[i]!, exercise.orderMatters));
    if (index < 0) return { status: 'correct' };
    return { status: 'probe', index, probe: exercise.probes[index]!, expected: expected[index]!, actual: actual[index]! };
  }
  const expected = finalResult(db, exercise.solution);
  if (!expected.ok) throw new Error(`Exercise solution fails: ${expected.error.message}`);
  const actual = finalResult(db, query);
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
    case 'probe': {
      const { probe, expected, actual } = result;
      if (expected.kind === 'constraint' && actual.kind === 'rows') {
        return `\`${probe}\` should fail (${expected.rule}), but your table accepted it.`;
      }
      if (expected.kind === 'rows' && actual.kind === 'constraint') {
        return `\`${probe}\` should succeed, but your table rejected it (${actual.rule} on ${actual.table}).`;
      }
      if (expected.kind === 'constraint' && actual.kind === 'constraint') {
        return `\`${probe}\` should fail with ${expected.rule}, but your table failed it with ${actual.rule}.`;
      }
      if (expected.kind === 'rows' && actual.kind === 'rows') {
        if (expected.columns !== actual.columns) {
          return `After your script, \`${probe}\` gives ${count(actual.columns, 'column')} instead of ${expected.columns}.`;
        }
        const differ = surplus(counts(expected.keys), counts(actual.keys)) + surplus(counts(actual.keys), counts(expected.keys));
        return differ > 0
          ? `After your script, \`${probe}\` gives ${count(differ, 'row')} that differ.`
          : `After your script, \`${probe}\` gives the right rows in the wrong order.`;
      }
      return `\`${probe}\` behaves differently after your script.`;
    }
    case 'order':
      return 'Right rows, wrong order.';
  }
}
