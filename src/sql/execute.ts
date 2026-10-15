import type { Expr, JoinClause, SelectStatement, TableRef } from './ast';
import { findTable, type ColumnType, type Dataset } from './datasets';
import { SqlError, suggest } from './errors';
import { evaluate, evaluateTruth, referencedColumns, type Scope } from './evaluate';
import { parseQuery } from './parse';
import { compareValues, Real, valueKey, type SqlValue, type Truth } from './values';

export interface ColumnRef {
  /** The alias if the query gave one, else the table name. */
  table?: string;
  name: string;
  type?: ColumnType;
}

export interface Row {
  /** Stable across steps so the renderer can follow a row. */
  id: string;
  values: SqlValue[];
  /** The source rows of a group. */
  members?: Row[];
}

export interface Relation {
  columns: ColumnRef[];
  rows: Row[];
}

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
}

export type TraceEvent =
  | { kind: 'scan'; table: string; relation: Relation }
  | { kind: 'join-test'; join: JoinClause; left: Relation; right: Relation; leftRow: string; rightRow: string; outcome: Truth }
  | { kind: 'join-unmatched'; join: JoinClause; leftRow: string }
  | { kind: 'joined'; join: JoinClause; relation: Relation }
  | {
      kind: 'filter-test';
      clause: 'WHERE' | 'HAVING';
      input: Relation;
      row: string;
      outcome: Truth;
      values: Record<string, string>;
    }
  | { kind: 'filtered'; clause: 'WHERE' | 'HAVING'; relation: Relation }
  | { kind: 'grouped'; input: Relation; groups: { key: SqlValue[]; rowIds: string[] }[]; relation: Relation }
  | { kind: 'projected'; relation: Relation }
  | { kind: 'distinct'; input: Relation; removed: string[]; relation: Relation }
  | { kind: 'sorted'; input: Relation; relation: Relation }
  | { kind: 'limited'; input: Relation; relation: Relation };

export type RunResult = { ok: true; result: QueryResult; statement: SelectStatement } | { ok: false; error: SqlError };

type Trace = (event: TraceEvent) => void;

function scan(db: Dataset, ref: TableRef): Relation {
  const table = findTable(db, ref.table);
  if (!table) {
    const close = suggest(ref.table, db.tables.map((t) => t.name));
    throw new SqlError(
      `No table \`${ref.table}\`.` + (close ? ` Did you mean \`${close}\`?` : ''),
      'name',
      ref.line,
      ref.column,
    );
  }
  const label = ref.alias ?? table.name;
  return {
    columns: table.columns.map((c) => ({ table: label, name: c.name, type: c.type })),
    rows: table.rows.map((values, i) => ({
      id: `${table.name}#${i}`,
      values: values.map((v, c) => (table.columns[c]!.type === 'REAL' && typeof v === 'number' ? new Real(v) : v)),
    })),
  };
}

const nullRow = (columns: ColumnRef[]): Row => ({ id: 'probe', values: columns.map(() => null) });

/**
 * Evaluates `expr` once against a row of NULLs. Used when a relation is empty, so that
 * misspelled columns are still reported, as SQLite reports them before running.
 */
function probe(expr: Expr, relation: Relation, outer: Scope | undefined, db: Dataset) {
  evaluate(expr, { columns: relation.columns, row: nullRow(relation.columns), outer, db });
}

function join(db: Dataset, left: Relation, clause: JoinClause, outer: Scope | undefined, trace?: Trace): Relation {
  const right = scan(db, clause);
  trace?.({ kind: 'scan', table: findTable(db, clause.table)!.name, relation: right });
  const columns = [...left.columns, ...right.columns];
  if (left.rows.length === 0 || right.rows.length === 0) probe(clause.on, { columns, rows: [] }, outer, db);
  const rows: Row[] = [];
  for (const l of left.rows) {
    let matched = false;
    for (const r of right.rows) {
      const row = { id: `${l.id}+${r.id}`, values: [...l.values, ...r.values] };
      const outcome = evaluateTruth(clause.on, { columns, row, outer, db });
      trace?.({ kind: 'join-test', join: clause, left, right, leftRow: l.id, rightRow: r.id, outcome });
      if (outcome) {
        matched = true;
        rows.push(row);
      }
    }
    if (!matched && clause.kind === 'left') {
      trace?.({ kind: 'join-unmatched', join: clause, leftRow: l.id });
      rows.push({ id: `${l.id}+null`, values: [...l.values, ...right.columns.map(() => null)] });
    }
  }
  const relation = { columns, rows };
  trace?.({ kind: 'joined', join: clause, relation });
  return relation;
}

function filter(
  clause: 'WHERE' | 'HAVING',
  condition: Expr,
  input: Relation,
  outer: Scope | undefined,
  db: Dataset,
  trace?: Trace,
): Relation {
  if (input.rows.length === 0) probe(condition, input, outer, db);
  const rows = input.rows.filter((row) => {
    const scope = { columns: input.columns, row, outer, db };
    const outcome = evaluateTruth(condition, scope);
    trace?.({ kind: 'filter-test', clause, input, row: row.id, outcome, values: referencedColumns(condition, scope) });
    return outcome === true;
  });
  const relation = { columns: input.columns, rows };
  trace?.({ kind: 'filtered', clause, relation });
  return relation;
}

