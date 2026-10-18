import { exprChildren, type Cte, type Expr, type SelectStatement, type TableRef } from './ast';
import { findTable, findView, indexesOf, type Dataset, type IndexDef } from './datasets';
import { isRowidAlias } from './schema';

/** How one table of a query is read. Labels are the alias, or the table name. */
export type AccessPath =
  | { kind: 'scan'; label: string; table: string; index?: IndexDef; covering: boolean }
  | { kind: 'rowid'; label: string; table: string; equal: Expr[]; low?: Bound; high?: Bound }
  | { kind: 'search'; label: string; table: string; index: IndexDef; covering: boolean; equal: Expr[][]; low?: Bound; high?: Bound };

export interface Bound {
  expr: Expr;
  inclusive: boolean;
}

/** One line of EXPLAIN QUERY PLAN: `parent` 0 is the top. */
export interface PlanEntry {
  id: number;
  parent: number;
  detail: string;
}

/** A FROM or JOIN item as the planner sees it. */
interface Source {
  ref: TableRef;
  label: string;
  left: boolean;
  on?: Expr;
  /** Column names, lower-case. */
  columns: string[];
  table?: { name: string; rowid?: string; indexes: IndexDef[] };
  /** A CTE or view: its query, unless it is inlined. */
  body?: SelectStatement;
  recursive?: Cte;
}

interface Term {
  column: string;
  op: '=' | '<' | '<=' | '>' | '>=';
  value: Expr;
}

/** A CTE or view in scope. `rows` marks a recursive CTE inside its own step, where it reads the rows found so far. */
type Named = { name: string; columns?: string[]; query: SelectStatement; recursive?: Cte; rows?: boolean };

const lower = (s: string) => s.toLowerCase();
const RANGE_FLIP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' } as const;

/** Every node of an expression, without entering subqueries. */
function nodes(expr: Expr | undefined): Expr[] {
  if (!expr) return [];
  return [expr, ...exprChildren(expr).flatMap(nodes)];
}

function andTerms(expr: Expr | undefined): Expr[] {
  if (!expr) return [];
  return expr.type === 'binary' && expr.op === 'AND' ? [...andTerms(expr.left), ...andTerms(expr.right)] : [expr];
}

/** The expressions of one SELECT (not of its compound parts), in the order SQLite numbers subqueries. */
function expressionsOf(stmt: SelectStatement): Expr[] {
  return [
    ...stmt.columns.flatMap((c) => (c.kind === 'expr' ? [c.expr] : [])),
    ...(stmt.where ? [stmt.where] : []),
    ...stmt.joins.map((j) => j.on),
    ...stmt.groupBy,
    ...(stmt.having ? [stmt.having] : []),
    ...stmt.orderBy.map((o) => o.expr),
  ];
}

const isAggregateQuery = (stmt: SelectStatement) =>
  stmt.groupBy.length > 0 || stmt.having !== undefined || expressionsOf(stmt).some((e) => nodes(e).some((n) => n.type === 'aggregate' || n.type === 'window'));

/** A CTE or view that SQLite merges into the outer query instead of running on its own. */
const inlinable = (q: SelectStatement) =>
  !q.compound?.length && !q.with?.length && !q.distinct && q.from !== undefined && !isAggregateQuery(q);

class Planner {
  readonly entries: PlanEntry[] = [];
  private nextId = 1;
  private subqueries = 0;

  constructor(private readonly db: Dataset) {}

  add(parent: number, detail: string): number {
    const id = this.nextId++;
    this.entries.push({ id, parent, detail });
    return id;
  }

  /** Plans a whole SELECT, including its compound parts. Returns the top-level access paths. */
  select(stmt: SelectStatement, parent: number, named: Map<string, Named>, outer: Source[]): Map<string, AccessPath> {
    const scope = new Map(named);
    for (const cte of stmt.with ?? []) {
      scope.set(lower(cte.name), { name: cte.name, ...(cte.columns && { columns: cte.columns }), query: cte.query, ...(cte.recursive && { recursive: cte }) });
    }
    if (!stmt.compound?.length) return this.core(stmt, parent, scope, outer).paths;
    const sides = [{ ...stmt, compound: undefined, orderBy: [], limit: undefined, with: undefined } as SelectStatement, ...stmt.compound.map((c) => c.select)];
    const ops = stmt.compound.map((c) => c.op);
    if (sides.length === 2 && ops[0] !== 'UNION ALL') {
      const merge = this.add(parent, `MERGE (${ops[0]})`);
      for (const [i, side] of sides.entries()) {
        const at = this.add(merge, i === 0 ? 'LEFT' : 'RIGHT');
        const { delivered } = this.core(side, at, scope, outer);
        // Each side is sorted on all its columns, unless its rows already come in that order.
        const wanted = side.columns.map((c) => (c.kind === 'expr' && c.expr.type === 'column' ? lower(c.expr.name) : '*'));
        if (!wanted.every((name, k) => delivered[k] === name)) this.add(at, 'USE TEMP B-TREE FOR ORDER BY');
      }
      return new Map();
    }
    const compound = this.add(parent, 'COMPOUND QUERY');
    sides.forEach((side, i) => this.core(side, this.add(compound, i === 0 ? 'LEFT-MOST SUBQUERY' : ops[i - 1]!), scope, outer));
    return new Map();
  }

