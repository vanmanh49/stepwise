import type { SessionsView, SqlRow, SqlTable, Step, TableView, View } from '../types/visualization';
import { LOGICAL_ORDER, type Statement } from './ast';
import { cloneDataset, type Dataset } from './datasets';
import { SqlError } from './errors';
import type { Relation, TraceEvent } from './execute';
import { parseScript } from './parse';
import { columnNotes, type TableSchema } from './schema';
import { runScript, type ScriptResult } from './script';
import { isSessionsScript, type Anomaly, type SessionEvent } from './sessions';
import { btreeView, buildDrafts, fit, focusOf, querySteps, toTable, type Draft } from './steps';
import { formatValue, toPlain, type SqlValue, type Truth } from './values';
import { relationOf, type WriteEvent } from './write';

export type ScriptStepsResult =
  /** Includes scripts stopped by a broken constraint: their steps end on the failure and the undo. */
  | { ok: true; steps: Step[]; result: ScriptResult }
  /** Syntax errors and other runtime errors; `steps` covers the statements that ran before it. */
  | { ok: false; error: SqlError; steps: Step[] };

const rows = (n: number) => `${n} ${n === 1 ? 'row' : 'rows'}`;
const word = (outcome: Truth) => (outcome === null ? 'unknown' : String(outcome));

interface Known {
  relation: Relation;
  schema: TableSchema;
}

function summary(statement: Statement): string {
  switch (statement.kind) {
    case 'select':
      return 'SELECT';
    case 'insert':
      return `INSERT INTO ${statement.table.table}`;
    case 'update':
      return `UPDATE ${statement.table.table}`;
    case 'delete':
      return `DELETE FROM ${statement.table.table}`;
    case 'create':
      return `CREATE TABLE ${statement.schema.name}`;
    case 'drop':
      return `DROP TABLE ${statement.table}`;
    case 'create-index':
      return `CREATE ${statement.unique ? 'UNIQUE ' : ''}INDEX ${statement.name}`;
    case 'drop-index':
      return `DROP INDEX ${statement.name}`;
    case 'create-view':
      return `CREATE VIEW ${statement.name}`;
    case 'drop-view':
      return `DROP VIEW ${statement.name}`;
    case 'explain':
      return 'EXPLAIN QUERY PLAN';
    case 'transaction':
      return transactionText(statement.action, statement.name);
    case 'set-isolation':
      return `SET TRANSACTION ISOLATION LEVEL ${statement.level}`;
  }
}

function transactionText(action: Extract<Statement, { kind: 'transaction' }>['action'], name?: string): string {
  const words = { begin: 'BEGIN', commit: 'COMMIT', rollback: 'ROLLBACK', savepoint: 'SAVEPOINT', release: 'RELEASE', 'rollback-to': 'ROLLBACK TO' }[action];
  return name ? `${words} ${name}` : words;
}

function clausesOf(statement: Statement): string[] {
  switch (statement.kind) {
    case 'select':
      return LOGICAL_ORDER.filter((c) => statement.select.lines[c] !== undefined);
    case 'insert':
      return ['INSERT', statement.values ? 'VALUES' : 'SELECT'];
    case 'update':
      return ['UPDATE', ...(statement.where ? ['WHERE'] : []), 'SET'];
    case 'delete':
      return ['DELETE', ...(statement.where ? ['WHERE'] : [])];
    case 'create':
      return ['CREATE TABLE'];
    case 'drop':
      return ['DROP TABLE'];
    case 'create-index':
      return ['CREATE INDEX'];
    case 'drop-index':
      return ['DROP INDEX'];
    case 'create-view':
      return ['CREATE VIEW'];
    case 'drop-view':
      return ['DROP VIEW'];
    case 'explain':
      return ['EXPLAIN'];
    case 'transaction':
      return [transactionText(statement.action)];
    case 'set-isolation':
      return ['SET TRANSACTION'];
  }
}