interface Output {
  name: string;
  expr?: Expr;
  /** For star columns: the source column index. */
  source?: number;
}

function outputs(stmt: SelectStatement, source: Relation): Output[] {
  return stmt.columns.flatMap((item): Output[] => {
    if (item.kind === 'expr') {
      // SQLite names a plain column reference by the column, not by how the query wrote it.
      const name = item.alias ?? (item.expr.type === 'column' ? item.expr.name : item.expr.text);
      return [{ name, expr: item.expr }];
    }
    const picked = source.columns.flatMap((c, i) =>
      item.table === undefined || (c.table !== undefined && c.table.toLowerCase() === item.table.toLowerCase())
        ? [{ name: c.name, source: i }]
        : [],
    );
    if (item.table !== undefined && picked.length === 0) {
      throw new SqlError(`No table \`${item.table}\` in this query.`, 'name', stmt.lines.SELECT ?? 1, 1);
    }
    return picked;
  });
}

/** Runs a SELECT. Reports trace events for the top-level statement only; subqueries pass no trace. */
export function executeSelect(db: Dataset, stmt: SelectStatement, trace?: Trace, outer?: Scope): QueryResult {
  let relation = scan(db, stmt.from);
  trace?.({ kind: 'scan', table: findTable(db, stmt.from.table)!.name, relation });
  for (const clause of stmt.joins) relation = join(db, relation, clause, outer, trace);
  if (stmt.where) relation = filter('WHERE', stmt.where, relation, outer, db, trace);

  const source = relation;
  const cols = outputs(stmt, source);
  const scopeOf = (row: Row): Scope => ({ columns: source.columns, row, outer, db });
  if (source.rows.length === 0) {
    for (const c of cols) if (c.expr) probe(c.expr, source, outer, db);
  }
  const sourceById = new Map(source.rows.map((row) => [row.id, row]));
  let projected: Relation = {
    columns: cols.map((c) => ({ name: c.name })),
    rows: source.rows.map((row) => ({
      id: row.id,
      values: cols.map((c) => (c.expr ? evaluate(c.expr, scopeOf(row)) : row.values[c.source!]!)),
    })),
  };
  trace?.({ kind: 'projected', relation: projected });

  if (stmt.distinct) {
    const seen = new Set<string>();
    const removed: string[] = [];
    const rows = projected.rows.filter((row) => {
      const key = row.values.map(valueKey).join('|');
      if (seen.has(key)) {
        removed.push(row.id);
        return false;
      }
      seen.add(key);
      return true;
    });
    const input = projected;
    projected = { columns: projected.columns, rows };
    trace?.({ kind: 'distinct', input, removed, relation: projected });
  }

  if (stmt.orderBy.length > 0) {
    const keyOf = stmt.orderBy.map(({ expr }) => {
      if (expr.type === 'literal' && typeof expr.value === 'number') {
        const position = expr.value;
        if (!Number.isInteger(position) || position < 1 || position > cols.length) {
          throw new SqlError(
            `ORDER BY position ${position} is out of range: the query returns ${cols.length} columns.`,
            'syntax',
            expr.line,
            expr.column,
          );
        }
        return (row: Row) => row.values[position - 1]!;
      }
      if (expr.type === 'column' && expr.table === undefined) {
        const index = cols.findIndex((c) => c.expr && c.name.toLowerCase() === expr.name.toLowerCase());
        if (index >= 0) return (row: Row) => row.values[index]!;
      }
      if (source.rows.length === 0) probe(expr, source, outer, db);
      return (row: Row) => evaluate(expr, scopeOf(sourceById.get(row.id)!));
    });
    const keyed = projected.rows.map((row) => ({ row, keys: keyOf.map((k) => k(row)) }));
    keyed.sort((a, b) => {
      for (let i = 0; i < keyOf.length; i++) {
        const c = compareValues(a.keys[i]!, b.keys[i]!);
        if (c !== 0) return stmt.orderBy[i]!.desc ? -c : c;
      }
      return 0;
    });
    const input = projected;
    projected = { columns: projected.columns, rows: keyed.map((k) => k.row) };
    trace?.({ kind: 'sorted', input, relation: projected });
  }

  if (stmt.limit) {
    const { count, offset } = stmt.limit;
    const input = projected;
    projected = { columns: projected.columns, rows: projected.rows.slice(offset, offset + count) };
    trace?.({ kind: 'limited', input, relation: projected });
  }

  return { columns: cols.map((c) => c.name), rows: projected.rows.map((row) => row.values) };
}

/** Parses and runs a query. Never throws. */
export function runQuery(db: Dataset, sql: string): RunResult {
  const parsed = parseQuery(sql);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, result: executeSelect(db, parsed.statement), statement: parsed.statement };
  } catch (error) {
    if (error instanceof SqlError) return { ok: false, error };
    throw error;
  }
}