  private sourcesOf(stmt: SelectStatement, named: Map<string, Named>): Source[] {
    const items: { ref: TableRef; left: boolean; on?: Expr }[] = [
      ...(stmt.from ? [{ ref: stmt.from, left: false }] : []),
      ...stmt.joins.map((j) => ({ ref: j as TableRef, left: j.kind === 'left', on: j.on })),
    ];
    return items.map(({ ref, left, on }) => {
      const label = ref.alias ?? ref.table;
      const base = { ref, label, left, ...(on && { on }) };
      const cte = named.get(lower(ref.table));
      const view = cte ? undefined : findView(this.db, ref.table);
      const body = cte ?? (view && { name: view.name, ...(view.columns && { columns: view.columns }), query: view.query });
      if (cte?.rows) return { ...base, columns: this.outputNames(cte, named) };
      if (body) return { ...base, columns: this.outputNames(body, named), body: body.query, ...(body.recursive && { recursive: body.recursive }) };
      const table = findTable(this.db, ref.table);
      if (!table) return { ...base, columns: [] };
      return {
        ...base,
        columns: table.columns.map((c) => lower(c.name)),
        table: { name: table.name, rowid: isRowidAlias(table) && lower(isRowidAlias(table)!), indexes: indexesOf(this.db, table.name) } as Source['table'],
      };
    });
  }

  private outputNames(named: Named, scope: Map<string, Named>): string[] {
    if (named.columns) return named.columns.map(lower);
    const q = named.query;
    const sources = this.sourcesOf(q, scope);
    return q.columns.flatMap((c) => {
      if (c.kind === 'star') return sources.filter((s) => !c.table || lower(s.label) === lower(c.table)).flatMap((s) => s.columns);
      return [lower(c.alias ?? (c.expr.type === 'column' ? c.expr.name : c.expr.text))];
    });
  }

  /** The source a column reference belongs to, among `sources` (then outer queries). */
  private owner(expr: Extract<Expr, { type: 'column' }>, sources: Source[]): Source | undefined {
    if (expr.table) return sources.find((s) => lower(s.label) === lower(expr.table!));
    const name = lower(expr.name);
    return sources.find((s) => s.columns.includes(name) || s.table?.rowid === name);
  }

