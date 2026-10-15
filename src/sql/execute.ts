import type { Expr, JoinClause, SelectStatement, TableRef } from './ast';
import { findTable, type ColumnType, type Dataset } from './datasets';
import { SqlError, suggest } from './errors';
import { evaluate, evaluateTruth, referencedColumns, resolveColumn, type Scope } from './evaluate';
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

/** Keeps the rows whose condition is true. `scopeOf` decides what a row can see (a source row or a group). */
function filter(
  clause: 'WHERE' | 'HAVING',
  condition: Expr,
  input: Relation,
  scopeOf: (row: Row) => Scope,
  empty: Scope,
  trace?: Trace,
): Relation {
  if (input.rows.length === 0) evaluate(condition, empty);
  const rows = input.rows.filter((row) => {
    const scope = scopeOf(row);
    const outcome = evaluateTruth(condition, scope);
    trace?.({ kind: 'filter-test', clause, input, row: row.id, outcome, values: referencedColumns(condition, scope) });
    return outcome === true;
  });
  const relation = { columns: input.columns, rows };
  trace?.({ kind: 'filtered', clause, relation });
  return relation;
}

/** Calls `visit` on every node of `expr`, without entering subqueries. */
function walk(expr: Expr, visit: (e: Expr, insideAggregate: boolean) => void, insideAggregate = false) {
  visit(expr, insideAggregate);
  const children: Expr[] = [];
  switch (expr.type) {
    case 'unary':
    case 'isNull':
    case 'inSubquery':
      children.push(expr.operand);
      break;
    case 'binary':
      children.push(expr.left, expr.right);
      break;
    case 'between':
      children.push(expr.operand, expr.low, expr.high);
      break;
    case 'like':
      children.push(expr.operand, expr.pattern);
      break;
    case 'inList':
      children.push(expr.operand, ...expr.items);
      break;
    case 'aggregate':
      if (expr.arg !== '*') walk(expr.arg, visit, true);
      return;
    default:
      return;
  }
  for (const child of children) walk(child, visit, insideAggregate);
}

function findAggregate(expr: Expr | undefined): Extract<Expr, { type: 'aggregate' }> | undefined {
  let found: Extract<Expr, { type: 'aggregate' }> | undefined;
  if (expr) {
    walk(expr, (e) => {
      if (e.type === 'aggregate') found ??= e;
    });
  }
  return found;
}

function rejectAggregate(expr: Expr | undefined, message: (fn: string) => string) {
  const found = findAggregate(expr);
  if (found) throw new SqlError(message(found.fn), 'syntax', found.line, found.column);
}

function rejectNested(expr: Expr) {
  walk(expr, (e, insideAggregate) => {
    if (e.type === 'aggregate' && insideAggregate) {
      throw new SqlError("Aggregates can't be nested.", 'syntax', e.line, e.column);
    }
  });
}

/**
 * In a grouped query every column outside an aggregate must be grouped. SQLite would pick
 * an arbitrary row instead; rejecting it teaches the rule other databases enforce.
 */
