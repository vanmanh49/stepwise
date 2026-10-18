import type { Statement } from './ast';
import { cloneDataset, findTable, type Dataset } from './datasets';
import { asSqlError, ConstraintError, SqlError } from './errors';
import type { QueryResult, Relation } from './execute';
import { parseScript } from './parse';
import { isSessionsScript, runSessions } from './sessions';
import { executeStatement, relationOf, type Emit, type WriteEvent } from './write';

export interface StatementOutcome {
  kind: Statement['kind'];
  line: number;
  /** Rows written or removed; for a SELECT, rows returned. */
  affected: number;
  result?: QueryResult;
  /** Set when the statement failed inside a transaction: it was undone, and the script went on. */
  error?: SqlError;
}

export type ScriptResult =
  | { ok: true; db: Dataset; statements: StatementOutcome[] }
  /**
   * `db` holds the changes of the statements before the failing one. `failedIndex` is -1 when
   * the script could not be parsed, so nothing ran.
   */
  | { ok: false; error: SqlError; db: Dataset; statements: StatementOutcome[]; failedIndex: number };

/** Everything a statement or transaction can change, so it can be put back. */
type Snapshot = Pick<Dataset, 'tables' | 'indexes' | 'views'>;

const snapshotOf = (db: Dataset): Snapshot => structuredClone({ tables: db.tables, indexes: db.indexes, views: db.views });

function restore(db: Dataset, snapshot: Snapshot) {
  const copy = structuredClone(snapshot);
  db.tables = copy.tables;
  if (copy.indexes) db.indexes = copy.indexes;
  else delete db.indexes;
  if (copy.views) db.views = copy.views;
  else delete db.views;
}

/** One level of an open transaction: BEGIN (no name) or a SAVEPOINT. `changes` counts rows written since it. */
interface Frame {
  name?: string;
  snapshot: Snapshot;
  changes: number;
}

/** The tables whose rows differ from a snapshot, before and after. */
function changedTables(db: Dataset, snapshot: Snapshot): { name: string; before?: Relation; after?: Relation }[] {
  const names = new Set([...snapshot.tables.map((t) => t.name), ...db.tables.map((t) => t.name)]);
  return [...names].flatMap((name) => {
    const was = snapshot.tables.find((t) => t.name === name);
    const now = findTable(db, name);
    if (was && now && JSON.stringify([was.rows, was.rowIds]) === JSON.stringify([now.rows, now.rowIds])) return [];
    return [{ name, ...(was && { before: relationOf({ ...db, tables: snapshot.tables }, was) }), ...(now && { after: relationOf(db, now) }) }];
  });
}

/**
 * Runs a script on a fresh copy of `db`, one statement at a time. Outside a transaction it stops
 * at the first error, undoing the failing statement, as SQLite does. Inside BEGIN … COMMIT a
 * failing statement is undone on its own and the transaction stays open, so the script goes on.
 * A transaction still open at the end is rolled back. Never throws.
 */
