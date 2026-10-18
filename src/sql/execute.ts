import { caseParts, windowParts, type Cte, type Expr, type JoinClause, type SelectStatement, type SetOp, type TableRef } from './ast';
import { findTable, findView, type ColumnType, type Dataset, type ViewDef } from './datasets';
import { asSqlError, SqlError, suggest } from './errors';
import { aggregateValues, evaluate, evaluateTruth, referencedColumns, resolveColumn, windowKey, type ExecContext, type Scope } from './evaluate';
import { parseQuery } from './parse';
import { buildBTree, searchBTree, type BTree, type BTreeEntry } from './btree';
import { planSelect, type AccessPath } from './plan';
import { applyAffinity, compare, compareValues, formatValue, Real, toNumber, valueKey, type SqlValue, type Truth } from './values';

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
  /**
   * A table read through a created index: the B-tree, the nodes visited from the root, the leaf
   * entries looked at, and the rows found (`relation`). `examined` of `total` rows are read.
   */
  | {
      kind: 'index-search';
      table: string;
      label: string;
      index: string;
      condition: string;
      tree: BTree;
      path: string[];
      scanned: string[];
      rowids: string[];
      examined: number;
      total: number;
      relation: Relation;
    }
  /** A view read in FROM or JOIN: its query's rows. */
  | { kind: 'view'; name: string; relation: Relation }
  /** Rows sorted into a window's partitions; `label` names the PARTITION BY. */
  | { kind: 'window-partitions'; input: Relation; partitions: string[][]; label: string }
  /** One row's window values; `relation` builds the rows in partition order with the window columns filled so far. */
  | {
      kind: 'window-row';
      relation: () => Relation;
      row: string;
      partition: string;
      position: number;
      dependsOn: string[];
      columns: string[];
      values: SqlValue[];
      fn: string;
      detail: string;
    }
  /** Which branch of a SELECT column's CASE one row took. */
  | { kind: 'case-row'; input: Relation; row: string; branch: string; value: SqlValue; values: Record<string, string> }
  /** Round 0 is the anchor; the last round adds no rows. */
  | { kind: 'recursion-round'; name: string; round: number; read: Relation; added: Relation; total: Relation }
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

/**
 * Runs a view's query; its rows work like a table's for this query. A view can't refer to itself,
 * even through another view: CREATE VIEW runs its query, so everything it reads must exist already.
 */
export function viewRelation(db: Dataset, view: ViewDef, ctx?: ExecContext): Relation {
  const result = executeSelect(db, view.query, undefined, undefined, undefined, undefined, ctx);
  const names = view.columns ?? result.columns;
  return { columns: names.map((name) => ({ table: view.name, name })), rows: result.rows.map((values, i) => ({ id: `${view.name}#${i}`, values })) };
}