function intent(statement: Statement): string {
  switch (statement.kind) {
    case 'select':
      return 'A SELECT reads the tables as the earlier statements left them.';
    case 'insert':
      return statement.values
        ? `INSERT adds ${rows(statement.values.length)} to ${statement.table.table}, checking every constraint as each row goes in.`
        : `INSERT runs the SELECT first, then adds each row it returns to ${statement.table.table}.`;
    case 'update':
      return statement.where
        ? 'UPDATE first finds the rows WHERE matches, then changes them one at a time.'
        : 'This UPDATE has no WHERE, so it changes every row of the table.';
    case 'delete':
      return statement.where ? 'DELETE first finds the rows WHERE matches, then removes them.' : 'This DELETE has no WHERE, so it removes every row of the table.';
    case 'create':
      return 'CREATE TABLE makes a new, empty table with these columns and rules.';
    case 'drop':
      return 'DROP TABLE removes the table and every row in it.';
    case 'create-index':
      return `CREATE INDEX builds a B-tree of ${statement.table}'s ${statement.columns.join(', ')} values, so searches on ${statement.columns.length === 1 ? 'it' : 'them'} can skip most rows.`;
    case 'drop-index':
      return 'DROP INDEX removes the index. The table and its rows stay.';
    case 'create-view':
      return 'CREATE VIEW stores the query under a name. No rows are copied; the query runs each time the view is read.';
    case 'drop-view':
      return 'DROP VIEW removes the stored query. The tables it read are not touched.';
    case 'explain':
      return 'EXPLAIN QUERY PLAN shows how the database would run the query, without running it.';
    case 'transaction':
      return {
        begin: 'BEGIN starts a transaction: the changes that follow are pending until COMMIT or ROLLBACK.',
        commit: 'COMMIT keeps every pending change of the transaction.',
        rollback: 'ROLLBACK undoes every change made since BEGIN.',
        savepoint: 'SAVEPOINT marks a point inside the transaction that you can roll back to.',
        release: 'RELEASE forgets the savepoint and keeps the changes made since it.',
        'rollback-to': 'ROLLBACK TO undoes the changes made since the savepoint; the transaction stays open.',
      }[statement.action];
    case 'set-isolation':
      return 'SET TRANSACTION sets how much this session sees of the other session’s work.';
  }
}

/** What one line of EXPLAIN QUERY PLAN means, in plain words. */
function planMeaning(detail: string): string {
  if (detail.startsWith('SEARCH') && detail.includes('INTEGER PRIMARY KEY')) return 'The rows are found by their id (the rowid), so only those rows are read.';
  if (detail.startsWith('SEARCH') && detail.includes('COVERING INDEX')) return 'The index finds the matching values, and it holds every column the query needs, so the table itself is never read.';
  if (detail.startsWith('SEARCH')) return 'The index finds the matching rows, so only those rows are read from the table. "?" stands for the value being looked for.';
  if (detail.startsWith('SCAN') && detail.includes('COVERING INDEX')) return 'Every entry of the index is read in order. The index holds every column needed, so the table is never read.';
  if (detail.startsWith('SCAN') && detail.includes('INDEX')) return 'Every row is read, in the index’s order, which saves sorting them afterwards.';
  if (detail.startsWith('SCAN')) return 'Every row of the table is read, one after another.';
  if (detail.startsWith('USE TEMP B-TREE')) return 'The rows are put into a temporary B-tree to sort or group them, because no index gives them in the right order.';
  if (detail.includes('SUBQUERY')) return detail.startsWith('CORRELATED') ? 'This subquery reads the outer row, so it runs again for every row.' : 'This subquery runs once, and its result is reused.';
  if (detail.startsWith('CO-ROUTINE') || detail.startsWith('MATERIALIZE')) return 'This CTE or view runs on its own; its rows are then read like a table.';
  return 'How SQLite groups the parts of this query.';
}

/** The line a clause of a write statement starts on. */
function lineOf(statement: Statement, clause: string): number {
  if (statement.kind === 'insert') return (clause === 'SELECT' ? statement.lines.SELECT : statement.lines.VALUES) ?? statement.line;
  if (statement.kind === 'update') return (clause === 'WHERE' ? statement.lines.WHERE : clause === 'SET' ? statement.lines.SET : undefined) ?? statement.line;
  if (statement.kind === 'delete') return (clause === 'WHERE' ? statement.lines.WHERE : undefined) ?? statement.line;
  return statement.line;
}

function sqlTable(label: string, relation: Relation, schema?: TableSchema, decorate?: (id: string, index: number) => Partial<SqlRow>): SqlTable {
  return { ...toTable(label, relation, decorate), ...(schema && { columnNotes: columnNotes(schema) }) };
}

const describeChange = (before: SqlValue, after: SqlValue) => `${formatValue(before)} → ${formatValue(after)}`;

