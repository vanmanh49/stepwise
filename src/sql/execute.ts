import { caseParts, type Cte, type Expr, type JoinClause, type SelectStatement, type SetOp, type TableRef } from './ast';
import { findTable, type ColumnType, type Dataset } from './datasets';
import { asSqlError, SqlError, suggest } from './errors';
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
  | { kind: 'limited'; input: Relation; relation: Relation }
  /** One SELECT of a compound, evaluated on its own; `op` joins it to the result so far. */
  | { kind: 'compound-side'; index: number; op?: SetOp; relation: Relation }
  /** Notes are keyed by row id, e.g. "duplicate, dropped". */
  | { kind: 'cte'; name: string; relation: Relation }
  | { kind: 'combined'; op: SetOp; left: Relation; right: Relation; relation: Relation; notes: Record<string, string> };

export type RunResult = { ok: true; result: QueryResult; statement: SelectStatement } | { ok: false; error: SqlError };

export type Trace = (event: TraceEvent) => void;

/** Largest relation a JOIN may build; the sample tables are tiny, so more means a missing condition. */
export const MAX_ROWS = 2000;
/** Row checks allowed per query, including subqueries, so a query can never freeze the page. */
export const MAX_WORK = 200_000;

/** Everything a scope needs except its columns and row. */
export type Env = Omit<Scope, 'columns' | 'row'>;

function tick(env: Env) {
  if (++env.ctx.work > MAX_WORK) {
    throw new SqlError(
      'This query does too much work for the practice database (over 200,000 row checks). Check your JOIN conditions and subqueries.',
      'limit',
      1,
      1,
    );
  }
}

/** How a stored number is read: REAL in a REAL column, and also whenever it is not whole (SQLite keeps 2.5 as REAL even in an INTEGER column). */
export function cellValue(v: number | string | null, type: ColumnType): SqlValue {
  return typeof v === 'number' && (type === 'REAL' || !Number.isInteger(v)) ? new Real(v) : v;
}

export function scan(db: Dataset, ref: TableRef, ctes?: ReadonlyMap<string, Relation>): Relation {
  const cte = ctes?.get(ref.table.toLowerCase());
  if (cte) {
    const label = ref.alias ?? ref.table;
    return { columns: cte.columns.map((c) => ({ ...c, table: label })), rows: cte.rows };
  }
  const table = findTable(db, ref.table);
  if (!table) {
    const close = suggest(ref.table, [...db.tables.map((t) => t.name), ...(ctes ? [...ctes.keys()] : [])]);
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
      id: table.rowIds?.[i] ?? `${table.name}#${i}`,
      values: values.map((v, c) => cellValue(v, table.columns[c]!.type)),
    })),
  };
}

export const nullRow = (columns: ColumnRef[]): Row => ({ id: 'probe', values: columns.map(() => null) });

/**
 * Evaluates `expr` once against a row of NULLs. Used when a relation is empty, so that
 * misspelled columns are still reported, as SQLite reports them before running.
 */
function probe(expr: Expr, relation: Relation, env: Env) {
  evaluate(expr, { columns: relation.columns, row: nullRow(relation.columns), ...env });
}

function join(left: Relation, clause: JoinClause, env: Env, trace?: Trace): Relation {
  const right = scan(env.db, clause, env.ctes);
  trace?.({ kind: 'scan', table: tableName(env, clause.table), relation: right });
  const columns = [...left.columns, ...right.columns];
  if (left.rows.length === 0 || right.rows.length === 0) probe(clause.on, { columns, rows: [] }, env);
  const rows: Row[] = [];
  const add = (row: Row) => {
    rows.push(row);
    if (rows.length > MAX_ROWS) {
      throw new SqlError(
        'This JOIN builds more than 2,000 rows. Check its ON condition: it should match related rows, such as o.customer_id = c.id.',
        'limit',
        clause.line,
        clause.column,
      );
    }
  };
  for (const l of left.rows) {
    let matched = false;
    for (const r of right.rows) {
      tick(env);
      const row = { id: `${l.id}+${r.id}`, values: [...l.values, ...r.values] };
      const outcome = evaluateTruth(clause.on, { columns, row, ...env });
      trace?.({ kind: 'join-test', join: clause, left, right, leftRow: l.id, rightRow: r.id, outcome });
      if (outcome) {
        matched = true;
        add(row);
      }
    }
    if (!matched && clause.kind === 'left') {
      trace?.({ kind: 'join-unmatched', join: clause, leftRow: l.id });
      add({ id: `${l.id}+null`, values: [...l.values, ...right.columns.map(() => null)] });
    }
  }
  const relation = { columns, rows };
  trace?.({ kind: 'joined', join: clause, relation });
  return relation;
}

