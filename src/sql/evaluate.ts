import type { Expr } from './ast';
import type { ColumnType, Dataset } from './datasets';
import { SqlError, suggest } from './errors';
import { executeSelect, type ColumnRef, type Row } from './execute';
import {
  and,
  arithmetic,
  compare,
  formatValue,
  like,
  negate,
  not,
  or,
  Real,
  truth,
  type SqlValue,
  type Truth,
} from './values';

export interface Scope {
  columns: ColumnRef[];
  row: Row;
  outer?: Scope;
  db: Dataset;
}

type Comparison = '=' | '<>' | '<' | '<=' | '>' | '>=';

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const truthValue = (t: Truth): SqlValue => (t === null ? null : t ? 1 : 0);
const label = (expr: { table?: string; name: string }) => (expr.table ? `${expr.table}.${expr.name}` : expr.name);

function listTables(tables: string[]): string {
  const quoted = tables.map((t) => `\`${t}\``);
  return quoted.length <= 1 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

function matches(ref: ColumnRef, expr: { table?: string; name: string }): boolean {
  return sameName(ref.name, expr.name) && (expr.table === undefined || (ref.table !== undefined && sameName(ref.table, expr.table)));
}

/** Finds the scope and index a column reference points to, searching outward. */
export function resolveColumn(expr: Extract<Expr, { type: 'column' }>, scope: Scope): { scope: Scope; index: number } {
  for (let s: Scope | undefined = scope; s; s = s.outer) {
    const found = s.columns.flatMap((ref, index) => (matches(ref, expr) ? [index] : []));
    if (found.length === 1) return { scope: s, index: found[0]! };
    if (found.length > 1) {
      const tables = [...new Set(found.map((i) => s.columns[i]!.table ?? '?'))];
      if (tables.length === 1) return { scope: s, index: found[0]! };
      throw new SqlError(
        `Column \`${expr.name}\` is ambiguous: it exists in ${listTables(tables)}. ` +
          `Write ${tables.map((t) => `\`${t}.${expr.name}\``).join(' or ')}.`,
        'name',
        expr.line,
        expr.column,
      );
    }
  }
  const candidates: string[] = [];
  for (let s: Scope | undefined = scope; s; s = s.outer) {
    for (const ref of s.columns) {
      if (expr.table === undefined) candidates.push(ref.name);
      else if (ref.table && sameName(ref.table, expr.table)) candidates.push(`${ref.table}.${ref.name}`);
    }
  }
  const close = suggest(label(expr), candidates);
  throw new SqlError(
    `No column \`${label(expr)}\`.` + (close ? ` Did you mean \`${close}\`?` : ''),
    'name',
    expr.line,
    expr.column,
  );
}

/** The column type an expression carries for comparisons, as SQLite's affinity rules define it. */
function affinity(expr: Expr, scope: Scope): ColumnType | undefined {
  if (expr.type !== 'column') return undefined;
  const { scope: s, index } = resolveColumn(expr, scope);
  return s.columns[index]!.type;
}

const WELL_FORMED_NUMBER = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

function applyAffinity(value: SqlValue, type: ColumnType | undefined): SqlValue {
  if (type === undefined || value === null) return value;
  if (type === 'TEXT') return typeof value === 'string' ? value : formatValue(value);
  if (typeof value !== 'string' || !WELL_FORMED_NUMBER.test(value)) return value;
  const n = Number(value.trim());
  return /[.eE]/.test(value) || type === 'REAL' ? new Real(n) : n;
}

const numericType = (t: ColumnType | undefined) => t === 'INTEGER' || t === 'REAL';

/** Converts both sides of a comparison the way SQLite does before comparing them. */
function coerce(left: Expr, right: Expr, scope: Scope): [SqlValue, SqlValue] {
  let a = evaluate(left, scope);
  let b = evaluate(right, scope);
  const ta = affinity(left, scope);
  const tb = affinity(right, scope);
  if (numericType(ta) && !numericType(tb)) b = applyAffinity(b, 'INTEGER');
  else if (numericType(tb) && !numericType(ta)) a = applyAffinity(a, 'INTEGER');
  else if (ta === 'TEXT' && tb === undefined) b = applyAffinity(b, 'TEXT');
  else if (tb === 'TEXT' && ta === undefined) a = applyAffinity(a, 'TEXT');
  return [a, b];
}

function comparison(op: Comparison, left: Expr, right: Expr, scope: Scope): Truth {
  const [a, b] = coerce(left, right, scope);
  return compare(op, a, b);
}

/** SQL membership: true on a match, unknown if no match but a NULL was involved, else false. */
function membership(value: SqlValue, candidates: SqlValue[]): Truth {
  if (candidates.length === 0) return false;
  if (value === null) return null;
  let unknown = false;
  for (const candidate of candidates) {
    const result = compare('=', value, candidate);
    if (result) return true;
    if (result === null) unknown = true;
  }
  return unknown ? null : false;
}

function runSubquery(expr: Extract<Expr, { type: 'subquery' | 'inSubquery' }>, scope: Scope, purpose: string) {
  const result = executeSelect(scope.db, expr.query, undefined, scope);
  if (result.columns.length !== 1) {
    throw new SqlError(`A subquery ${purpose} must return one column.`, 'syntax', expr.line, expr.column);
  }
  return result.rows.map((row) => row[0]!);
}

export function evaluate(expr: Expr, scope: Scope): SqlValue {
  switch (expr.type) {
    case 'literal':
      return expr.value;
    case 'column': {
      const { scope: s, index } = resolveColumn(expr, scope);
      return s.row.values[index]!;
    }
    case 'unary':
      return expr.op === '-' ? negate(evaluate(expr.operand, scope)) : truthValue(not(evaluateTruth(expr.operand, scope)));
    case 'binary':
      switch (expr.op) {
        case 'AND':
          return truthValue(and(evaluateTruth(expr.left, scope), evaluateTruth(expr.right, scope)));
        case 'OR':
          return truthValue(or(evaluateTruth(expr.left, scope), evaluateTruth(expr.right, scope)));
        case '+':
        case '-':
        case '*':
        case '/':
        case '%':
          return arithmetic(expr.op, evaluate(expr.left, scope), evaluate(expr.right, scope));
        default:
          return truthValue(comparison(expr.op, expr.left, expr.right, scope));
      }
    case 'isNull':
      return truthValue((evaluate(expr.operand, scope) === null) !== expr.negated);
    case 'between': {
      const inside = and(comparison('>=', expr.operand, expr.low, scope), comparison('<=', expr.operand, expr.high, scope));
      return truthValue(expr.negated ? not(inside) : inside);
    }
    case 'like': {
      const result = like(evaluate(expr.operand, scope), evaluate(expr.pattern, scope));
      return truthValue(expr.negated ? not(result) : result);
    }
    case 'inList': {
      const type = affinity(expr.operand, scope);
      const items = expr.items.map((item) =>
        affinity(item, scope) === undefined || numericType(type) ? applyAffinity(evaluate(item, scope), type) : evaluate(item, scope),
      );
      const result = membership(evaluate(expr.operand, scope), items);
      return truthValue(expr.negated ? not(result) : result);
    }
    case 'inSubquery': {
      const result = membership(evaluate(expr.operand, scope), runSubquery(expr, scope, 'used with IN'));
      return truthValue(expr.negated ? not(result) : result);
    }
    case 'subquery':
      return runSubquery(expr, scope, 'used as a value')[0] ?? null;
    case 'aggregate':
      throw new SqlError('Aggregates are not supported yet.', 'unsupported', expr.line, expr.column);
  }
}

export function evaluateTruth(expr: Expr, scope: Scope): Truth {
  return truth(evaluate(expr, scope));
}

/** Column values an expression reads, keyed by how the query writes them, for step explanations. */
export function referencedColumns(expr: Expr, scope: Scope): Record<string, string> {
  const values: Record<string, string> = {};
  const visit = (e: Expr) => {
    switch (e.type) {
      case 'column':
        values[e.text] = formatValue(evaluate(e, scope));
        return;
      case 'unary':
        return visit(e.operand);
      case 'binary':
        visit(e.left);
        return visit(e.right);
      case 'isNull':
        return visit(e.operand);
      case 'between':
        visit(e.operand);
        visit(e.low);
        return visit(e.high);
      case 'like':
        visit(e.operand);
        return visit(e.pattern);
      case 'inList':
        visit(e.operand);
        return e.items.forEach(visit);
      case 'inSubquery':
        return visit(e.operand);
      default:
        return;
    }
  };
  visit(expr);
  return values;
}