  /** Plans one SELECT; `delivered` is the column order its rows come out in (lower-case names). */
  private core(stmt: SelectStatement, parent: number, named: Map<string, Named>, outer: Source[]): { paths: Map<string, AccessPath>; delivered: string[] } {
    const sources = this.sourcesOf(stmt, named);
    const all = [...sources, ...outer];
    const paths = new Map<string, AccessPath>();
    const counts = new Map<string, number>();
    for (const s of sources) if (s.body && !(inlinable(s.body) && !s.recursive)) counts.set(lower(s.ref.table), (counts.get(lower(s.ref.table)) ?? 0) + 1);

    // CTEs and views that run on their own come first, as SQLite lists them.
    const opened = new Set<string>();
    for (const s of sources) {
      if (!s.body || (inlinable(s.body) && !s.recursive) || opened.has(lower(s.ref.table))) continue;
      opened.add(lower(s.ref.table));
      const at = this.add(parent, `${counts.get(lower(s.ref.table))! > 1 ? 'MATERIALIZE' : 'CO-ROUTINE'} ${s.ref.table}`);
      if (s.recursive) {
        const [anchor, ...rest] = [{ ...s.body, compound: undefined } as SelectStatement, ...(s.body.compound ?? []).map((c) => c.select)];
        this.core(anchor!, this.add(at, 'SETUP'), named, outer);
        const key = lower(s.ref.table);
        const inStep = new Map(named).set(key, { ...named.get(key)!, rows: true });
        for (const step of rest) this.core(step, this.add(at, 'RECURSIVE STEP'), inStep, outer);
      } else {
        this.select(s.body, at, named, []);
      }
    }

    const whereTerms = andTerms(stmt.where);
    const innerOn = sources.filter((s) => !s.left && s.on).flatMap((s) => andTerms(s.on));
    let delivered: string[] = [];
    sources.forEach((s, i) => {
      if (s.body) {
        if (inlinable(s.body) && !s.recursive) this.core(s.body, parent, named, outer);
        else this.add(parent, `SCAN ${s.label}`);
        paths.set(lower(s.label), { kind: 'scan', label: s.label, table: s.ref.table, covering: false });
        return;
      }
      if (!s.table) {
        // A recursive CTE inside its own step, or an unknown name (the executor reports it).
        this.add(parent, `SCAN ${s.label}`);
        paths.set(lower(s.label), { kind: 'scan', label: s.label, table: s.ref.table, covering: false });
        return;
      }
      const known = new Set([...sources.slice(0, i), ...outer].map((k) => lower(k.label)));
      const pool = s.left ? andTerms(s.on) : [...whereTerms, ...innerOn];
      const terms = pool.flatMap((t) => this.termsFor(t, s, all, known));
      const path = this.access(stmt, s, terms, sources.length === 1, all);
      paths.set(lower(s.label), path);
      this.add(parent, detail(path) + (s.left ? ' LEFT-JOIN' : ''));
      if (i === 0) delivered = order(path, s);
    });
    if (sources.length > 1) delivered = [];

    // Subqueries, numbered in the order they appear.
    for (const expr of expressionsOf(stmt)) {
      for (const node of nodes(expr)) {
        if (node.type !== 'subquery' && node.type !== 'inSubquery') continue;
        const n = ++this.subqueries;
        const correlated = this.isCorrelated(node.query, named, all);
        const kind = node.type === 'subquery' ? 'SCALAR' : 'LIST';
        this.select(node.query, this.add(parent, `${correlated ? 'CORRELATED ' : ''}${kind} SUBQUERY ${n}`), named, all);
      }
    }

    const plain = (e: Expr) => (e.type === 'column' && this.owner(e, sources) ? lower(e.name) : undefined);
    const outputs = stmt.columns.map((c) => (c.kind === 'expr' ? c.expr : undefined));
    // ORDER BY may name an output column by alias or position.
    const resolve = (e: Expr): Expr => {
      if (e.type === 'literal' && typeof e.value === 'number') return outputs[e.value - 1] ?? e;
      if (e.type === 'column' && !e.table) {
        const k = stmt.columns.findIndex((c) => c.kind === 'expr' && c.alias && lower(c.alias) === lower(e.name));
        if (k >= 0) return outputs[k]!;
      }
      return e;
    };
    const startsWithSet = (wanted: (string | undefined)[]) =>
      wanted.every((w) => w !== undefined) && new Set(delivered.slice(0, wanted.length)).size === wanted.length && wanted.every((w) => delivered.slice(0, wanted.length).includes(w!));

    if (stmt.groupBy.length > 0) {
      const groups = stmt.groupBy.map((g) => plain(resolve(g)));
      if (!startsWithSet(groups)) this.add(parent, 'USE TEMP B-TREE FOR GROUP BY');
      delivered = groups.every((g) => g !== undefined) ? (groups as string[]) : [];
    } else if (stmt.distinct) {
      const wanted = outputs.map((e) => (e ? plain(e) : undefined));
      if (!startsWithSet(wanted)) this.add(parent, 'USE TEMP B-TREE FOR DISTINCT');
      delivered = wanted.every((w) => w !== undefined) ? (wanted as string[]) : [];
    } else if (isAggregateQuery(stmt)) {
      delivered = [];
    }

    if (stmt.orderBy.length > 0) {
      let satisfied = 0;
      const desc = stmt.orderBy[0]!.desc;
      for (const [k, o] of stmt.orderBy.entries()) {
        const name = plain(resolve(o.expr));
        if (name === undefined || delivered[k] !== name || o.desc !== desc) break;
        satisfied++;
      }
      const left = stmt.orderBy.length - satisfied;
      if (satisfied === 0) this.add(parent, 'USE TEMP B-TREE FOR ORDER BY');
      else if (left === 1) this.add(parent, 'USE TEMP B-TREE FOR LAST TERM OF ORDER BY');
      else if (left > 1) this.add(parent, 'USE TEMP B-TREE FOR RIGHT PART OF ORDER BY');
    }
    return { paths, delivered };
  }

