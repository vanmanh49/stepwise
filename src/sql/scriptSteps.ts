import type { SqlRow, SqlTable, Step, TableView } from '../types/visualization';
import { LOGICAL_ORDER, type Statement } from './ast';
import { cloneDataset, type Dataset } from './datasets';
import { SqlError } from './errors';
import type { Relation, TraceEvent } from './execute';
import { parseScript } from './parse';
import { columnNotes, type TableSchema } from './schema';
import { runScript, type ScriptResult } from './script';
import { buildDrafts, fit, focusOf, querySteps, toTable, type Draft } from './steps';
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
  }
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
  }
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
    const target = statement.kind === 'select' ? undefined : statement.kind === 'create' ? undefined : statement.kind === 'drop' ? statement.table : statement.table.table;
    const targetInfo = target ? known(target) : undefined;

    drafts.push({
      step: { title: `Statement ${index + 1} of ${total}: ${summary(statement)}`, why: intent(statement), codeLine: statement.line },
      view: view(undefined, () => (targetInfo ? [sqlTable(targetInfo.schema.name, targetInfo.relation, targetInfo.schema)] : [])),
      pinned: true,
    });

    if (statement.kind === 'select') {
      if (index !== failedIndex) drafts.push(...buildDrafts(statement.select, segment.events as TraceEvent[]));
      continue;
    }

    let inserted = 0;
    for (const event of segment.events) {
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
            view: view('WHERE', () => {
              const matched = new Set(event.relation.rows.map((r) => r.id));
              const all = known(target!)!;
              return [sqlTable(target!, all.relation, all.schema, (id) => (matched.has(id) ? { role: 'found' } : {}))];
            }),
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
              why: 'SQLite undoes every change a failed statement made, so the database is back to how it was before it. The statements after it do not run.',
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
  }

  if (result.ok && changed.length > 0) {
    const lastSelect = [...result.statements].reverse().find((s) => s.kind === 'select');
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
  const steps = fit(buildScriptDrafts(db, statements, events, result));
  if (!result.ok && result.error.kind !== 'constraint') {
    const { error, failedIndex } = result;
    const message = statements.length > 1 ? `Statement ${failedIndex + 1} of ${statements.length} failed: ${error.message}` : error.message;
    return { ok: false, error: new SqlError(message, error.kind, error.line, error.column, error.topic), steps };
  }
  return { ok: true, steps, result };
}

/** A step's view, for lesson quizzes. A negative index counts from the end. Throws if the script fails to run. */
export function scriptViewAt(db: Dataset, sql: string, index: number): TableView {
  const result = scriptSteps(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} in: ${sql}`);
  const step = result.steps.at(index);
  if (!step) throw new Error(`No step ${index} in: ${sql}`);
  return step.view as TableView;
}
