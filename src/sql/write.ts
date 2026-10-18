import type { Statement, TableRef } from './ast';
import { checkForeignKeys, checkRow } from './constraints';
import { findTable, findView, indexesOf, type Dataset, type DatasetTable, type IndexDef, type ViewDef } from './datasets';
import { ConstraintError, SqlError, suggest } from './errors';
import { evaluate } from './evaluate';
import { bindCtes, executeSelect, filter, nullRow, scan, type Env, type QueryResult, type Relation, type Row, type TraceEvent } from './execute';
import { firstNode } from './parse';
import { planSelect, type PlanEntry } from './plan';
import { formatLiteral, isRowidAlias, type TableSchema } from './schema';
import { applyAffinity, valueKey, type SqlValue } from './values';

/** Most rows a table may hold after a statement, so every step stays readable. */
export const MAX_TABLE_ROWS = 50;

export type WriteEvent =
  | { kind: 'statement-start'; index: number; total: number; statement: Statement }
  /** `filled` names the columns given a default or an automatic id. */
  | { kind: 'inserted'; table: string; rowId: string; filled: string[]; relation: Relation }
  | { kind: 'select-for-insert'; table: string; result: QueryResult }
  | { kind: 'updated'; table: string; rowId: string; changed: { column: string; before: SqlValue; after: SqlValue }[]; relation: Relation }
  | { kind: 'deleted'; table: string; rowIds: string[]; before: Relation; relation: Relation }
  | { kind: 'created'; schema: TableSchema; relation: Relation }
  | { kind: 'dropped'; table: string; before: Relation }
  /** `relation` is the table as it was when the row failed, before the statement is undone. */
  | { kind: 'violation'; error: ConstraintError; table: string; rowId: string; clashWith?: { table: string; rowId: string }; relation: Relation }
  | { kind: 'rolled-back'; table: string; relation?: Relation }
  | { kind: 'index-created' | 'index-dropped'; index: IndexDef }
  | { kind: 'view-created' | 'view-dropped'; view: ViewDef }
  | { kind: 'explained'; entries: PlanEntry[] }
  | TraceEvent;

export type Emit = (event: WriteEvent) => void;

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const newEnv = (db: Dataset, ctes?: ReadonlyMap<string, Relation>): Env => ({ db, ctx: { cache: new Map(), work: 0 }, ...(ctes && { ctes }) });

function tableOf(db: Dataset, ref: { table: string; line: number; column: number }): DatasetTable {
  const table = findTable(db, ref.table);
  if (table) return table;
  if (findView(db, ref.table)) throw new SqlError('Views are read-only here; change the table it reads from.', 'syntax', ref.line, ref.column);
  const close = suggest(ref.table, db.tables.map((t) => t.name));
  throw new SqlError(`No table \`${ref.table}\`.` + (close ? ` Did you mean \`${close}\`?` : ''), 'name', ref.line, ref.column);
}

function columnIndex(table: DatasetTable, name: string, line: number, column: number): number {
  const i = table.columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) return i;
  const close = suggest(name, table.columns.map((c) => c.name));
  throw new SqlError(`No column \`${name}\` in ${table.name}.` + (close ? ` Did you mean \`${close}\`?` : ''), 'name', line, column);
}

/** The table as the executor sees it, with stable row ids. */
export function relationOf(db: Dataset, table: DatasetTable): Relation {
  return scan(db, { table: table.name, line: 1, column: 1 });
}