  /** Whether a subquery reads a column of an enclosing query. */
  private isCorrelated(query: SelectStatement, named: Map<string, Named>, outer: Source[]): boolean {
    const own = this.sourcesOf(query, named);
    const exprs = [...expressionsOf(query), ...(query.compound ?? []).flatMap((c) => expressionsOf(c.select))];
    return exprs.some((e) =>
      nodes(e).some((n) => {
        if (n.type === 'column') return !this.owner(n, own) && this.owner(n, outer) !== undefined;
        if (n.type === 'subquery' || n.type === 'inSubquery') return this.isCorrelated(n.query, named, [...own, ...outer]);
        return false;
      }),
    );
  }

  /** The search terms a WHERE/ON condition gives for `source`, when its other side is already known. */
  private termsFor(cond: Expr, source: Source, all: Source[], known: Set<string>): Term[] {
    const mine = (e: Expr) => e.type === 'column' && this.owner(e, all) === source;
    const ready = (e: Expr) =>
      nodes(e).every((n) => n.type !== 'subquery' && n.type !== 'inSubquery' && n.type !== 'aggregate' && n.type !== 'window') &&
      nodes(e).every((n) => n.type !== 'column' || known.has(lower(this.owner(n, all)?.label ?? '\u0000')));
    const name = (e: Expr) => lower((e as Extract<Expr, { type: 'column' }>).name);
    if (cond.type === 'binary' && (cond.op === '=' || cond.op === '<' || cond.op === '<=' || cond.op === '>' || cond.op === '>=')) {
      if (mine(cond.left) && ready(cond.right)) return [{ column: name(cond.left), op: cond.op, value: cond.right }];
      if (mine(cond.right) && ready(cond.left)) return [{ column: name(cond.right), op: RANGE_FLIP[cond.op], value: cond.left }];
      return [];
    }
    if (cond.type === 'between' && !cond.negated && mine(cond.operand) && ready(cond.low) && ready(cond.high)) {
      return [
        { column: name(cond.operand), op: '>=', value: cond.low },
        { column: name(cond.operand), op: '<=', value: cond.high },
      ];
    }
    if (cond.type === 'inList' && !cond.negated && mine(cond.operand) && cond.items.every(ready)) {
      return cond.items.map((value) => ({ column: name(cond.operand), op: '=' as const, value }));
    }
    return [];
  }

  private access(stmt: SelectStatement, s: Source, terms: Term[], alone: boolean, all: Source[]): AccessPath {
    const t = s.table!;
    const base = { label: s.label, table: t.name };
    const equalOn = (column: string) => terms.filter((x) => x.column === column && x.op === '=').map((x) => x.value);
    const range = (column: string) => {
      const low = terms.find((x) => x.column === column && (x.op === '>' || x.op === '>='));
      const high = terms.find((x) => x.column === column && (x.op === '<' || x.op === '<='));
      return {
        ...(low && { low: { expr: low.value, inclusive: low.op === '>=' } }),
        ...(high && { high: { expr: high.value, inclusive: high.op === '<=' } }),
      };
    };
    const needed = this.neededColumns(stmt, s, all);
    const covers = (index: IndexDef) => needed !== 'all' && [...needed].every((c) => index.columns.some((ic) => lower(ic) === c) || c === t.rowid);

    if (t.rowid && equalOn(t.rowid).length > 0) return { kind: 'rowid', ...base, equal: equalOn(t.rowid) };
    let best: { index: IndexDef; equal: Expr[][]; low?: Bound; high?: Bound; score: number } | undefined;
    for (const index of t.indexes) {
      const equal: Expr[][] = [];
      for (const column of index.columns) {
        const values = equalOn(lower(column));
        if (values.length === 0) break;
        equal.push(values);
      }
      const next = index.columns[equal.length];
      const r = next ? range(lower(next)) : {};
      const score = equal.length * 2 + (r.low || r.high ? 1 : 0);
      if (score > 0 && (!best || score >= best.score)) best = { index, equal, ...r, score };
    }
    if (best && best.equal.length > 0) return { kind: 'search', ...base, index: best.index, covering: covers(best.index), equal: best.equal, ...pick(best) };
    if (t.rowid) {
      const r = range(t.rowid);
      if (r.low || r.high) return { kind: 'rowid', ...base, equal: [], ...r };
    }
    if (best) return { kind: 'search', ...base, index: best.index, covering: covers(best.index), equal: [], ...pick(best) };

    // No search: an index can still give the rows in the order GROUP BY, DISTINCT or ORDER BY needs.
    if (alone) {
      const plainColumn = (e: Expr) => (e.type === 'column' && this.owner(e, all) === s ? lower(e.name) : undefined);
      const wanted: (string | undefined)[][] = [];
      if (stmt.groupBy.length > 0) wanted.push(stmt.groupBy.map(plainColumn));
      else if (stmt.distinct) wanted.push(stmt.columns.map((c) => (c.kind === 'expr' ? plainColumn(c.expr) : undefined)));
      else if (stmt.orderBy.length > 0) wanted.push([plainColumn(stmt.orderBy[0]!.expr)]);
      for (const columns of wanted) {
        if (columns.some((c) => c === undefined) || (columns.length === 1 && columns[0] === t.rowid)) continue;
        const index = t.indexes.find((ix) => {
          const lead = ix.columns.slice(0, columns.length).map(lower);
          return lead.length === columns.length && columns.every((c) => lead.includes(c!));
        });
        if (index) return { kind: 'scan', ...base, index, covering: covers(index) };
      }
    }
    return { kind: 'scan', ...base, covering: false };
  }