export function runScript(db: Dataset, sql: string, emit?: Emit): ScriptResult {
  const work = cloneDataset(db);
  const parsed = parseScript(sql);
  if (!parsed.ok) return { ok: false, error: parsed.error, db: work, statements: [], failedIndex: -1 };
  if (isSessionsScript(parsed.statements)) return runSessions(work, parsed.statements, emit);
  const statements: StatementOutcome[] = [];
  const total = parsed.statements.length;
  const frames: Frame[] = [];
  const pending = () => frames.reduce((n, f) => n + f.changes, 0);
  const report = (action: TransactionEvent['action'], changes: number, since: Snapshot, name?: string) =>
    emit?.({ kind: 'transaction', action, ...(name && { name }), changes, tables: changedTables(work, since) });

  for (const [index, statement] of parsed.statements.entries()) {
    emit?.({ kind: 'statement-start', index, total, statement });
    const snapshot = snapshotOf(work);
    try {
      if (statement.kind === 'transaction') {
        transaction(statement, frames, work, report);
        statements.push({ kind: statement.kind, line: statement.line, affected: 0 });
        continue;
      }
      const { affected, result } = executeStatement(work, statement, emit);
      const writes = statement.kind === 'insert' || statement.kind === 'update' || statement.kind === 'delete' || statement.kind === 'drop';
      if (writes && frames.length > 0) frames.at(-1)!.changes += affected;
      statements.push({ kind: statement.kind, line: statement.line, affected, ...(result && { result }) });
    } catch (error) {
      restore(work, snapshot);
      if (error instanceof ConstraintError) {
        const table = findTable(work, error.constraint.table);
        emit?.({ kind: 'rolled-back', table: error.constraint.table, ...(table && { relation: relationOf(work, table) }) });
      }
      if (frames.length > 0) {
        statements.push({ kind: statement.kind, line: statement.line, affected: 0, error: asSqlError(error) });
        continue;
      }
      return { ok: false, error: asSqlError(error), db: work, statements, failedIndex: index };
    }
  }
  if (frames.length > 0) {
    const changes = pending();
    restore(work, frames[0]!.snapshot);
    report('auto-rollback', changes, frames[0]!.snapshot);
  }
  return { ok: true, db: work, statements };
}

type TransactionEvent = Extract<WriteEvent, { kind: 'transaction' }>;

/** Runs BEGIN, COMMIT, ROLLBACK, SAVEPOINT, RELEASE or ROLLBACK TO against the open frames. */
function transaction(
  st: Extract<Statement, { kind: 'transaction' }>,
  frames: Frame[],
  db: Dataset,
  report: (action: TransactionEvent['action'], changes: number, since: Snapshot, name?: string) => void,
) {
  const fail = (message: string) => {
    throw new SqlError(message, 'syntax', st.line, st.column);
  };
  const total = () => frames.reduce((n, f) => n + f.changes, 0);
  const find = (name: string) => {
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i]!.name?.toLowerCase() === name.toLowerCase()) return i;
    return fail(`No savepoint called \`${name}\`.`);
  };
  switch (st.action) {
    case 'begin':
      if (frames.length > 0) fail('A transaction is already open.');
      frames.push({ snapshot: snapshotOf(db), changes: 0 });
      report('begin', 0, frames[0]!.snapshot);
      return;
    case 'commit': {
      if (frames.length === 0) fail('There is no open transaction to commit.');
      const since = frames[0]!.snapshot;
      const changes = total();
      frames.length = 0;
      report('commit', changes, since);
      return;
    }
    case 'rollback': {
      if (frames.length === 0) fail('There is no open transaction to roll back.');
      const since = frames[0]!.snapshot;
      const changes = total();
      const before = snapshotOf(db);
      restore(db, since);
      frames.length = 0;
      report('rollback', changes, before);
      return;
    }
    case 'savepoint':
      frames.push({ name: st.name!, snapshot: snapshotOf(db), changes: 0 });
      report('savepoint', 0, frames.at(-1)!.snapshot, st.name);
      return;
    case 'release': {
      const at = find(st.name!);
      const changes = frames.slice(at).reduce((n, f) => n + f.changes, 0);
      const since = frames[at]!.snapshot;
      frames.splice(at);
      // Releasing the savepoint that started the transaction commits it.
      if (frames.length > 0) frames.at(-1)!.changes += changes;
      report('release', changes, since, st.name);
      return;
    }
    case 'rollback-to': {
      const at = find(st.name!);
      const changes = frames.slice(at).reduce((n, f) => n + f.changes, 0);
      const before = snapshotOf(db);
      restore(db, frames[at]!.snapshot);
      // The savepoint stays, so it can be rolled back to again.
      frames.splice(at + 1);
      frames[at]!.changes = 0;
      report('rollback-to', changes, before, st.name);
      return;
    }
  }
}