function checkGrouping(stmt: SelectStatement, cols: Output[], base: Scope) {
  const ungrouped = (name: string, line: number, column: number) =>
    new SqlError(`\`${name}\` must appear in GROUP BY or be used in an aggregate such as COUNT or MAX.`, 'name', line, column);
  const groupedIndexes = new Set(
    stmt.groupBy.flatMap((g) => {
      if (g.type !== 'column') return [];
      const resolved = resolveColumn(g, base);
      return resolved.scope === base ? [resolved.index] : [];
    }),
  );
  const check = (expr: Expr) =>
    walk(expr, (e, insideAggregate) => {
      if (e.type !== 'column' || insideAggregate) return;
      if (stmt.groupBy.some((g) => g.text.toLowerCase() === e.text.toLowerCase())) return;
      const resolved = resolveColumn(e, base);
      if (resolved.scope !== base || groupedIndexes.has(resolved.index)) return;
      throw ungrouped(e.text, e.line, e.column);
    });
  for (const c of cols) {
    if (c.expr) check(c.expr);
    else if (!groupedIndexes.has(c.source!)) throw ungrouped(c.name, stmt.lines.SELECT ?? 1, 1);
  }
  if (stmt.having) check(stmt.having);
  for (const { expr } of stmt.orderBy) {
    const byPosition = expr.type === 'literal';
    const byAlias = expr.type === 'column' && expr.table === undefined && cols.some((c) => c.expr && c.name.toLowerCase() === expr.name.toLowerCase());
    if (!byPosition && !byAlias) check(expr);
  }
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
  for (const clause of stmt.joins) {
    rejectAggregate(clause.on, (fn) => `Aggregates like ${fn} can't be used in JOIN … ON.`);
    relation = join(db, relation, clause, outer, trace);
  }

  const source = relation;
  const sourceScope = (row: Row): Scope => ({ columns: source.columns, row, outer, db });
  const nulls = nullRow(source.columns);
  if (stmt.where) {
    rejectAggregate(
      stmt.where,
      (fn) => `Aggregates like ${fn} can't be used in WHERE, which runs before rows are grouped. Use HAVING instead.`,
    );
    relation = filter('WHERE', stmt.where, source, sourceScope, sourceScope(nulls), trace);
  }
  const filtered = relation;

  const cols = outputs(stmt, filtered);
  const expressions = [...cols.flatMap((c) => (c.expr ? [c.expr] : [])), ...(stmt.having ? [stmt.having] : []), ...stmt.orderBy.map((o) => o.expr)];
  expressions.forEach(rejectNested);
  const grouped = stmt.groupBy.length > 0 || stmt.having !== undefined || expressions.some((e) => findAggregate(e));

  let rows: Row[];
  let scopeOf: (row: Row) => Scope;
  let empty: Scope;
  if (!grouped) {
    rows = filtered.rows;
    scopeOf = sourceScope;
    empty = sourceScope(nulls);
  } else {
    for (const g of stmt.groupBy) rejectAggregate(g, (fn) => `Aggregates like ${fn} can't be used in GROUP BY.`);
    checkGrouping(stmt, cols, sourceScope(nulls));
    if (filtered.rows.length === 0) for (const g of stmt.groupBy) evaluate(g, sourceScope(nulls));

    const groups = new Map<string, { key: SqlValue[]; members: Row[] }>();
    if (stmt.groupBy.length === 0) groups.set('', { key: [], members: filtered.rows });
    for (const row of stmt.groupBy.length > 0 ? filtered.rows : []) {
      const key = stmt.groupBy.map((g) => evaluate(g, sourceScope(row)));
      const k = key.map(valueKey).join('|');
      const group = groups.get(k);
      if (group) group.members.push(row);
      else groups.set(k, { key, members: [row] });
    }
    // A group row shows its key; its scope sees the first member's columns and all members for aggregates.
    const groupScope = (members: Row[], id: string): Scope =>
      sourceScope({ id, values: members[0]?.values ?? nulls.values, members });
    const scopes = new Map<string, Scope>();
    rows = [...groups.values()].map((g, i) => {
      const id = `group#${i + 1}`;
      scopes.set(id, groupScope(g.members, id));
      return { id, values: g.key, members: g.members };
    });
    scopeOf = (row) => scopes.get(row.id)!;
    empty = groupScope([], 'probe');

    const groupedRelation: Relation = { columns: stmt.groupBy.map((g) => ({ name: g.text })), rows };
    if (stmt.groupBy.length > 0) {
      trace?.({
        kind: 'grouped',
        input: filtered,
        groups: [...groups.values()].map((g) => ({ key: g.key, rowIds: g.members.map((m) => m.id) })),
        relation: groupedRelation,
      });
    }
    if (stmt.having) rows = filter('HAVING', stmt.having, groupedRelation, scopeOf, empty, trace).rows;
  }

  if (rows.length === 0) for (const c of cols) if (c.expr) evaluate(c.expr, empty);
  const scopeById = new Map(rows.map((row) => [row.id, scopeOf(row)]));
  let projected: Relation = {
    columns: cols.map((c) => ({ name: c.name })),
    rows: rows.map((row) => {
      const scope = scopeById.get(row.id)!;
      return { id: row.id, values: cols.map((c) => (c.expr ? evaluate(c.expr, scope) : scope.row.values[c.source!]!)) };
    }),
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
      if (rows.length === 0) evaluate(expr, empty);
      return (row: Row) => evaluate(expr, scopeById.get(row.id)!);
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