  /** Columns of `s` the query reads anywhere, or 'all' for a star. */
  private neededColumns(stmt: SelectStatement, s: Source, all: Source[]): Set<string> | 'all' {
    if (stmt.columns.some((c) => c.kind === 'star' && (!c.table || lower(c.table) === lower(s.label)))) return 'all';
    const found = new Set<string>();
    const visit = (e: Expr, scope: Source[]) => {
      for (const n of nodes(e)) {
        if (n.type === 'column' && this.owner(n, scope) === s) found.add(lower(n.name));
        if (n.type === 'subquery' || n.type === 'inSubquery') {
          const inner = [...this.sourcesOf(n.query, new Map()), ...scope];
          for (const x of expressionsOf(n.query)) visit(x, inner);
        }
      }
    };
    for (const e of expressionsOf(stmt)) visit(e, all);
    return found;
  }
}

function pick(x: { low?: Bound; high?: Bound }) {
  return { ...(x.low && { low: x.low }), ...(x.high && { high: x.high }) };
}

/** The column order a path's rows come out in. */
function order(path: AccessPath, s: Source): string[] {
  const rowid = s.table?.rowid ? [s.table.rowid] : [];
  switch (path.kind) {
    case 'rowid':
      return rowid;
    case 'search':
      return [...path.index.columns.slice(path.equal.length).map(lower), ...rowid];
    case 'scan':
      return path.index ? [...path.index.columns.map(lower), ...rowid] : rowid;
  }
}

function constraintText(columns: string[], equal: number, low?: Bound, high?: Bound): string {
  const parts = columns.slice(0, equal).map((c) => `${c}=?`);
  const next = columns[equal];
  if (low) parts.push(`${next}>?`);
  if (high) parts.push(`${next}<?`);
  return parts.join(' AND ');
}

/** The plan line for a path, in SQLite's words. */
export function detail(path: AccessPath): string {
  switch (path.kind) {
    case 'scan':
      return path.index ? `SCAN ${path.label} USING ${path.covering ? 'COVERING ' : ''}INDEX ${path.index.name}` : `SCAN ${path.label}`;
    case 'rowid':
      return `SEARCH ${path.label} USING INTEGER PRIMARY KEY (${constraintText(['rowid'], path.equal.length > 0 ? 1 : 0, path.low, path.high)})`;
    case 'search': {
      const constraint = constraintText(path.index.columns, path.equal.length, path.low, path.high);
      return `SEARCH ${path.label} USING ${path.covering ? 'COVERING ' : ''}INDEX ${path.index.name}${constraint ? ` (${constraint})` : ''}`;
    }
  }
}

/**
 * Plans a SELECT as SQLite would, for the rules this interpreter models: rowid lookups, index
 * searches on = / IN then one range, index scans that give GROUP BY, DISTINCT or ORDER BY their
 * order, and temp B-trees otherwise. Tables are read in the order written.
 */
export function planSelect(db: Dataset, stmt: SelectStatement): { paths: Map<string, AccessPath>; entries: PlanEntry[] } {
  const planner = new Planner(db);
  const paths = planner.select(stmt, 0, new Map(), []);
  return { paths, entries: planner.entries };
}
