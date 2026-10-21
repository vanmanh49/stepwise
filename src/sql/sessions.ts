import type { Expr, IsolationLevel, SelectStatement, Statement } from './ast';
import { exprChildren } from './ast';
import { cloneDataset, findTable, indexesOf, type Dataset } from './datasets';
import { isRowidAlias } from './schema';
import { asSqlError, SqlError } from './errors';
import { filter, scan, type QueryResult, type Relation, type Row } from './execute';
import type { ScriptResult, StatementOutcome } from './script';
import { valueKey } from './values';
import { executeStatement, relationOf, type Emit } from './write';

export type Anomaly = 'dirty read' | 'non-repeatable read' | 'phantom' | 'lost update';
type Session = 'A' | 'B';

/** One thing that happened to a statement of a two-session script. `seenBy` is every table as each session sees it afterwards. */
export interface SessionEvent {
  kind: 'session';
  session: Session;
  index: number;
  statement: Statement;
  status: 'ran' | 'waiting' | 'resumed' | 'skipped' | 'error' | 'still waiting';
  message?: string;
  anomaly?: Anomaly;
  result?: QueryResult;
  seenBy: Record<Session, Relation[]>;
}


/** What running one statement did; `affected` counts rows a write changed. */
interface Outcome {
  status: 'ran' | 'error';
  message?: string;
  anomaly?: Anomaly;
  result?: QueryResult;
  affected?: number;
}

const ALLOWED = new Set<Statement['kind']>(['select', 'insert', 'update', 'delete', 'transaction', 'set-isolation']);

export function isSessionsScript(statements: Statement[]): boolean {
  return statements.some((s) => s.session !== undefined);
}

/** A row as a session sees it. `null` values mean the row was deleted. */
type Changes = Map<string, Map<string, (number | string | null)[] | null>>;

interface State {
  level: IsolationLevel;
  /** Open transaction, or undefined between transactions. */
  open?: { explicit: boolean; changes: Changes; read: Map<string, string>; queries: Map<string, Set<string>> };
  blockedOn?: Session;
  /** After a deadlock: statements are skipped until the next BEGIN. */
  skipping: boolean;
}

const POSITIONS = new Set(['line', 'column', 'lines', 'selectLine', 'selectColumn']);

const rowKey = (table: string, id: string) => `${table.toLowerCase()}\u0000${id}`;
const other = (s: Session): Session => (s === 'A' ? 'B' : 'A');

/** The values of a row's PRIMARY KEY and UNIQUE keys, as strings that clash exactly when the keys do. */
function uniqueKeys(db: Dataset, tableName: string, values: (number | string | null)[]): string[] {
  const table = findTable(db, tableName);
  if (!table) return [];
  const sets = [
    ...[isRowidAlias(table)].flatMap((c) => (c ? [[c]] : [])),
    ...indexesOf(db, table.name).filter((i) => i.unique).map((i) => i.columns),
  ];
  return sets.flatMap((columns) => {
    const at = columns.map((c) => table.columns.findIndex((col) => col.name.toLowerCase() === c.toLowerCase()));
    const key = at.map((i) => values[i] ?? null);
    return key.some((v) => v === null) ? [] : [`${table.name.toLowerCase()}\u0000${columns.join(',')}\u0000${JSON.stringify(key)}`];
  });
}

/** Every node of an expression, without entering subqueries. */
const nodes = (e: Expr): Expr[] => [e, ...exprChildren(e).flatMap(nodes)];

/** Tables a SELECT reads, including its subqueries. */
function tablesOf(stmt: SelectStatement): string[] {
  const own = [...(stmt.from ? [stmt.from.table] : []), ...stmt.joins.map((j) => j.table)];
  const exprs = [...stmt.columns.flatMap((c) => (c.kind === 'expr' ? [c.expr] : [])), ...(stmt.where ? [stmt.where] : []), ...stmt.joins.map((j) => j.on), ...(stmt.having ? [stmt.having] : [])];
  const inner = exprs.flatMap(nodes).flatMap((n) => (n.type === 'subquery' || n.type === 'inSubquery' ? tablesOf(n.query) : []));
  return [...own, ...inner, ...(stmt.compound ?? []).flatMap((c) => tablesOf(c.select))];
}

/**
 * Simulates two sessions with the SQL standard's isolation levels, using locks: writes lock rows
 * until the transaction ends; reads lock them for the statement (READ COMMITTED), to the end
 * (REPEATABLE READ), or lock the whole table against changes (SERIALIZABLE); READ UNCOMMITTED
 * reads without locks and sees the other session's uncommitted changes. A statement that needs a
 * lock the other session holds waits; a deadlock rolls B back. Never throws.
 */