function buildScriptDrafts(db: Dataset, statements: Statement[], events: WriteEvent[], result: ScriptResult): Draft[] {
  const start = cloneDataset(db);
  const latest = new Map<string, Known>(start.tables.map((t) => [t.name.toLowerCase(), { relation: relationOf(start, t), schema: t }]));
  const failedIndex = result.ok ? -1 : result.failedIndex;
  const constraintFailure = !result.ok && result.error.kind === 'constraint';
  const changed: string[] = [];
  const touch = (name: string) => {
    if (!changed.includes(name)) changed.push(name);
  };
  const drafts: Draft[] = [];

  // Split the events by statement.
  const segments: { statement: Statement; index: number; total: number; events: WriteEvent[] }[] = [];
  for (const event of events) {
    if (event.kind === 'statement-start') segments.push({ statement: event.statement, index: event.index, total: event.total, events: [] });
    else segments.at(-1)?.events.push(event);
  }

  // The open transaction: savepoint names (undefined for BEGIN) and the tables as they were when it began.
  const frames: (string | undefined)[] = [];
  let openedWith = new Map<string, Known>();
  const restoreFrom = (tables: { name: string; before?: Relation; after?: Relation }[]) => {
    for (const t of tables) {
      const key = t.name.toLowerCase();
      if (t.after) latest.set(key, { relation: t.after, schema: latest.get(key)?.schema ?? openedWith.get(key)!.schema });
      else latest.delete(key);
    }
  };

  for (const segment of segments) {
    const { statement, index, total } = segment;
    // A statement stopped by an ordinary error is reported as that error, not as steps.
    if (index === failedIndex && !constraintFailure) break;
    const before = new Map(latest);
    const clauses = clausesOf(statement);
    const view = (current: string | undefined, tables: () => SqlTable[]) => (): TableView => ({
      kind: 'table',
      clauses,
      ...(current && { current }),
      tables: tables(),
    });
    const known = (name: string) => latest.get(name.toLowerCase()) ?? before.get(name.toLowerCase());
    const failure = result.statements[index]?.error;
    const insideTransaction = failure !== undefined;
    const target =
      statement.kind === 'insert' || statement.kind === 'update' || statement.kind === 'delete' ? statement.table.table : statement.kind === 'drop' ? statement.table : undefined;
    const targetInfo = target ? known(target) : undefined;

    drafts.push({
      step: { title: `Statement ${index + 1} of ${total}: ${summary(statement)}`, why: intent(statement), codeLine: statement.line },
      view: view(undefined, () => (targetInfo ? [sqlTable(targetInfo.schema.name, targetInfo.relation, targetInfo.schema)] : [])),
      pinned: true,
    });

    // A SELECT's own events make its steps; a transaction event after it (the end-of-script rollback) is handled below.
    let pendingEvents = segment.events;
    if (statement.kind === 'select') {
      if (index !== failedIndex) drafts.push(...buildDrafts(statement.select, segment.events.filter((e) => e.kind !== 'transaction') as TraceEvent[]));
      pendingEvents = segment.events.filter((e) => e.kind === 'transaction');
    }

    let inserted = 0;
    for (const event of pendingEvents) {
      switch (event.kind) {
        case 'filter-test': {
          const where = statement.kind === 'update' || statement.kind === 'delete' ? statement.where! : undefined;
          if (!where) break;
          const i = event.input.rows.findIndex((r) => r.id === event.row);
          const focus = focusOf(event.input, event.values);
          const verb = statement.kind === 'update' ? 'changed' : 'deleted';
          drafts.push({
            step: {
              title: `Row ${i + 1}: ${where.text} → ${word(event.outcome)}`,
              why:
                event.outcome === true
                  ? `WHERE is true, so this row will be ${verb}.`
                  : event.outcome === null
                    ? 'A comparison with NULL is unknown, and WHERE only matches rows where it is true, so this row is left alone.'
                    : 'WHERE is false, so this row is left alone.',
              codeLine: lineOf(statement, 'WHERE'),
              variables: event.values,
            },
            view: view('WHERE', () => [
              sqlTable(target!, event.input, targetInfo?.schema, (id) =>
                id === event.row ? { role: event.outcome === true ? 'found' : 'discarded', focus } : {},
              ),
            ]),
            group: `WHERE${index}`,
            kept: event.outcome === true,
          });
          break;
        }
        case 'filtered':
          if (statement.kind !== 'update' && statement.kind !== 'delete') break;
          drafts.push({
            step: {
              title: `WHERE matched ${rows(event.relation.rows.length)}`,
              why: statement.kind === 'update' ? 'Only these rows will be changed.' : 'Only these rows will be removed.',
              codeLine: lineOf(statement, 'WHERE'),
            },
            // Read now: views are built later, when the table may have changed.
            view: ((all: Known, matched: Set<string>) =>
              view('WHERE', () => [sqlTable(target!, all.relation, all.schema, (id) => (matched.has(id) ? { role: 'found' } : {}))]))(
              before.get(target!.toLowerCase())!,
              new Set(event.relation.rows.map((r) => r.id)),
            ),
          });
          break;
        case 'select-for-insert':
          drafts.push({
            step: {
              title: `SELECT gives ${rows(event.result.rows.length)} to insert`,
              why: 'The SELECT runs first, on the tables as they are now. Each row it returns is then inserted.',
              codeLine: lineOf(statement, 'SELECT'),
            },
            view: view('SELECT', () => [
              {
                label: 'SELECT result',
                columns: event.result.columns,
                rows: event.result.rows.map((r, i) => ({ id: `select#${i}`, cells: r.map(toPlain), role: 'default' as const })),
              },
            ]),
          });
          break;
        case 'inserted': {
          inserted++;
          const row = event.relation.rows.find((r) => r.id === event.rowId)!;
          const schema = known(event.table)?.schema;
          drafts.push({
            step: {
              title: `Insert row ${inserted}: (${row.values.map((v) => formatValue(v)).join(', ')})`,
              why:
                (event.filled.length > 0
                  ? `Not given: ${event.filled.join(', ')}, so ${event.filled.length > 1 ? 'they get their' : 'it gets its'} DEFAULT or the next id. `
                  : '') + 'Values are stored as the column types say, and every constraint is checked.',
              codeLine: lineOf(statement, statement.kind === 'insert' && statement.select ? 'SELECT' : 'VALUES'),
            },
            view: view(statement.kind === 'insert' && statement.select ? 'INSERT' : 'VALUES', () => [
              sqlTable(event.table, event.relation, schema, (id) => (id === event.rowId ? { role: 'found', note: 'inserted' } : {})),
            ]),
            group: `INSERT${index}`,
            kept: true,
          });
          latest.set(event.table.toLowerCase(), { relation: event.relation, schema: schema! });
          touch(event.table);
          break;
        }
        case 'updated': {
          const schema = known(event.table)?.schema;
          const position = event.relation.rows.findIndex((r) => r.id === event.rowId) + 1;
          const note = event.changed.map((c) => `${c.column}: ${describeChange(c.before, c.after)}`).join('; ');
          const focus = event.changed.map((c) => event.relation.columns.findIndex((col) => col.name === c.column));
          drafts.push({
            step: {
              title: event.changed.length > 0 ? `Row ${position}: ${note}` : `Row ${position}: nothing changes`,
              why:
                event.changed.length > 0
                  ? 'SET works out the new values from the row as it was, then writes them and checks the constraints.'
                  : 'The new values equal the old ones, so the row stays the same.',
              codeLine: lineOf(statement, 'SET'),
            },
            view: view('SET', () => [
              sqlTable(event.table, event.relation, schema, (id) =>
                id === event.rowId ? { role: 'found', ...(note && { note }), ...(focus.length > 0 && { focus }) } : {},
              ),
            ]),
            group: `SET${index}`,
            kept: true,
          });
          latest.set(event.table.toLowerCase(), { relation: event.relation, schema: schema! });
          touch(event.table);
          break;
        }
        case 'deleted': {
          const schema = known(event.table)?.schema;
          const gone = new Set(event.rowIds);
          drafts.push({
            step: {
              title: `Delete ${rows(gone.size)}`,
              why: gone.size === 0 ? 'No row matched, so nothing is removed.' : 'Every matched row is removed.',
              codeLine: statement.line,
            },
            view: view('DELETE', () => [sqlTable(event.table, event.before, schema, (id) => (gone.has(id) ? { role: 'discarded', note: 'deleted' } : {}))]),
          });
          drafts.push({
            step: { title: `${rows(event.relation.rows.length)} left in ${event.table}`, why: 'This is the table after the DELETE.', codeLine: statement.line },
            view: view('DELETE', () => [sqlTable(event.table, event.relation, schema)]),
          });
          latest.set(event.table.toLowerCase(), { relation: event.relation, schema: schema! });
          touch(event.table);
          break;
        }
        case 'created': {
          const notes = columnNotes(event.schema).filter(Boolean).length;
          drafts.push({
            step: {
              title: `CREATE TABLE ${event.schema.name}`,
              why: `The new table has ${event.schema.columns.length} ${event.schema.columns.length === 1 ? 'column' : 'columns'} and no rows yet.${notes > 0 ? ' The notes under the column names show the rules every row must follow.' : ''}`,
              codeLine: statement.line,
            },
            view: view('CREATE TABLE', () => [sqlTable(event.schema.name, event.relation, event.schema)]),
          });
          latest.set(event.schema.name.toLowerCase(), { relation: event.relation, schema: event.schema });
          touch(event.schema.name);
          break;
        }
        case 'dropped': {
          const schema = known(event.table)?.schema;
          drafts.push({
            step: {
              title: `DROP TABLE ${event.table}`,
              why: `The table and its ${rows(event.before.rows.length)} are gone. Later statements can't use it.`,
              codeLine: statement.line,
            },
            view: view('DROP TABLE', () => [sqlTable(event.table, event.before, schema, () => ({ role: 'discarded', note: 'dropped' }))]),
          });
          latest.delete(event.table.toLowerCase());
          const at = changed.indexOf(event.table);
          if (at >= 0) changed.splice(at, 1);
          break;
        }
        case 'index-created': {
          const schema = known(event.index.table)?.schema;
          const columns = event.index.columns.join(', ');
          drafts.push({
            step: {
              title: `CREATE INDEX ${event.index.name}: a B-tree of ${event.relation.rows.length} ${columns} ${event.relation.rows.length === 1 ? 'value' : 'values'}`,
              why: 'The leaves at the bottom hold every value in order, each with the row it comes from. The levels above say which branch holds which values, so a search can skip most of the tree.',
              codeLine: statement.line,
            },
            view: () => ({
              ...view('CREATE INDEX', () => [sqlTable(event.index.table, event.relation, schema)])(),
              index: btreeView(`${event.index.name} on ${event.index.table}(${columns})`, event.tree),
            }),
          });
          break;
        }
        case 'index-dropped':
          drafts.push({
            step: { title: `DROP INDEX ${event.index.name}`, why: 'The index is gone; queries on its columns read every row again. The table is unchanged.', codeLine: statement.line },
            view: view('DROP INDEX', () => []),
          });
          break;
        case 'view-created':
        case 'view-dropped': {
          const created = event.kind === 'view-created';
          drafts.push({
            step: {
              title: `${created ? 'CREATE' : 'DROP'} VIEW ${event.view.name}`,
              why: created ? 'Only the query is stored, under this name. Each time the view is read, the query runs on the tables as they are then.' : 'The stored query is gone. The tables it read are unchanged.',
              codeLine: statement.line,
            },
            view: view(created ? 'CREATE VIEW' : 'DROP VIEW', () => [
              { label: `view ${event.view.name}`, columns: ['stored query'], rows: [{ id: 'query', cells: [event.view.sql], role: created ? 'found' : 'discarded' }] },
            ]),
          });
          break;
        }
        case 'explained': {
          const depth = new Map<number, number>([[0, -1]]);
          for (const entry of event.entries) depth.set(entry.id, depth.get(entry.parent)! + 1);
          const planTable = (upTo: number) => (): SqlTable[] => [
            {
              label: 'query plan',
              columns: ['id', 'parent', 'detail'],
              rows: event.entries.slice(0, upTo + 1).map((e, i) => ({
                id: `plan#${e.id}`,
                cells: [e.id, e.parent, `${'  '.repeat(depth.get(e.id)!)}${e.detail}`],
                role: i === upTo ? ('active' as const) : ('default' as const),
              })),
            },
          ];
          event.entries.forEach((entry, i) => {
            drafts.push({
              step: { title: `Plan line ${i + 1}: ${entry.detail}`, why: planMeaning(entry.detail), codeLine: statement.line },
              view: view('EXPLAIN', planTable(i)),
              group: `PLAN${index}`,
              kept: true,
            });
          });
          break;
        }
        case 'transaction': {
          const n = `${event.changes} ${event.changes === 1 ? 'change' : 'changes'}`;
          const marked = (decorate: (row: { id: string }, changed: boolean) => Partial<SqlRow>, side: 'before' | 'after') => () =>
            event.tables.flatMap((t) => {
              const shown = t[side];
              if (!shown) return [];
              const other = new Map((side === 'after' ? t.before : t.after)?.rows.map((r) => [r.id, JSON.stringify(r.values)]) ?? []);
              return [sqlTable(t.name, shown, known(t.name)?.schema, (id) => decorate({ id }, other.get(id) !== JSON.stringify(shown.rows.find((r) => r.id === id)!.values)))];
            });
          const kept = marked((_, isChanged) => (isChanged ? { role: 'found', note: 'kept' } : {}), 'after');
          const undone = marked((_, isChanged) => (isChanged ? { role: 'discarded', note: 'undone' } : {}), 'before');
          const name = event.name ?? '';
          const titleFor: Record<typeof event.action, string> = {
            begin: 'BEGIN: changes are now pending',
            commit: `COMMIT: ${n} kept`,
            rollback: `ROLLBACK: ${n} undone`,
            savepoint: `SAVEPOINT ${name}: a point to roll back to`,
            release: `RELEASE ${name}: ${n} kept`,
            'rollback-to': `ROLLBACK TO ${name}: ${n} undone`,
            'auto-rollback': 'The script ended inside a transaction, so its changes are undone.',
          };
          const undoing = event.action === 'rollback' || event.action === 'rollback-to' || event.action === 'auto-rollback';
          drafts.push({
            step: {
              title: titleFor[event.action],
              why:
                event.action === 'auto-rollback'
                  ? 'Nothing committed the transaction, and SQLite rolls back a transaction that is still open when the connection closes.'
                  : intent(statement),
              codeLine: statement.line,
            },
            view: view(undefined, undoing ? undone : event.action === 'begin' || event.action === 'savepoint' ? () => [] : kept),
            pinned: true,
          });
          if (event.action === 'begin' || (event.action === 'savepoint' && frames.length === 0)) openedWith = new Map(latest);
          if (event.action === 'begin') frames.push(undefined);
          else if (event.action === 'savepoint') frames.push(event.name);
          else if (event.action === 'release') frames.splice(frames.findLastIndex((f) => f?.toLowerCase() === event.name!.toLowerCase()));
          else if (event.action === 'rollback-to') frames.splice(frames.findLastIndex((f) => f?.toLowerCase() === event.name!.toLowerCase()) + 1);
          else frames.length = 0;
          if (undoing) restoreFrom(event.tables);
          break;
        }
        case 'violation': {
          const { rule } = event.error.constraint;
          const schema = known(event.table)?.schema;
          const clash = event.clashWith;
          const sameTable = clash && clash.table === event.table && event.relation.rows.some((r) => r.id === clash.rowId);
          const other = clash && !sameTable ? before.get(clash.table.toLowerCase()) : undefined;
          drafts.push({
            step: { title: `${rule} failed`, why: `${event.error.message} The statement stops here.`, codeLine: statement.line },
            view: view(clauses.at(-1), () => [
              sqlTable(event.table, event.relation, schema, (id) =>
                id === event.rowId ? { role: 'discarded', note: `breaks ${rule}` } : sameTable && id === clash.rowId ? { role: 'compare', note: 'clashes' } : {},
              ),
              ...(other ? [sqlTable(other.schema.name, other.relation, other.schema, (id) => (id === clash!.rowId ? { role: 'compare' as const, note: 'referred to' } : {}))] : []),
            ]),
            pinned: true,
          });
          break;
        }
        case 'rolled-back': {
          const restored = event.relation;
          const schema = known(event.table)?.schema;
          drafts.push({
            step: {
              title: 'The statement is undone',
              why: insideTransaction
                ? 'SQLite undoes every change this statement made, but only this statement: the transaction is still open, so the script goes on.'
                : 'SQLite undoes every change a failed statement made, so the database is back to how it was before it. The statements after it do not run.',
              codeLine: statement.line,
            },
            view: view(undefined, () => (restored ? [sqlTable(event.table, restored, schema)] : [])),
            pinned: true,
          });
          break;
        }
      }
    }
    if (index === failedIndex) for (const [name, info] of before) latest.set(name, info);
    if (failure && failure.kind !== 'constraint') {
      drafts.push({
        step: { title: `Error: ${failure.message}`, why: 'Inside a transaction, a failed statement is undone on its own. The transaction stays open and the script goes on.', codeLine: statement.line },
        view: view(undefined, () => []),
        pinned: true,
      });
    }
    const writes = statement.kind === 'insert' || statement.kind === 'update' || statement.kind === 'delete';
    if (frames.length > 0 && writes && !failure) {
      // Rows that differ from when the transaction began are pending until COMMIT.
      let count = 0;
      const tables: SqlTable[] = [];
      for (const [key, now] of latest) {
        const then = openedWith.get(key);
        const old = new Map(then?.relation.rows.map((r) => [r.id, JSON.stringify(r.values)]) ?? []);
        const pending = new Set(now.relation.rows.filter((r) => old.get(r.id) !== JSON.stringify(r.values)).map((r) => r.id));
        const gone = then ? then.relation.rows.filter((r) => !now.relation.rows.some((x) => x.id === r.id)).length : 0;
        if (pending.size + gone === 0) continue;
        count += pending.size + gone;
        tables.push(sqlTable(now.schema.name, now.relation, now.schema, (id) => (pending.has(id) ? { role: 'frontier', note: 'pending' } : {})));
      }
      if (count > 0) {
        drafts.push({
          step: {
            title: `Pending: ${count} ${count === 1 ? 'change' : 'changes'} since BEGIN, not saved until COMMIT`,
            why: 'Inside a transaction, changes are kept aside: ROLLBACK can still undo them, and they only become permanent at COMMIT.',
            codeLine: statement.line,
          },
          view: ((shown: SqlTable[]) => view(undefined, () => shown))(tables),
        });
      }
    }
  }

  if (result.ok && changed.length > 0) {
    const lastSelect = result.statements.toReversed().find((s) => s.kind === 'select');
    const finalDb = result.db;
    const finalTables = changed.slice(0, lastSelect?.result ? 2 : 3).flatMap((name) => {
      const table = finalDb.tables.find((t) => t.name === name);
      return table ? [sqlTable(table.name, relationOf(finalDb, table), table)] : [];
    });
    drafts.push({
      step: {
        title: `Done: ${result.statements.length} ${result.statements.length === 1 ? 'statement' : 'statements'} ran`,
        why: 'These are the tables the script changed, as they are now.',
        codeLine: statements.at(-1)!.line,
      },
      view: (): TableView => ({
        kind: 'table',
        clauses: [],
        tables: [
          ...finalTables,
          ...(lastSelect?.result
            ? [
                {
                  label: 'result',
                  columns: lastSelect.result.columns,
                  rows: lastSelect.result.rows.map((r, i) => ({ id: `result#${i}`, cells: r.map(toPlain), role: 'found' as const })),
                },
              ]
            : []),
        ],
      }),
    });
  }
  return drafts;
}