export function scan(db: Dataset, ref: TableRef, ctes?: ReadonlyMap<string, Relation>, ctx?: ExecContext): Relation {
  const cte = ctes?.get(ref.table.toLowerCase());
  if (cte) {
    const label = ref.alias ?? ref.table;
    return { columns: cte.columns.map((c) => ({ ...c, table: label })), rows: cte.rows };
  }
  const table = findTable(db, ref.table);
  const view = table ? undefined : findView(db, ref.table);
  if (view) {
    const relation = viewRelation(db, view, ctx);
    const label = ref.alias ?? view.name;
    return { columns: relation.columns.map((c) => ({ ...c, table: label })), rows: relation.rows };
  }
  if (!table) {
    const close = suggest(ref.table, [...db.tables.map((t) => t.name), ...(db.views ?? []).map((v) => v.name), ...(ctes ? [...ctes.keys()] : [])]);
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

/** A view read in FROM or JOIN gets its own step, as a CTE does. */
function traceView(env: Env, name: string, relation: Relation, trace?: Trace) {
  if (!trace || env.ctes?.has(name.toLowerCase()) || findTable(env.db, name)) return;
  const view = findView(env.db, name);
  if (view) trace({ kind: 'view', name: view.name, relation: { columns: relation.columns.map((c) => ({ ...c, table: view.name })), rows: relation.rows } });
}

/** Whether a planned path reads through an index made with CREATE INDEX; only those change how rows are read. */
const usesCreatedIndex = (path: AccessPath | undefined): path is Extract<AccessPath, { kind: 'search' | 'scan' }> & { index: NonNullable<unknown> } =>
  path !== undefined && path.kind !== 'rowid' && path.index !== undefined && !path.index.implicit;

/** A table's rows plus the index built over them, for one query. */
interface Indexed {
  relation: Relation;
  tree: BTree;
  path: Extract<AccessPath, { kind: 'search' | 'scan' }>;
}

function indexed(env: Env, ref: TableRef, path: Extract<AccessPath, { kind: 'search' | 'scan' }>): Indexed {
  const relation = scan(env.db, ref, env.ctes, env.ctx);
  const positions = path.index!.columns.map((c) => relation.columns.findIndex((col) => col.name.toLowerCase() === c.toLowerCase()));
  const entries: BTreeEntry[] = relation.rows.map((row) => ({ key: positions.map((p) => row.values[p]!), rowid: row.id }));
  return { relation, tree: buildBTree(entries), path };
}

/**
 * The rows an index gives for one search, in index order. Values are converted to the column's
 * type first, as SQLite compares a column with a value. `scope` supplies values from tables read
 * earlier in a join.
 */
function readIndexed(source: Indexed, scope: Scope, env: Env, trace?: Trace): Relation {
  const { relation, tree, path } = source;
  const byId = new Map(relation.rows.map((r) => [r.id, r]));
  if (path.kind === 'scan') {
    const order = tree.levels.at(-1)!.flatMap((id) => tree.nodes.get(id)!.entries.map((e) => e.rowid));
    return { columns: relation.columns, rows: order.map((id) => byId.get(id)!) };
  }
  const index = path.index!;
  const typeOf = (k: number) => relation.columns.find((c) => c.name.toLowerCase() === index.columns[k]!.toLowerCase())?.type ?? 'TEXT';
  const value = (e: Expr, k: number) => applyAffinity(evaluate(e, scope), typeOf(k));
  // Every combination of the IN values, in key order, as SQLite reads them.
  let prefixes: SqlValue[][] = [[]];
  path.equal.forEach((values, k) => {
    const sorted = [...new Map(values.map((e) => value(e, k)).map((v) => [valueKey(v), v])).values()].sort(compareValues);
    prefixes = prefixes.flatMap((p) => sorted.map((v) => [...p, v]));
  });
  const k = path.equal.length;
  const low = path.low && { value: value(path.low.expr, k), inclusive: path.low.inclusive };
  const high = path.high && { value: value(path.high.expr, k), inclusive: path.high.inclusive };
  const rowids: string[] = [];
  const scanned: string[] = [];
  let visited: string[] = [];
  for (const equal of prefixes) {
    const found = searchBTree(tree, { equal, ...(low && { low }), ...(high && { high }) });
    if (visited.length === 0) visited = found.path;
    scanned.push(...found.scanned.map((e) => e.rowid));
    for (const id of found.rowids) {
      tick(env);
      if (!rowids.includes(id)) rowids.push(id);
    }
  }
  const rows = rowids.map((id) => byId.get(id)!);
  const result = { columns: relation.columns, rows };
  const condition = [
    ...index.columns.slice(0, k).map((c, i) => (prefixes.length > 1 && path.equal[i]!.length > 1 ? `${c} IN (${path.equal[i]!.map((e) => formatValue(evaluate(e, scope))).join(', ')})` : `${c} = ${formatValue(prefixes[0]![i]!)}`)),
    ...(low ? [`${index.columns[k]} ${low.inclusive ? '>=' : '>'} ${formatValue(low.value)}`] : []),
    ...(high ? [`${index.columns[k]} ${high.inclusive ? '<=' : '<'} ${formatValue(high.value)}`] : []),
  ].join(' AND ');
  trace?.({
    kind: 'index-search',
    table: tableName(env, path.table),
    label: path.label,
    index: index.name,
    condition,
    tree,
    path: visited,
    scanned,
    rowids,
    examined: rowids.length,
    total: relation.rows.length,
    relation: result,
  });
  return result;
}

function join(left: Relation, clause: JoinClause, env: Env, trace?: Trace, path?: AccessPath): Relation {
  if (usesCreatedIndex(path) && path.kind === 'search') return indexedJoin(left, clause, env, indexed(env, clause, path), trace);
  const right = scan(env.db, clause, env.ctes, env.ctx);
  traceView(env, clause.table, right, trace);
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

/** A join whose inner table is searched through an index once per outer row, testing only the rows found. */
function indexedJoin(left: Relation, clause: JoinClause, env: Env, source: Indexed, trace?: Trace): Relation {
  const right = source.relation;
  trace?.({ kind: 'scan', table: tableName(env, clause.table), relation: right });
  const columns = [...left.columns, ...right.columns];
  if (left.rows.length === 0 || right.rows.length === 0) probe(clause.on, { columns, rows: [] }, env);
  const rows: Row[] = [];
  for (const l of left.rows) {
    const candidates = readIndexed(source, { columns: left.columns, row: l, ...env }, env, trace);
    let matched = false;
    for (const r of candidates.rows) {
      tick(env);
      const row = { id: `${l.id}+${r.id}`, values: [...l.values, ...r.values] };
      const outcome = evaluateTruth(clause.on, { columns, row, ...env });
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
    case 'window':
      children.push(...windowParts(expr));
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
    if (e.type === 'window' && insideAggregate) {
      throw new SqlError("Window functions can't be used inside aggregates.", 'syntax', e.line, e.column);
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
    case 'window':
      return { ...expr, args: expr.args.map(f), partitionBy: expr.partitionBy.map(f), orderBy: expr.orderBy.map((o) => ({ ...o, expr: f(o.expr) })) };
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
  ctx?: ExecContext,
): Map<string, Relation> {
  const bound = new Map(base ?? []);
  for (const cte of ctes) {
    if (refersTo(cte.query, cte.name)) {
      if (!cte.recursive) throw new SqlError('Add RECURSIVE to let a CTE refer to itself.', 'syntax', cte.line, cte.column);
      const relation = recursiveCte(db, cte, bound, outer, trace, ctx);
      bound.set(cte.name.toLowerCase(), relation);
      trace?.({ kind: 'cte', name: cte.name, relation });
      continue;
    }
    const result = executeSelect(db, cte.query, undefined, outer, undefined, bound, ctx);
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

/** The expressions of one SELECT (not of its compound parts or subqueries). */
function expressionsOf(stmt: SelectStatement): Expr[] {
  return [
    ...stmt.columns.flatMap((c) => (c.kind === 'expr' ? [c.expr] : [])),
    ...stmt.joins.map((j) => j.on),
    ...(stmt.where ? [stmt.where] : []),
    ...stmt.groupBy,
    ...(stmt.having ? [stmt.having] : []),
    ...stmt.orderBy.map((o) => o.expr),
  ];
}

/** Whether a SELECT reads `name` anywhere: FROM, JOIN, compound parts, CTE bodies or subqueries. */
function mentions(stmt: SelectStatement, name: string): boolean {
  if (refersTo(stmt, name)) return true;
  if ((stmt.with ?? []).some((c) => mentions(c.query, name)) || (stmt.compound ?? []).some((c) => mentions(c.select, name))) return true;
  let found = false;
  for (const expr of expressionsOf(stmt)) {
    walk(expr, (e) => {
      if ((e.type === 'subquery' || e.type === 'inSubquery') && mentions(e.query, name)) found = true;
    });
  }
  return found;
}

/** SQLite's rules for the recursive SELECT: no aggregates and no window functions. */
function checkRecursiveStep(step: SelectStatement) {
  for (const expr of expressionsOf(step)) {
    walk(expr, (e) => {
      if (e.type === 'aggregate') {
        throw new SqlError(`Aggregates like ${e.fn} can't be used in the recursive SELECT of a CTE.`, 'syntax', e.line, e.column);
      }
      if (e.type === 'window') throw new SqlError("Window functions can't be used in the recursive SELECT of a CTE.", 'syntax', e.line, e.column);
    });
  }
}

/** Most rounds and rows a recursive CTE may produce, so a recursion without an end cannot freeze the page. */
export const MAX_ROUNDS = 100;
export const MAX_RECURSIVE_ROWS = 1000;

/**
 * WITH RECURSIVE name AS (anchor UNION [ALL] step): the anchor runs once, then the step runs
 * again and again on the rows the previous round added, until a round adds nothing. With UNION,
 * rows already found are not added again, which also ends cycles.
 */
function recursiveCte(db: Dataset, cte: Cte, bound: Map<string, Relation>, outer?: Scope, trace?: Trace, ctx?: ExecContext): Relation {
  const parts = cte.query.compound ?? [];
  const anchor = { ...cte.query, compound: undefined, orderBy: [], limit: undefined } as SelectStatement;
  const step = parts[0]?.select;
  const references = (s: SelectStatement) =>
    [s.from?.table, ...s.joins.map((j) => j.table)].filter((t) => t?.toLowerCase() === cte.name.toLowerCase()).length;
  if (
    parts.length !== 1 ||
    !step ||
    mentions(anchor, cte.name) ||
    references(step) !== 1 ||
    (step.compound ?? []).length > 0 ||
    expressionsOf(step).some((expr) => {
      let inSubquery = false;
      walk(expr, (e) => {
        if ((e.type === 'subquery' || e.type === 'inSubquery') && mentions(e.query, cte.name)) inSubquery = true;
      });
      return inSubquery;
    }) ||
    (step.with ?? []).some((c) => mentions(c.query, cte.name))
  ) {
    throw new SqlError('A recursive CTE must refer to itself exactly once, in FROM or JOIN.', 'syntax', cte.line, cte.column);
  }
  checkRecursiveStep(step);
  const op = parts[0]!.op;
  if (op !== 'UNION' && op !== 'UNION ALL') {
    throw new SqlError('A recursive CTE joins its two SELECTs with UNION or UNION ALL.', 'syntax', parts[0]!.line, 1);
  }

  const anchorResult = executeSelect(db, anchor, undefined, outer, undefined, bound, ctx);
  cteRelation(cte, anchorResult.columns, []);
  const columns = cte.columns ?? anchorResult.columns;
  const all: Row[] = [];
  const seen = new Set<string>();
  const add = (values: SqlValue[]): Row | undefined => {
    const key = values.map(valueKey).join('|');
    if (op === 'UNION' && seen.has(key)) return undefined;
    seen.add(key);
    const row = { id: `${cte.name}#${all.length}`, values };
    all.push(row);
    return row;
  };
  const relationOf = (rows: Row[]) => cteRelation(cte, columns, rows);
  const guard = () => new SqlError('This recursion never stops on its own. Add a condition that ends it, such as WHERE n < 10.', 'limit', cte.line, cte.column);

  let working = anchorResult.rows.flatMap((values) => add(values) ?? []);
  trace?.({ kind: 'recursion-round', name: cte.name, round: 0, read: relationOf([]), added: relationOf(working), total: relationOf([...all]) });
  for (let round = 1; working.length > 0; round++) {
    if (round > MAX_ROUNDS) throw guard();
    const scope = new Map(bound).set(cte.name.toLowerCase(), relationOf(working));
    const result = executeSelect(db, step, undefined, outer, undefined, scope, ctx);
    if (result.columns.length !== columns.length) {
      throw new SqlError(
        `Each SELECT in a UNION must return the same number of columns: the first returns ${columns.length}, this one returns ${result.columns.length}.`,
        'syntax',
        parts[0]!.selectLine,
        parts[0]!.selectColumn,
      );
    }
    const read = working;
    working = result.rows.flatMap((values) => add(values) ?? []);
    if (all.length > MAX_RECURSIVE_ROWS) throw guard();
    trace?.({ kind: 'recursion-round', name: cte.name, round, read: relationOf(read), added: relationOf(working), total: relationOf([...all]) });
  }
  return relationOf(all);
}

export function executeSelect(
  db: Dataset,
  stmt: SelectStatement,
  trace?: Trace,
  outer?: Scope,
  correlation?: { used: boolean },
  ctes?: ReadonlyMap<string, Relation>,
  ctx?: ExecContext,
): QueryResult {
  // One budget for the whole query, shared by its CTEs, recursion rounds and UNION sides.
  const shared = outer?.ctx ?? ctx ?? { cache: new Map(), work: 0 };
  let inScope = ctes ?? outer?.ctes;
  if (stmt.with) inScope = bindCtes(db, stmt.with, inScope, outer, trace, shared);
  if (stmt.compound?.length) return executeCompound(db, stmt, trace, outer, correlation, inScope, shared);
  const env: Env = {
    outer,
    db,
    ctx: shared,
    ...(correlation && { correlation }),
    ...(inScope && { ctes: inScope }),
  };
  // Planning only matters when an index made with CREATE INDEX could be used.
  const paths = db.indexes?.length && stmt.from ? planSelect(db, stmt).paths : undefined;
  const pathOf = (ref: TableRef) => paths?.get((ref.alias ?? ref.table).toLowerCase());
  let relation: Relation = { columns: [], rows: [{ id: 'one', values: [] }] };
  if (stmt.from) {
    const path = pathOf(stmt.from);
    if (usesCreatedIndex(path)) {
      const source = indexed(env, stmt.from, path);
      trace?.({ kind: 'scan', table: tableName(env, stmt.from.table), relation: source.relation });
      relation = readIndexed(source, { columns: [], row: { id: 'one', values: [] }, ...env }, env, trace);
    } else {
      relation = scan(db, stmt.from, env.ctes, env.ctx);
      traceView(env, stmt.from.table, relation, trace);
      trace?.({ kind: 'scan', table: tableName(env, stmt.from.table), relation });
    }
  }
  for (const clause of stmt.joins) {
    rejectAggregate(clause.on, (fn) => `Aggregates like ${fn} can't be used in JOIN … ON.`);
    relation = join(relation, clause, env, trace, pathOf(clause));
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

  const windowExprs: Extract<Expr, { type: 'window' }>[] = [];
  for (const e of [...cols.flatMap((c) => (c.expr ? [c.expr] : [])), ...stmt.orderBy.map((o) => o.expr)]) {
    walk(e, (node) => {
      if (node.type === 'window') windowExprs.push(node);
    });
  }
  if (windowExprs.length > 0) {
    const windows = computeWindows(windowExprs, rows, scopeOf);
    const plain = scopeOf;
    scopeOf = (row) => ({ ...plain(row), windows });
    empty = { ...empty, windows };
    if (trace && !grouped) traceWindows(windowExprs[0]!, cols, filtered, rows, plain, scopeOf, trace);
  }
  if (rows.length === 0) for (const c of cols) if (c.expr) evaluate(c.expr, empty);
  const scopeById = new Map(rows.map((row) => [row.id, scopeOf(row)]));
  if (trace && !grouped) {
    let firstCase: Extract<Expr, { type: 'case' }> | undefined;
    for (const c of cols) {
      if (c.expr) {
        walk(c.expr, (node) => {
          if (node.type === 'case') firstCase ??= node;
        });
      }
    }
    if (firstCase) {
      for (const row of rows) {
        const scope = scopeById.get(row.id)!;
        trace({
          kind: 'case-row',
          input: filtered,
          row: row.id,
          branch: caseBranch(firstCase, scope),
          value: evaluate(firstCase, scope),
          values: referencedColumns(firstCase, scope),
        });
      }
    }
  }
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

/** Most window rows traced one by one; steps show at most this many anyway. */
const MAX_TRACED_WINDOW_ROWS = 400;

/** Steps for the first window function: its partitions, then each row's value and what it depends on. */
function traceWindows(
  expr: Extract<Expr, { type: 'window' }>,
  cols: Output[],
  input: Relation,
  rows: Row[],
  plain: (row: Row) => Scope,
  withWindows: (row: Row) => Scope,
  trace: Trace,
) {
  const partitions = windowPartitions(expr, rows, plain);
  const label = expr.partitionBy.length > 0 ? expr.partitionBy.map((p) => p.text).join(', ') : '';
  trace({ kind: 'window-partitions', input: { columns: input.columns, rows: partitions.flat() }, partitions: partitions.map((p) => p.map((r) => r.id)), label });
  const windowCols = cols.filter((c) => c.expr && findWindow(c.expr));
  const filled = new Map<string, SqlValue[]>();
  const order = partitions.flat();
  let traced = 0;
  const nameIndex = input.columns.findIndex((c) => c.name.toLowerCase() === 'name');
  const nameOf = (row: Row, position: number) => (nameIndex >= 0 ? formatValue(row.values[nameIndex]!) : `row ${position}`);
  for (const partition of partitions) {
    const keys = partition.map((row) => expr.orderBy.map((o) => evaluate(o.expr, plain(row))));
    const peer = (i: number) => keys[i]!.map(valueKey).join('|');
    const partitionName = label ? label + ' ' + expr.partitionBy.map((p) => formatValue(evaluate(p, plain(partition[0]!)))).join(', ') : 'All rows';
    partition.forEach((row, i) => {
      if (traced >= MAX_TRACED_WINDOW_ROWS) return;
      traced++;
      const values = windowCols.map((c) => evaluate(c.expr!, withWindows(row)));
      filled.set(row.id, values);
      const peers = partition.filter((_, k) => k !== i && peer(k) === peer(i));
      let dependsOn: Row[] = [];
      let detail = '';
      if (expr.fn === 'RANK' || expr.fn === 'DENSE_RANK') {
        dependsOn = peers;
        if (peers.length > 0) detail = `tied with ${peers.map((p) => nameOf(p, partition.indexOf(p) + 1)).join(', ')} on ${keys[i]!.map(formatValue).join(', ')}`;
      } else if (expr.fn === 'LAG' || expr.fn === 'LEAD') {
        const offset = expr.args[1] ? toNumber(evaluate(expr.args[1], plain(row))) ?? 1 : 1;
        const target = partition[expr.fn === 'LAG' ? i - offset : i + offset];
        dependsOn = target ? [target] : [];
        detail = target ? `from ${nameOf(target, partition.indexOf(target) + 1)}` : `no row ${offset} ${expr.fn === 'LAG' ? 'before' : 'after'}, so the default`;
      } else if (expr.fn !== 'ROW_NUMBER') {
        let last = i;
        while (last < partition.length - 1 && peer(last + 1) === peer(i)) last++;
        const frame = expr.orderBy.length > 0 ? partition.slice(0, last + 1) : partition;
        dependsOn = frame.filter((r) => r !== row);
        detail = `over ${frame.length} ${frame.length === 1 ? 'row' : 'rows'}`;
      }
      const done = traced;
      trace({
        kind: 'window-row',
        // Built only for the steps that are shown; the first `done` rows in partition order are filled.
        relation: () => ({
          columns: [...input.columns, ...windowCols.map((c) => ({ name: c.name }))],
          rows: order.map((r, k) => ({ id: r.id, values: [...r.values, ...(k < done ? filled.get(r.id)! : windowCols.map(() => ''))] })),
        }),
        row: row.id,
        partition: partitionName,
        position: i + 1,
        dependsOn: dependsOn.map((r) => r.id),
        columns: windowCols.map((c) => c.name),
        values,
        fn: expr.text.slice(0, expr.text.toUpperCase().indexOf(' OVER')).trim(),
        detail,
      });
    });
  }
}

function findWindow(expr: Expr): boolean {
  let found = false;
  walk(expr, (node) => {
    if (node.type === 'window') found = true;
  });
  return found;
}

/** Which branch a CASE takes for a row, in words. */
function caseBranch(expr: Extract<Expr, { type: 'case' }>, scope: Scope): string {
  const operand = expr.operand ? evaluate(expr.operand, scope) : undefined;
  for (const { when } of expr.whens) {
    if (expr.operand) {
      if (compare('=', operand!, evaluate(when, scope)) === true) return `WHEN ${when.text} matches`;
    } else if (evaluateTruth(when, scope) === true) {
      return `WHEN ${when.text} is true`;
    }
  }
  return expr.else ? 'ELSE' : 'no WHEN applies, so NULL';
}

const rowKey = (row: Row) => row.values.map(valueKey).join('|');

/**
 * Window function values, by windowKey and then row id. Rows are split into partitions in
 * first-seen order and sorted by the window's ORDER BY (ties keep their order). With ORDER BY,
 * an aggregate's frame runs from the partition start to the current row and its peers;
 * without ORDER BY it is the whole partition, as in SQLite.
 */
function computeWindows(
  exprs: Extract<Expr, { type: 'window' }>[],
  rows: Row[],
  scopeOf: (row: Row) => Scope,
): Map<string, Map<string, SqlValue>> {
  const result = new Map<string, Map<string, SqlValue>>();
  for (const expr of exprs) {
    const key = windowKey(expr);
    if (result.has(key)) continue;
    const values = new Map<string, SqlValue>();
    result.set(key, values);
    for (const partition of windowPartitions(expr, rows, scopeOf)) {
      const order = partition.map((row) => expr.orderBy.map((o) => evaluate(o.expr, scopeOf(row))));
      // Peers share ORDER BY values; find each row's peer group and dense rank in one pass.
      const keys = order.map((values) => values.map(valueKey).join('|'));
      const groupStart: number[] = [];
      const dense: number[] = [];
      keys.forEach((key, i) => {
        const same = i > 0 && keys[i - 1] === key;
        groupStart.push(same ? groupStart[i - 1]! : i);
        dense.push(i === 0 ? 1 : same ? dense[i - 1]! : dense[i - 1]! + 1);
      });
      const groupEnd: number[] = [];
      for (let i = keys.length - 1; i >= 0; i--) groupEnd[i] = i < keys.length - 1 && keys[i + 1] === keys[i] ? groupEnd[i + 1]! : i;
      partition.forEach((row, i) => {
        const scope = scopeOf(row);
        const first = groupStart[i]!;
        const last = groupEnd[i]!;
        let value: SqlValue;
        switch (expr.fn) {
          case 'ROW_NUMBER':
            value = i + 1;
            break;
          case 'RANK':
            value = first + 1;
            break;
          case 'DENSE_RANK':
            value = dense[i]!;
            break;
          case 'LAG':
          case 'LEAD': {
            const offset = expr.args[1] ? toNumber(evaluate(expr.args[1], scope)) ?? 1 : 1;
            const target = expr.fn === 'LAG' ? i - offset : i + offset;
            const other = partition[target];
            value = other ? evaluate(expr.args[0]!, scopeOf(other)) : expr.args[2] ? evaluate(expr.args[2], scope) : null;
            break;
          }
          default: {
            const frame = expr.orderBy.length > 0 ? partition.slice(0, last + 1) : partition;
            value = expr.star ? frame.length : aggregateValues(expr.fn, frame.map((r) => evaluate(expr.args[0]!, scopeOf(r))));
          }
        }
        values.set(row.id, value);
      });
    }
  }
  return result;
}

/** A window's rows split by PARTITION BY (first-seen order), each sorted by its ORDER BY. */
export function windowPartitions(expr: Extract<Expr, { type: 'window' }>, rows: Row[], scopeOf: (row: Row) => Scope): Row[][] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = expr.partitionBy.map((p) => valueKey(evaluate(p, scopeOf(row)))).join('|');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((partition) => {
    const keyed = partition.map((row) => ({ row, keys: expr.orderBy.map((o) => evaluate(o.expr, scopeOf(row))) }));
    keyed.sort((a, b) => {
      for (let k = 0; k < expr.orderBy.length; k++) {
        const c = compareValues(a.keys[k]!, b.keys[k]!);
        if (c !== 0) return expr.orderBy[k]!.desc ? -c : c;
      }
      return 0;
    });
    return keyed.map((k) => k.row);
  });
}

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
  ctx?: ExecContext,
): QueryResult {
  const sides = [{ ...stmt, with: undefined, compound: undefined, orderBy: [], limit: undefined } as SelectStatement, ...stmt.compound!.map((c) => c.select)];
  const results = sides.map((side) => executeSelect(db, side, undefined, outer, correlation, ctes, ctx));
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