export function runSessions(start: Dataset, statements: Statement[], emit?: Emit): ScriptResult {
  let committed = cloneDataset(start);
  const outcomes: StatementOutcome[] = statements.map((s) => ({ kind: s.kind, line: s.line, affected: 0 }));
  const fail = (error: SqlError, index: number): ScriptResult => ({ ok: false, error, db: committed, statements: [], failedIndex: index });
  const bad = statements.findIndex((s) => !ALLOWED.has(s.kind) || (s.kind === 'transaction' && !['begin', 'commit', 'rollback'].includes(s.action)));
  if (bad >= 0) return fail(new SqlError('Only SELECT, INSERT, UPDATE, DELETE and transaction statements can run in a session.', 'unsupported', statements[bad]!.line, 1), bad);

  /** New rows get ids no other row, in either session, will ever use. */
  let insertedRows = 0;
  const states: Record<Session, State> = { A: { level: 'READ COMMITTED', skipping: false }, B: { level: 'READ COMMITTED', skipping: false } };
  /** Row locks: shared holders and the exclusive holder. */
  const shared = new Map<string, Set<Session>>();
  const exclusive = new Map<string, Session>();
  /** SERIALIZABLE readers lock whole tables against the other session's changes. */
  const tableLocks = new Map<string, Set<Session>>();

  /** The database as `s` sees it: committed rows plus its own changes (and, for READ UNCOMMITTED, the other's). */
  const viewOf = (s: Session, dirty = states[s].level === 'READ UNCOMMITTED'): Dataset => {
    const db = cloneDataset(committed);
    const layers = [...(dirty ? [states[other(s)].open] : []), states[s].open];
    for (const open of layers) {
      if (!open) continue;
      for (const [tableName, rows] of open.changes) {
        const table = findTable(db, tableName)!;
        for (const [id, values] of rows) {
          const at = table.rowIds!.indexOf(id);
          if (values === null) {
            if (at >= 0) {
              table.rows.splice(at, 1);
              table.rowIds!.splice(at, 1);
            }
          } else if (at >= 0) table.rows[at] = [...values];
          else {
            table.rows.push([...values]);
            table.rowIds!.push(id);
          }
        }
      }
    }
    return db;
  };
  const seen = (): Record<Session, Relation[]> => ({
    A: viewOf('A').tables.map((t) => relationOf(viewOf('A'), t)),
    B: viewOf('B').tables.map((t) => relationOf(viewOf('B'), t)),
  });
  const report = (index: number, status: SessionEvent['status'], extra: Partial<SessionEvent> = {}) =>
    emit?.({ kind: 'session', session: statements[index]!.session!, index, statement: statements[index]!, status, seenBy: seen(), ...extra });

  const begin = (s: Session, explicit: boolean) => {
    states[s].open = { explicit, changes: new Map(), read: new Map(), queries: new Map() };
  };
  const release = (s: Session) => {
    for (const holders of shared.values()) holders.delete(s);
    for (const [key, holder] of exclusive) if (holder === s) exclusive.delete(key);
    for (const holders of tableLocks.values()) holders.delete(s);
    states[s].open = undefined;
    if (states[other(s)].blockedOn === s) states[other(s)].blockedOn = undefined;
  };
  const commit = (s: Session) => {
    const open = states[s].open;
    if (open) {
      const db = viewOf(s, false);
      committed = db;
    }
    release(s);
  };
  const rollback = (s: Session) => release(s);

  /** The rows a SELECT reads, by table: the matching rows of a one-table query, otherwise every row of each table it reads. */
  const rowsRead = (db: Dataset, stmt: SelectStatement): { table: string; rows: readonly Row[] }[] => {
    if (stmt.from && stmt.joins.length === 0 && !stmt.compound?.length && tablesOf(stmt).length === 1 && findTable(db, stmt.from.table)) {
      const relation = scan(db, stmt.from);
      const env = { db, ctx: { cache: new Map(), work: 0 } };
      const kept = stmt.where ? filter('WHERE', stmt.where, relation, (row) => ({ columns: relation.columns, row, ...env }), { columns: relation.columns, row: { id: 'probe', values: relation.columns.map(() => null) }, ...env }) : relation;
      return [{ table: findTable(db, stmt.from.table)!.name, rows: kept.rows }];
    }
    return [...new Set(tablesOf(stmt).map((t) => t.toLowerCase()))].flatMap((name) => {
      const table = findTable(db, name);
      return table ? [{ table: table.name, rows: relationOf(db, table).rows }] : [];
    });
  };

  /** Runs one statement for session `s`, or returns 'wait' when it needs a lock the other session holds. */
  const attempt = (index: number): 'wait' | Outcome => {
    const st = statements[index]!;
    const s = st.session!;
    const state = states[s];
    const them = other(s);
    if (st.kind === 'set-isolation') {
      if (state.open) return { status: 'error', message: 'Set the isolation level before BEGIN.' };
      state.level = st.level;
      return { status: 'ran' };
    }
    if (st.kind === 'transaction') {
      if (st.action === 'begin') {
        if (state.open) return { status: 'error', message: 'A transaction is already open.' };
        begin(s, true);
      } else if (!state.open) {
        return { status: 'error', message: `There is no open transaction to ${st.action === 'commit' ? 'commit' : 'roll back'}.` };
      } else if (st.action === 'commit') commit(s);
      else rollback(s);
      return { status: 'ran' };
    }

    const autocommit = !state.open;
    if (autocommit) begin(s, false);
    const open = state.open!;
    const finish = (outcome: Outcome) => {
      if (autocommit) commit(s);
      return outcome;
    };
    const undoAutocommit = () => {
      if (autocommit) rollback(s);
      return 'wait' as const;
    };

    if (st.kind === 'select') {
      const view = viewOf(s);
      const reads = rowsRead(view, st.select);
      if (state.level !== 'READ UNCOMMITTED') {
        for (const { table, rows } of reads) for (const row of rows) if (exclusive.get(rowKey(table, row.id)) === them) return undoAutocommit();
      }
      let result: QueryResult;
      try {
        result = executeStatement(view, st, undefined).result!;
      } catch (error) {
        return finish({ status: 'error', message: asSqlError(error).message });
      }
      let anomaly: Anomaly | undefined;
      if (state.level === 'READ UNCOMMITTED' && JSON.stringify(executeStatement(viewOf(s, false), st).result!.rows) !== JSON.stringify(result.rows)) anomaly = 'dirty read';
      // Compare with what this transaction read before.
      // The same query again, wherever it is written.
      const queryKey = JSON.stringify(st.select, (k, v) => (POSITIONS.has(k) ? undefined : v));
      const ids = new Set(reads.flatMap(({ table, rows }) => rows.map((r) => rowKey(table, r.id))));
      const earlier = open.queries.get(queryKey);
      const mine = (key: string) => [...open.changes].some(([t, rows]) => [...rows.keys()].some((id) => rowKey(t, id) === key));
      if (!anomaly && earlier && [...ids].some((k) => !earlier.has(k) && !mine(k))) anomaly = 'phantom';
      if (!anomaly) {
        for (const { table, rows } of reads) {
          for (const row of rows) {
            const key = rowKey(table, row.id);
            const before = open.read.get(key);
            if (before !== undefined && before !== row.values.map(valueKey).join('|') && !mine(key)) anomaly = 'non-repeatable read';
          }
        }
      }
      open.queries.set(queryKey, new Set([...(earlier ?? []), ...ids]));
      for (const { table, rows } of reads) {
        for (const row of rows) {
          const key = rowKey(table, row.id);
          open.read.set(key, row.values.map(valueKey).join('|'));
          if (state.level === 'REPEATABLE READ' || state.level === 'SERIALIZABLE') shared.set(key, (shared.get(key) ?? new Set()).add(s));
        }
        if (state.level === 'SERIALIZABLE') tableLocks.set(table.toLowerCase(), (tableLocks.get(table.toLowerCase()) ?? new Set()).add(s));
      }
      return finish({ status: 'ran', result, ...(anomaly && { anomaly }) });
    }

    // A write: run it on what this session sees, then find the rows it touched.
    const view = viewOf(s, false);
    const before = new Map(view.tables.map((t) => [t.name.toLowerCase(), structuredClone(t)]));
    let affected = 0;
    try {
      affected = executeStatement(view, st).affected;
    } catch (error) {
      if (autocommit) rollback(s);
      return { status: 'error', message: asSqlError(error).message };
    }
    const touched: { table: string; id: string; values: (number | string | null)[] | null }[] = [];
    for (const table of view.tables) {
      const was = before.get(table.name.toLowerCase())!;
      const ids = new Set([...was.rowIds!, ...table.rowIds!]);
      for (let id of ids) {
        const old = was.rowIds!.indexOf(id);
        const now = table.rowIds!.indexOf(id);
        const values = now >= 0 ? table.rows[now]! : null;
        if (old >= 0 && now >= 0 && JSON.stringify(was.rows[old]) === JSON.stringify(values)) continue;
        // New rows get ids no other session uses.
        if (old < 0) {
          id = `${table.name}+${s}${++insertedRows}`;
        }
        touched.push({ table: table.name, id, values });
      }
    }
    // Uncommitted rows of the other session, by key, so a row with the same key waits as it would on a unique index.
    const theirKeys = new Set<string>();
    for (const [tableName, rows] of states[them].open?.changes ?? []) {
      for (const values of rows.values()) if (values) for (const k of uniqueKeys(view, tableName, values)) theirKeys.add(k);
    }
    for (const { table, id, values } of touched) {
      const key = rowKey(table, id);
      const lockedByThem = exclusive.get(key) === them || shared.get(key)?.has(them) || tableLocks.get(table.toLowerCase())?.has(them);
      const sameKey = values !== null && uniqueKeys(view, table, values).some((k) => theirKeys.has(k));
      if (lockedByThem || sameKey) {
        return undoAutocommit();
      }
    }
    let anomaly: Anomaly | undefined;
    for (const { table, id, values } of touched) {
      const key = rowKey(table, id);
      // Overwriting a row that another transaction changed since this one read it loses that change.
      const readAs = open.read.get(key);
      const committedRow = relationOf(committed, findTable(committed, table)!).rows.find((r) => r.id === id);
      if (readAs !== undefined && committedRow && committedRow.values.map(valueKey).join('|') !== readAs) anomaly = 'lost update';
      const rows = open.changes.get(table) ?? new Map();
      rows.set(id, values);
      open.changes.set(table, rows);
      exclusive.set(key, s);
    }
    return finish({ status: 'ran', affected, ...(anomaly && { anomaly }) });
  };

  const pending = statements.map((_, i) => i);
  const waiting = new Set<number>();
  for (;;) {
    const next = pending.find((i) => {
      const s = statements[i]!.session!;
      return !states[s].blockedOn && pending.find((j) => statements[j]!.session === s) === i;
    });
    if (next === undefined) break;
    const s = statements[next]!.session!;
    const st = statements[next]!;
    if (states[s].skipping) {
      if (st.kind === 'transaction' && st.action === 'begin') states[s].skipping = false;
      else {
        pending.splice(pending.indexOf(next), 1);
        report(next, 'skipped');
        continue;
      }
    }
    const outcome = attempt(next);
    if (outcome === 'wait') {
      const deadlock = states[other(s)].blockedOn === s;
      // In a deadlock B gives way at once, so its statement never shows as waiting.
      if (!(deadlock && s === 'B') && !waiting.has(next)) {
        waiting.add(next);
        report(next, 'waiting');
      }
      states[s].blockedOn = other(s);
      if (deadlock) {
        const at = pending.find((i) => statements[i]!.session === 'B')!;
        rollback('B');
        states.B.blockedOn = undefined;
        states.B.skipping = true;
        states.A.blockedOn = undefined;
        pending.splice(pending.indexOf(at), 1);
        waiting.delete(at);
        const message = 'Deadlock: B was rolled back so A can continue.';
        outcomes[at] = { ...outcomes[at]!, error: new SqlError(message, 'syntax', statements[at]!.line, 1) };
        report(at, 'error', { message });
      }
      continue;
    }
    pending.splice(pending.indexOf(next), 1);
    const resumed = waiting.delete(next);
    outcomes[next] = {
      kind: st.kind,
      line: st.line,
      affected: outcome.affected ?? outcome.result?.rows.length ?? 0,
      ...(outcome.result && { result: outcome.result }),
      ...(outcome.status === 'error' && { error: new SqlError(outcome.message!, 'syntax', st.line, 1) }),
    };
    const message = outcome.status === 'error' ? outcome.message : undefined;
    report(next, outcome.status === 'error' ? 'error' : resumed ? 'resumed' : 'ran', {
      ...(message && { message }),
      ...(outcome.anomaly && { anomaly: outcome.anomaly }),
      ...(outcome.result && { result: outcome.result }),
    });
  }
  for (const i of pending) report(i, 'still waiting');
  rollback('A');
  rollback('B');
  return { ok: true, db: committed, statements: outcomes };
}