const ANOMALY_WHY: Record<Anomaly, string> = {
  'dirty read': 'This read saw a change the other session has not committed. If that session rolls back, the value read never really existed.',
  'non-repeatable read': 'The same row, read twice in one transaction, has different values: the other session changed it in between.',
  phantom: 'The same query, run again in one transaction, finds rows that were not there before: the other session added them.',
  'lost update': 'This write overwrites a value the other session changed after this transaction read it, so that change is lost.',
};

/** Steps for a two-session script: one per statement event, with each session's view of the tables. */
function buildSessionDrafts(db: Dataset, sql: string, statements: Statement[], events: SessionEvent[]): Draft[] {
  const lines = sql.split('\n');
  const textOf = (st: Statement) => (lines[st.line - 1] ?? '').trim().replace(/^[AaBb]\s*:\s*/, '').replace(/;\s*$/, '');
  const names = [...new Set(statements.flatMap((st) => {
    if (st.kind === 'insert' || st.kind === 'update' || st.kind === 'delete') return [st.table.table.toLowerCase()];
    if (st.kind === 'select') return [st.select.from?.table, ...st.select.joins.map((j) => j.table)].flatMap((t) => (t ? [t.toLowerCase()] : []));
    return [];
  }))];
  const statuses: SessionsView['rows'][number]['status'][] = statements.map(() => 'next');
  const levels: Record<'A' | 'B', string> = { A: 'READ COMMITTED', B: 'READ COMMITTED' };
  const tablesOf = (seenBy: Record<'A' | 'B', Relation[]>): SqlTable[] => {
    const pick = (side: 'A' | 'B') => seenBy[side].filter((r) => names.includes((r.columns[0]?.table ?? '').toLowerCase()));
    const a = pick('A');
    const b = pick('B');
    return [...a.map((rel, i) => ['A', rel, b[i]] as const), ...b.map((rel, i) => ['B', rel, a[i]] as const)].map(([side, rel, other]) => {
      const theirs = new Map(other?.rows.map((r) => [r.id, JSON.stringify(r.values)]) ?? []);
      return toTable(`${side} sees ${rel.columns[0]?.table ?? ''}`, rel, (id) =>
        theirs.get(id) !== JSON.stringify(rel.rows.find((r) => r.id === id)!.values) ? { role: 'frontier', note: 'differs' } : {},
      );
    });
  };
  const viewFor = (active: number, seenBy: Record<'A' | 'B', Relation[]>, snapshot = [...statuses]) => (): SessionsView => ({
    kind: 'sessions',
    rows: statements.map((st, i) => ({ session: st.session!, text: textOf(st), status: snapshot[i]!, active: i === active })),
    tables: tablesOf(seenBy),
  });
  const start = cloneDataset(db);
  const startSeen = { A: start.tables.map((t) => relationOf(start, t)), B: start.tables.map((t) => relationOf(start, t)) };
  const drafts: Draft[] = [
    {
      step: {
        title: 'Two sessions, A and B',
        why: 'Two connections use the same database at once. Statements run in the order written, unless one has to wait for a lock the other session holds.',
        codeLine: statements[0]!.line,
      },
      view: viewFor(-1, startSeen),
      pinned: true,
    },
  ];
  for (const event of events) {
    const st = event.statement;
    const s = event.session;
    const them = s === 'A' ? 'B' : 'A';
    const text = textOf(st);
    statuses[event.index] = event.status;
    if (st.kind === 'set-isolation' && event.status === 'ran') levels[s] = st.level;
    const value = event.result
      ? event.result.rows.length === 1 && event.result.columns.length === 1
        ? ` → ${formatValue(event.result.rows[0]![0]!)}`
        : ` → ${rows(event.result.rows.length)}`
      : '';
    const anomaly = event.anomaly ? ` — ${event.anomaly}` : '';
    const title = {
      ran: `${s}: ${text}${value}${anomaly}`,
      resumed: `${s} goes on: ${text}${value}${anomaly}`,
      waiting: `${s} waits: ${text} needs a lock ${them} holds`,
      error: `${s}: ${text} fails — ${event.message}`,
      skipped: `${s} skips ${text}: its transaction was rolled back`,
      'still waiting': `${s} is still waiting when the script ends: ${text}`,
    }[event.status];
    const why = event.anomaly
      ? ANOMALY_WHY[event.anomaly]
      : {
          ran: levels[s] === 'READ UNCOMMITTED' ? `Under READ UNCOMMITTED, ${s} sees committed rows, its own changes and ${them}'s uncommitted ones.` : `Under ${levels[s]}, ${s} sees committed rows plus its own changes.`,
          resumed: `${them}'s transaction ended and released its locks, so ${s} can go on.`,
          waiting: `Under ${levels[s]}, ${them} holds a lock on a row this statement needs, so ${s} waits until ${them}'s transaction ends.`,
          error: event.message?.startsWith('Deadlock') ? 'Each session was waiting for a lock the other holds. One of them has to give way, so the database rolls back B.' : 'Only this statement is undone.',
          skipped: `${s}'s transaction was rolled back, so its statements up to the next BEGIN do nothing.`,
          'still waiting': `${them} never ended its transaction, so ${s} never got the lock.`,
        }[event.status];
    drafts.push({ step: { title, why, codeLine: st.line }, view: viewFor(event.index, event.seenBy) });
  }
  return drafts;
}