/** Keeps the rows whose condition is true. `scopeOf` decides what a row can see (a source row or a group). */
export function filter(
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
    tick(scope);
    const outcome = evaluateTruth(condition, scope);
    trace?.({ kind: 'filter-test', clause, input, row: row.id, outcome, values: referencedColumns(condition, scope) });
    return outcome === true;
  });
  const relation = { columns: input.columns, rows };
  trace?.({ kind: 'filtered', clause, relation });
  return relation;
}

/** Calls `visit` on every node of `expr`, without entering subqueries. Returning false skips a node's children. */
function walk(expr: Expr, visit: (e: Expr, insideAggregate: boolean) => void | false, insideAggregate = false) {
  if (visit(expr, insideAggregate) === false) return;
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
    case 'case':
      children.push(...caseParts(expr));
      break;
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

const sameText = (a: Expr, b: Expr) => a.text.replace(/\s+/g, ' ').toLowerCase() === b.text.replace(/\s+/g, ' ').toLowerCase();

/**
 * In a grouped query every column outside an aggregate must be grouped, or sit inside an
 * expression that is grouped. SQLite would pick an arbitrary row instead; rejecting it
 * teaches the rule other databases enforce.
 */
function checkGrouping(stmt: SelectStatement, groupBy: Expr[], having: Expr | undefined, cols: Output[], base: Scope) {
  const ungrouped = (name: string, line: number, column: number) =>
    new SqlError(`\`${name}\` must appear in GROUP BY or be used in an aggregate such as COUNT or MAX.`, 'name', line, column);
  const groupedIndexes = new Set(
    groupBy.flatMap((g) => {
      if (g.type !== 'column') return [];
      const resolved = resolveColumn(g, base);
      return resolved.scope === base ? [resolved.index] : [];
    }),
  );
  const check = (expr: Expr) =>
    walk(expr, (e, insideAggregate) => {
      if (insideAggregate) return;
      if (groupBy.some((g) => sameText(g, e))) return false;
      if (e.type !== 'column') return;
      const resolved = resolveColumn(e, base);
      if (resolved.scope !== base || groupedIndexes.has(resolved.index)) return;
      throw ungrouped(e.text, e.line, e.column);
    });
  for (const c of cols) {
    if (c.expr) check(c.expr);
    else if (!groupedIndexes.has(c.source!)) throw ungrouped(c.name, stmt.lines.SELECT ?? 1, 1);
  }
  if (having) check(having);
  for (const { expr } of stmt.orderBy) {
    const byPosition = expr.type === 'literal';
    const byAlias = expr.type === 'column' && expr.table === undefined && cols.some((c) => c.expr && c.name.toLowerCase() === expr.name.toLowerCase());
    if (!byPosition && !byAlias) check(expr);
  }
}

/** Rebuilds `expr` with `f` applied to each direct child, without entering subqueries. */
function mapChildren(expr: Expr, f: (e: Expr) => Expr): Expr {
  switch (expr.type) {
    case 'unary':
    case 'isNull':
    case 'inSubquery':
      return { ...expr, operand: f(expr.operand) };
    case 'binary':
      return { ...expr, left: f(expr.left), right: f(expr.right) };
    case 'between':
      return { ...expr, operand: f(expr.operand), low: f(expr.low), high: f(expr.high) };
    case 'like':
      return { ...expr, operand: f(expr.operand), pattern: f(expr.pattern) };
    case 'inList':
      return { ...expr, operand: f(expr.operand), items: expr.items.map(f) };
    case 'aggregate':
      return expr.arg === '*' ? expr : { ...expr, arg: f(expr.arg) };
    case 'case':
      return {
        ...expr,
        ...(expr.operand && { operand: f(expr.operand) }),
        whens: expr.whens.map((w) => ({ when: f(w.when), then: f(w.then) })),
        ...(expr.else && { else: f(expr.else) }),
      };
    default:
      return expr;
  }
}

/** As in SQLite, GROUP BY and HAVING may name a SELECT alias when no table column has that name. */
function substituteAliases(expr: Expr, aliases: Map<string, Expr>, columns: ColumnRef[]): Expr {
  if (expr.type === 'column') {
    if (expr.table !== undefined) return expr;
    const name = expr.name.toLowerCase();
    return columns.some((c) => c.name.toLowerCase() === name) ? expr : (aliases.get(name) ?? expr);
  }
  return mapChildren(expr, (e) => substituteAliases(e, aliases, columns));
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
/** The name to show for a table or CTE in steps. */
function tableName(env: Env, name: string): string {
  return env.ctes?.has(name.toLowerCase()) ? name : (findTable(env.db, name)?.name ?? name);
}

/** Whether a SELECT reads `name` in its FROM or JOINs, or in another SELECT of its compound. */
function refersTo(stmt: SelectStatement, name: string): boolean {
  const same = (table: string) => table.toLowerCase() === name.toLowerCase();
  return (
    (stmt.from !== undefined && same(stmt.from.table)) ||
    stmt.joins.some((j) => same(j.table)) ||
    (stmt.compound ?? []).some((c) => refersTo(c.select, name))
  );
}

/** Evaluates WITH clauses in order; each sees the ones before it. */
export function bindCtes(
  db: Dataset,
  ctes: Cte[],
  base?: ReadonlyMap<string, Relation>,
  outer?: Scope,
  trace?: Trace,
): Map<string, Relation> {
  const bound = new Map(base ?? []);
  for (const cte of ctes) {
    if (refersTo(cte.query, cte.name)) {
      if (!cte.recursive) throw new SqlError('Add RECURSIVE to let a CTE refer to itself.', 'syntax', cte.line, cte.column);
      bound.set(cte.name.toLowerCase(), recursiveCte(db, cte, bound, outer, trace));
      continue;
    }
    const result = executeSelect(db, cte.query, undefined, outer, undefined, bound);
    const relation = cteRelation(cte, result.columns, result.rows.map((values, i) => ({ id: `${cte.name}#${i}`, values })));
    bound.set(cte.name.toLowerCase(), relation);
    trace?.({ kind: 'cte', name: cte.name, relation });
  }
  return bound;
}

function cteRelation(cte: Cte, columns: string[], rows: Row[]): Relation {
  if (cte.columns && cte.columns.length !== columns.length) {
    throw new SqlError(
      `CTE \`${cte.name}\` lists ${cte.columns.length} columns but its SELECT returns ${columns.length}.`,
      'syntax',
      cte.line,
      cte.column,
    );
  }
  return { columns: (cte.columns ?? columns).map((name) => ({ table: cte.name, name })), rows };
}

/** Placeholder until WITH RECURSIVE is supported. */
function recursiveCte(_db: Dataset, cte: Cte, _bound: Map<string, Relation>, _outer?: Scope, _trace?: Trace): Relation {
  throw new SqlError('`WITH RECURSIVE` isn\'t supported here yet.', 'unsupported', cte.line, cte.column);
}

export function executeSelect(
  db: Dataset,
  stmt: SelectStatement,
  trace?: Trace,
  outer?: Scope,
  correlation?: { used: boolean },
  ctes?: ReadonlyMap<string, Relation>,
): QueryResult {
  let inScope = ctes ?? outer?.ctes;
  if (stmt.with) inScope = bindCtes(db, stmt.with, inScope, outer, trace);
  if (stmt.compound?.length) return executeCompound(db, stmt, trace, outer, correlation, inScope);
  const env: Env = {
    outer,
    db,
    ctx: outer?.ctx ?? { cache: new Map(), work: 0 },
    ...(correlation && { correlation }),
    ...(inScope && { ctes: inScope }),
  };
  let relation: Relation = { columns: [], rows: [{ id: 'one', values: [] }] };
  if (stmt.from) {
    relation = scan(db, stmt.from, env.ctes);
    trace?.({ kind: 'scan', table: tableName(env, stmt.from.table), relation });
  }
  for (const clause of stmt.joins) {
    rejectAggregate(clause.on, (fn) => `Aggregates like ${fn} can't be used in JOIN … ON.`);
    relation = join(relation, clause, env, trace);
  }

  const source = relation;
  const sourceScope = (row: Row): Scope => ({ columns: source.columns, row, ...env });
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
    const aliases = new Map(cols.flatMap((c) => (c.expr ? [[c.name.toLowerCase(), c.expr] as const] : [])));
    const groupBy = stmt.groupBy.map((g) => {
      if (g.type === 'literal' && typeof g.value === 'number') {
        const position = g.value;
        if (!Number.isInteger(position) || position < 1 || position > cols.length) {
          throw new SqlError(
            `GROUP BY position ${position} is out of range: the query returns ${cols.length} ${cols.length === 1 ? 'column' : 'columns'}.`,
            'syntax',
            g.line,
            g.column,
          );
        }
        const target = cols[position - 1]!;
        if (target.expr) return target.expr;
        const ref = source.columns[target.source!]!;
        return { type: 'column', table: ref.table, name: ref.name, text: ref.name, line: g.line, column: g.column } as Expr;
      }
      return substituteAliases(g, aliases, source.columns);
    });
    const having = stmt.having && substituteAliases(stmt.having, aliases, source.columns);
    for (const g of groupBy) rejectAggregate(g, (fn) => `Aggregates like ${fn} can't be used in GROUP BY.`);
    checkGrouping(stmt, groupBy, having, cols, sourceScope(nulls));
    if (filtered.rows.length === 0) for (const g of groupBy) evaluate(g, sourceScope(nulls));

    const groups = new Map<string, { key: SqlValue[]; members: Row[] }>();
    if (groupBy.length === 0) groups.set('', { key: [], members: filtered.rows });
    for (const row of groupBy.length > 0 ? filtered.rows : []) {
      const key = groupBy.map((g) => evaluate(g, sourceScope(row)));
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

    const groupedRelation: Relation = { columns: groupBy.map((g) => ({ name: g.text })), rows };
    if (groupBy.length > 0) {
      trace?.({
        kind: 'grouped',
        input: filtered,
        groups: [...groups.values()].map((g) => ({ key: g.key, rowIds: g.members.map((m) => m.id) })),
        relation: groupedRelation,
      });
    }
    if (having) rows = filter('HAVING', having, groupedRelation, scopeOf, empty, trace).rows;
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

const rowKey = (row: Row) => row.values.map(valueKey).join('|');

/** Combines two relations with a set operator; `notes` explains what happened to each input row. */
function combine(op: SetOp, left: Relation, right: Relation): { relation: Relation; notes: Record<string, string> } {
  const notes: Record<string, string> = {};
  const rightKeys = new Set(right.rows.map(rowKey));
  const seen = new Set<string>();
  const rows: Row[] = [];
  const keepOnce = (row: Row, note: string) => {
    const key = rowKey(row);
    if (seen.has(key)) {
      notes[row.id] = 'duplicate, dropped';
      return;
    }
    seen.add(key);
    rows.push(row);
    notes[row.id] = note;
  };
  if (op === 'UNION ALL') {
    for (const row of [...left.rows, ...right.rows]) {
      rows.push(row);
      notes[row.id] = 'kept';
    }
  } else if (op === 'UNION') {
    for (const row of [...left.rows, ...right.rows]) keepOnce(row, 'kept');
  } else {
    for (const row of left.rows) {
      const inRight = rightKeys.has(rowKey(row));
      if (op === 'INTERSECT' ? inRight : !inRight) keepOnce(row, op === 'INTERSECT' ? 'in both' : 'kept');
      else notes[row.id] = op === 'INTERSECT' ? 'only in left' : 'also in right, removed';
    }
  }
  return { relation: { columns: left.columns, rows }, notes };
}

/** A UNION, INTERSECT or EXCEPT: each SELECT on its own, combined left to right, then sorted and limited as a whole. */
function executeCompound(
  db: Dataset,
  stmt: SelectStatement,
  trace?: Trace,
  outer?: Scope,
  correlation?: { used: boolean },
  ctes?: ReadonlyMap<string, Relation>,
): QueryResult {
  const sides = [{ ...stmt, with: undefined, compound: undefined, orderBy: [], limit: undefined } as SelectStatement, ...stmt.compound!.map((c) => c.select)];
  const results = sides.map((side) => executeSelect(db, side, undefined, outer, correlation, ctes));
  const width = results[0]!.columns.length;
  stmt.compound!.forEach((part, i) => {
    const count = results[i + 1]!.columns.length;
    if (count !== width) {
      throw new SqlError(
        `Each SELECT in a UNION must return the same number of columns: the first returns ${width}, this one returns ${count}.`,
        'syntax',
        part.selectLine,
        part.selectColumn,
      );
    }
  });
  const toRelation = (result: QueryResult, side: number): Relation => ({
    columns: results[0]!.columns.map((name) => ({ name })),
    rows: result.rows.map((values, i) => ({ id: `select${side + 1}#${i}`, values })),
  });
  let relation = toRelation(results[0]!, 0);
  trace?.({ kind: 'compound-side', index: 0, relation });
  stmt.compound!.forEach((part, i) => {
    const right = toRelation(results[i + 1]!, i + 1);
    trace?.({ kind: 'compound-side', index: i + 1, op: part.op, relation: right });
    const { relation: next, notes } = combine(part.op, relation, right);
    trace?.({ kind: 'combined', op: part.op, left: relation, right, relation: next, notes });
    relation = next;
  });

  if (stmt.orderBy.length > 0) {
    const names = results[0]!.columns.map((c) => c.toLowerCase());
    const indexes = stmt.orderBy.map(({ expr }) => {
      if (expr.type === 'literal' && typeof expr.value === 'number' && Number.isInteger(expr.value) && expr.value >= 1 && expr.value <= width) {
        return expr.value - 1;
      }
      const i = expr.type === 'column' && expr.table === undefined ? names.indexOf(expr.name.toLowerCase()) : -1;
      if (i < 0) throw new SqlError('ORDER BY after UNION can only name a result column or its position.', 'syntax', expr.line, expr.column);
      return i;
    });
    const input = relation;
    const rows = [...relation.rows].sort((a, b) => {
      for (let k = 0; k < indexes.length; k++) {
        const c = compareValues(a.values[indexes[k]!]!, b.values[indexes[k]!]!);
        if (c !== 0) return stmt.orderBy[k]!.desc ? -c : c;
      }
      return 0;
    });
    relation = { columns: relation.columns, rows };
    trace?.({ kind: 'sorted', input, relation });
  }
  if (stmt.limit) {
    const input = relation;
    relation = { columns: relation.columns, rows: relation.rows.slice(stmt.limit.offset, stmt.limit.offset + stmt.limit.count) };
    trace?.({ kind: 'limited', input, relation });
  }
  return { columns: results[0]!.columns, rows: relation.rows.map((r) => r.values) };
}

/** Parses and runs a query. Never throws. */
export function runQuery(db: Dataset, sql: string): RunResult {
  const parsed = parseQuery(sql);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, result: executeSelect(db, parsed.statement), statement: parsed.statement };
  } catch (error) {
    return { ok: false, error: asSqlError(error) };
  }
}