function nextRowId(table: DatasetTable): string {
  let max = 0;
  for (const id of table.rowIds!) {
    const n = /\+(\d+)$/.exec(id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `${table.name}+${max + 1}`;
}

/** SQLite's automatic id for an INTEGER PRIMARY KEY: one more than the largest, or 1. */
function nextKey(table: DatasetTable, column: number): number {
  let max = 0;
  for (const row of table.rows) {
    const v = row[column];
    if (typeof v === 'number') max = Math.max(max, Math.floor(v));
  }
  return max + 1;
}

/** Converts a full row to stored values, filling an omitted INTEGER PRIMARY KEY. */
function toStored(table: DatasetTable, values: SqlValue[], line: number, rowId: string, fillKey: boolean): (number | string | null)[] {
  const alias = isRowidAlias(table);
  const aliasIndex = alias === undefined ? -1 : table.columns.findIndex((c) => c.name === alias);
  return values.map((v, i) => {
    const column = table.columns[i]!;
    if (i === aliasIndex) {
      if (v === null && fillKey) return nextKey(table, i);
      const stored = applyAffinity(v, 'INTEGER');
      if (typeof stored !== 'number' || !Number.isInteger(stored)) {
        throw new ConstraintError(
          `PRIMARY KEY failed: ${table.name}.${column.name} is an INTEGER PRIMARY KEY, so it must be a whole number.`,
          { rule: 'PRIMARY KEY', table: table.name, column: column.name },
          rowId,
          line,
          1,
        );
      }
      return stored;
    }
    return applyAffinity(v, column.type);
  });
}

function guardSize(table: DatasetTable, line: number) {
  if (table.rows.length > MAX_TABLE_ROWS) {
    throw new SqlError(`This table would hold more than ${MAX_TABLE_ROWS} rows.`, 'limit', line, 1);
  }
}

function insert(db: Dataset, st: Extract<Statement, { kind: 'insert' }>, emit?: Emit): number {
  const table = tableOf(db, st.table);
  const names = st.columns ?? table.columns.map((c) => c.name);
  const targets = names.map((name) => columnIndex(table, name, st.table.line, st.table.column));
  const ctes = st.with ? bindCtes(db, st.with) : undefined;
  let incoming: SqlValue[][];
  if (st.select) {
    // The whole result is read before anything is written, so a table can be copied into itself.
    const result = executeSelect(db, st.select, undefined, undefined, undefined, ctes);
    emit?.({ kind: 'select-for-insert', table: table.name, result });
    incoming = result.rows;
  } else {
    const env = newEnv(db, ctes);
    const scope = { columns: [], row: { id: 'values', values: [] }, ...env };
    incoming = st.values!.map((row) => row.map((expr) => evaluate(expr, scope)));
  }
  const alias = isRowidAlias(table);
  for (const row of incoming) {
    if (row.length !== names.length) {
      throw new SqlError(`INSERT gives ${plural(row.length, 'value')} for ${plural(names.length, 'column')}.`, 'syntax', st.line, 1);
    }
    const filled: string[] = [];
    const full = table.columns.map((c, i) => {
      const k = targets.indexOf(i);
      if (k >= 0) {
        if (row[k] === null && c.name === alias) filled.push(c.name);
        return row[k]!;
      }
      if (c.default !== undefined || c.name === alias) filled.push(c.name);
      return c.default ?? null;
    });
    const rowId = nextRowId(table);
    const stored = toStored(table, full, st.line, rowId, true);
    table.rows.push(stored);
    table.rowIds!.push(rowId);
    guardSize(table, st.line);
    checkRow(db, table, table.rows.length - 1, st.line);
    emit?.({ kind: 'inserted', table: table.name, rowId, filled, relation: relationOf(db, table) });
  }
  return incoming.length;
}

function matching(
  db: Dataset,
  ref: TableRef,
  where: Extract<Statement, { kind: 'update' }>['where'],
  emit?: Emit,
  ctes?: ReadonlyMap<string, Relation>,
): { relation: Relation; rows: Row[]; env: Env } {
  const env = newEnv(db, ctes);
  const relation = scan(db, ref);
  if (!where) return { relation, rows: relation.rows, env };
  const scopeOf = (row: Row) => ({ columns: relation.columns, row, ...env });
  const kept = filter('WHERE', where, relation, scopeOf, scopeOf(nullRow(relation.columns)), emit);
  return { relation, rows: kept.rows, env };
}

function update(db: Dataset, st: Extract<Statement, { kind: 'update' }>, emit?: Emit): number {
  const table = tableOf(db, st.table);
  const targets = st.set.map((s) => columnIndex(table, s.name, s.line, s.column));
  const { relation, rows, env } = matching(db, st.table, st.where, emit, st.with ? bindCtes(db, st.with) : undefined);
  const scopeOf = (row: Row) => ({ columns: relation.columns, row, ...env });
  if (rows.length === 0) for (const s of st.set) evaluate(s.expr, scopeOf(nullRow(relation.columns)));
  // Like SQLite, rows are updated one at a time: each SET reads that row's old values, while a
  // subquery over the table already sees the rows changed before it.
  for (const row of rows) {
    const values = [...row.values];
    st.set.forEach((s, k) => (values[targets[k]!] = evaluate(s.expr, scopeOf(row))));
    const index = table.rowIds!.indexOf(row.id);
    const before = table.rows[index]!;
    const after = toStored(table, values, st.line, row.id, false);
    table.rows[index] = after;
    checkRow(db, table, index, st.line);
    const changed = table.columns.flatMap((c, i) =>
      valueKey(before[i]!) === valueKey(after[i]!) ? [] : [{ column: c.name, before: before[i]!, after: after[i]! }],
    );
    emit?.({ kind: 'updated', table: table.name, rowId: row.id, changed, relation: relationOf(db, table) });
  }
  return rows.length;
}

function remove(db: Dataset, st: Extract<Statement, { kind: 'delete' }>, emit?: Emit): number {
  const table = tableOf(db, st.table);
  const { relation, rows } = matching(db, st.table, st.where, emit, st.with ? bindCtes(db, st.with) : undefined);
  const gone = new Set(rows.map((r) => r.id));
  const keep = table.rowIds!.map((id) => !gone.has(id));
  table.rows = table.rows.filter((_, i) => keep[i]);
  table.rowIds = table.rowIds!.filter((_, i) => keep[i]);
  emit?.({ kind: 'deleted', table: table.name, rowIds: [...gone], before: relation, relation: relationOf(db, table) });
  return gone.size;
}

function create(db: Dataset, st: Extract<Statement, { kind: 'create' }>, emit?: Emit): void {
  const { schema } = st;
  if (findTable(db, schema.name)) throw new SqlError(`Table \`${schema.name}\` already exists.`, 'name', st.line, st.column);
  if (findView(db, schema.name)) throw new SqlError(`A table or view called \`${schema.name}\` already exists.`, 'name', st.line, st.column);
  const seen = new Set<string>();
  for (const c of schema.columns) {
    if (seen.has(c.name.toLowerCase())) throw new SqlError(`Column \`${c.name}\` appears twice.`, 'syntax', st.line, st.column);
    seen.add(c.name.toLowerCase());
  }
  const primaryKeys = schema.columns.filter((c) => c.primaryKey).length + (schema.primaryKey ? 1 : 0);
  if (primaryKeys > 1) throw new SqlError('A table can only have one PRIMARY KEY.', 'syntax', st.line, st.column);
  const listed = [
    ...(schema.primaryKey ?? []),
    ...(schema.unique ?? []).flat(),
    ...(schema.foreignKeys ?? []).flatMap((f) => f.columns),
  ];
  for (const check of st.checks) {
    const unknown = firstNode(
      check,
      (e) => e.type === 'column' && ((e.table !== undefined && e.table.toLowerCase() !== schema.name.toLowerCase()) || !seen.has(e.name.toLowerCase())),
    );
    if (unknown && unknown.type === 'column') {
      throw new SqlError(`No column \`${unknown.name}\` in ${schema.name}.`, 'name', unknown.line, unknown.column);
    }
  }
  for (const fk of schema.foreignKeys ?? []) {
    if (fk.columns.length !== fk.refColumns.length) {
      throw new SqlError(
        `FOREIGN KEY (${fk.columns.join(', ')}) lists ${fk.columns.length} columns but REFERENCES ${fk.table} lists ${fk.refColumns.length}.`,
        'syntax',
        st.line,
        st.column,
      );
    }
  }
  for (const name of listed) {
    if (!seen.has(name.toLowerCase())) throw new SqlError(`No column \`${name}\` in ${schema.name}.`, 'name', st.line, st.column);
  }
  const table: DatasetTable = { ...structuredClone(schema), rows: [], rowIds: [] };
  db.tables.push(table);
  emit?.({ kind: 'created', schema, relation: relationOf(db, table) });
}

function drop(db: Dataset, st: Extract<Statement, { kind: 'drop' }>, emit?: Emit): number {
  const table = findTable(db, st.table);
  if (!table && findView(db, st.table)) throw new SqlError(`\`${st.table}\` is a view. Use DROP VIEW.`, 'name', st.line, st.column);
  if (!table) {
    if (st.ifExists) return 0;
    tableOf(db, { table: st.table, line: st.line, column: st.column });
    return 0;
  }
  const before = relationOf(db, table);
  const snapshot = structuredClone(db.tables);
  // Like SQLite, dropping a table first deletes its rows, so rows elsewhere that refer to them stop it.
  table.rows = [];
  table.rowIds = [];
  checkForeignKeys(db, snapshot, st.line);
  db.tables = db.tables.filter((t) => t !== table);
  if (db.indexes) db.indexes = db.indexes.filter((i) => i.table.toLowerCase() !== table.name.toLowerCase());
  emit?.({ kind: 'dropped', table: table.name, before });
  return before.rows.length;
}

function createIndex(db: Dataset, st: Extract<Statement, { kind: 'create-index' }>, emit?: Emit): void {
  const table = tableOf(db, { table: st.table, line: st.line, column: st.column });
  const positions = st.columns.map((name) => columnIndex(table, name, st.line, st.column));
  const all = (db.tables.flatMap((t) => indexesOf(db, t.name)));
  if (all.some((i) => i.name.toLowerCase() === st.name.toLowerCase())) {
    if (st.ifNotExists) return;
    throw new SqlError(`An index called \`${st.name}\` already exists.`, 'name', st.line, st.column);
  }
  const index: IndexDef = { name: st.name, table: table.name, columns: positions.map((p) => table.columns[p]!.name), unique: st.unique, implicit: false };
  if (st.unique) {
    // NULLs never clash, as in SQLite.
    const seen = new Map<string, number>();
    table.rows.forEach((row, i) => {
      const values = positions.map((p) => row[p]!);
      if (values.some((v) => v === null)) return;
      const key = values.map(valueKey).join('|');
      const first = seen.get(key);
      if (first !== undefined) {
        const described = index.columns.map((c, k) => `${c} ${formatLiteral(values[k]!)}`).join(', ');
        throw new SqlError(`Can't create UNIQUE index \`${st.name}\`: rows ${first + 1} and ${i + 1} both have ${described}.`, 'constraint', st.line, st.column);
      }
      seen.set(key, i);
    });
  }
  db.indexes = [...(db.indexes ?? []), index];
  emit?.({ kind: 'index-created', index });
}

function dropIndex(db: Dataset, st: Extract<Statement, { kind: 'drop-index' }>, emit?: Emit): void {
  const wanted = st.name.toLowerCase();
  const index = db.tables.flatMap((t) => indexesOf(db, t.name)).find((i) => i.name.toLowerCase() === wanted);
  if (!index) {
    if (st.ifExists) return;
    throw new SqlError(`No index \`${st.name}\`.`, 'name', st.line, st.column);
  }
  if (index.implicit) {
    throw new SqlError(`\`${index.name}\` belongs to a UNIQUE or PRIMARY KEY constraint and can't be dropped.`, 'syntax', st.line, st.column);
  }
  db.indexes = (db.indexes ?? []).filter((i) => i !== index);
  emit?.({ kind: 'index-dropped', index });
}

function createView(db: Dataset, st: Extract<Statement, { kind: 'create-view' }>, emit?: Emit): void {
  if (findTable(db, st.name) || findView(db, st.name)) {
    if (st.ifNotExists && findView(db, st.name)) return;
    throw new SqlError(`A table or view called \`${st.name}\` already exists.`, 'name', st.line, st.column);
  }
  // Run the query once now, so a view that names a missing table or column fails here, as in SQLite.
  const result = executeSelect(db, st.query);
  if (st.columns && st.columns.length !== result.columns.length) {
    throw new SqlError(`View \`${st.name}\` lists ${st.columns.length} columns but its SELECT returns ${result.columns.length}.`, 'syntax', st.line, st.column);
  }
  const view: ViewDef = { name: st.name, ...(st.columns && { columns: st.columns }), sql: st.sql, query: st.query };
  db.views = [...(db.views ?? []), view];
  emit?.({ kind: 'view-created', view });
}

function dropView(db: Dataset, st: Extract<Statement, { kind: 'drop-view' }>, emit?: Emit): void {
  const view = findView(db, st.name);
  if (!view) {
    if (findTable(db, st.name)) throw new SqlError(`\`${st.name}\` is a table. Use DROP TABLE.`, 'name', st.line, st.column);
    if (st.ifExists) return;
    throw new SqlError(`No view \`${st.name}\`.`, 'name', st.line, st.column);
  }
  db.views = (db.views ?? []).filter((v) => v !== view);
  emit?.({ kind: 'view-dropped', view });
}

/** Table a violation happened in, for the step that shows it. */
function violationTable(db: Dataset, error: ConstraintError): DatasetTable | undefined {
  return findTable(db, error.constraint.table);
}

/** Runs one statement on `db`, changing it in place. Throws SqlError; the caller undoes a failed statement. */
export function executeStatement(db: Dataset, statement: Statement, emit?: Emit): { affected: number; result?: QueryResult } {
  try {
    switch (statement.kind) {
      case 'select': {
        const result = executeSelect(db, statement.select, emit);
        return { affected: result.rows.length, result };
      }
      case 'create':
        create(db, statement, emit);
        return { affected: 0 };
      case 'drop':
        return { affected: drop(db, statement, emit) };
      case 'create-index':
        createIndex(db, statement, emit);
        return { affected: 0 };
      case 'drop-index':
        dropIndex(db, statement, emit);
        return { affected: 0 };
      case 'create-view':
        createView(db, statement, emit);
        return { affected: 0 };
      case 'drop-view':
        dropView(db, statement, emit);
        return { affected: 0 };
      case 'explain': {
        const { entries } = planSelect(db, statement.select);
        const result: QueryResult = { columns: ['id', 'parent', 'notused', 'detail'], rows: entries.map((e) => [e.id, e.parent, 0, e.detail]) };
        emit?.({ kind: 'explained', entries });
        return { affected: entries.length, result };
      }
      case 'transaction':
      case 'set-isolation':
        throw new SqlError(`\`${statement.kind}\` isn't supported here yet.`, 'unsupported', statement.line, 1);
      default: {
        const before = structuredClone(db.tables);
        const affected = statement.kind === 'insert' ? insert(db, statement, emit) : statement.kind === 'update' ? update(db, statement, emit) : remove(db, statement, emit);
        checkForeignKeys(db, before, statement.line);
        return { affected };
      }
    }
  } catch (error) {
    if (error instanceof ConstraintError) {
      const table = violationTable(db, error);
      emit?.({
        kind: 'violation',
        error,
        table: error.constraint.table,
        rowId: error.rowId,
        ...(error.clashWith && { clashWith: error.clashWith }),
        relation: table ? relationOf(db, table) : { columns: [], rows: [] },
      });
    }
    throw error;
  }
}