/** Runs a script on a fresh copy of `db` and describes it statement by statement. Never throws. */
export function scriptSteps(db: Dataset, sql: string): ScriptStepsResult {
  const parsed = parseScript(sql);
  if (!parsed.ok) return { ok: false, error: parsed.error, steps: [] };
  const statements = parsed.statements;
  if (statements.length === 1 && statements[0]!.kind === 'select') {
    const query = querySteps(db, sql);
    if (!query.ok) return { ok: false, error: query.error, steps: [] };
    return { ok: true, steps: query.steps, result: runScript(db, sql) };
  }
  const events: WriteEvent[] = [];
  const result = runScript(db, sql, (e) => events.push(e));
  if (isSessionsScript(statements)) {
    if (!result.ok) return { ok: false, error: result.error, steps: [] };
    return { ok: true, steps: fit(buildSessionDrafts(db, sql, statements, events.filter((e): e is SessionEvent => e.kind === 'session'))), result };
  }
  const steps = fit(buildScriptDrafts(db, statements, events, result));
  if (!result.ok && result.error.kind !== 'constraint') {
    const { error, failedIndex } = result;
    const message = statements.length > 1 ? `Statement ${failedIndex + 1} of ${statements.length} failed: ${error.message}` : error.message;
    return { ok: false, error: new SqlError(message, error.kind, error.line, error.column, error.topic), steps };
  }
  return { ok: true, steps, result };
}

/** A step's view of any kind, such as a two-session timeline, for lesson quizzes. Throws if the script fails to run. */
export function scriptStepView(db: Dataset, sql: string, index: number): View {
  const result = scriptSteps(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} in: ${sql}`);
  const step = result.steps.at(index);
  if (!step) throw new Error(`No step ${index} in: ${sql}`);
  return step.view;
}

/** A step's view, for lesson quizzes. A negative index counts from the end. Throws if the script fails to run. */
export function scriptViewAt(db: Dataset, sql: string, index: number): TableView {
  const result = scriptSteps(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} in: ${sql}`);
  const step = result.steps.at(index);
  if (!step) throw new Error(`No step ${index} in: ${sql}`);
  return step.view as TableView;
}
