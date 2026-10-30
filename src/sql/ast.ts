import type { TableSchema } from './schema';
import type { SqlValue } from './values';

export type BinaryOp = '+' | '-' | '*' | '/' | '%' | '=' | '<>' | '<' | '<=' | '>' | '>=' | 'AND' | 'OR';
export type AggregateFn = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

/** Every node keeps its trimmed source text and where it starts, for step titles and error positions. */
export type Expr = { text: string; line: number; column: number } & (
  | { type: 'literal'; value: SqlValue }
  | { type: 'column'; table?: string; name: string }
  | { type: 'unary'; op: '-' | 'NOT'; operand: Expr }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { type: 'isNull'; operand: Expr; negated: boolean }
  | { type: 'between'; operand: Expr; low: Expr; high: Expr; negated: boolean }
  | { type: 'like'; operand: Expr; pattern: Expr; negated: boolean }
  | { type: 'inList'; operand: Expr; items: Expr[]; negated: boolean }
  | { type: 'inSubquery'; operand: Expr; query: SelectStatement; negated: boolean }
  | { type: 'subquery'; query: SelectStatement }
  | { type: 'aggregate'; fn: AggregateFn; arg: Expr | '*'; distinct: boolean }
  /** A window function: `fn(args) OVER (PARTITION BY … ORDER BY …)`. `star` is COUNT(*). */
  | {
      type: 'window';
      fn: WindowFn;
      args: Expr[];
      star: boolean;
      partitionBy: Expr[];
      orderBy: { expr: Expr; desc: boolean }[];
    }
  /** Searched CASE has no operand; simple CASE compares the operand with each WHEN. */
  | { type: 'case'; operand?: Expr; whens: { when: Expr; then: Expr }[]; else?: Expr }
);

export type WindowFn = 'ROW_NUMBER' | 'RANK' | 'DENSE_RANK' | 'LAG' | 'LEAD' | AggregateFn;

/** The sub-expressions of a window function: arguments, then PARTITION BY, then ORDER BY. */
export function windowParts(expr: Extract<Expr, { type: 'window' }>): Expr[] {
  return [...expr.args, ...expr.partitionBy, ...expr.orderBy.map((o) => o.expr)];
}

/** The sub-expressions of a CASE, in evaluation order. */
export function caseParts(expr: Extract<Expr, { type: 'case' }>): Expr[] {
  return [...(expr.operand ? [expr.operand] : []), ...expr.whens.flatMap((w) => [w.when, w.then]), ...(expr.else ? [expr.else] : [])];
}

/** The direct sub-expressions of a node, without entering subqueries. */
export function exprChildren(expr: Expr): Expr[] {
  switch (expr.type) {
    case 'unary':
    case 'isNull':
    case 'inSubquery':
      return [expr.operand];
    case 'binary':
      return [expr.left, expr.right];
    case 'between':
      return [expr.operand, expr.low, expr.high];
    case 'like':
      return [expr.operand, expr.pattern];
    case 'inList':
      return [expr.operand, ...expr.items];
    case 'aggregate':
      return expr.arg === '*' ? [] : [expr.arg];
    case 'case':
      return caseParts(expr);
    case 'window':
      return windowParts(expr);
    default:
      return [];
  }
}

export type Clause = 'FROM' | 'JOIN' | 'WHERE' | 'GROUP BY' | 'HAVING' | 'SELECT' | 'DISTINCT' | 'ORDER BY' | 'LIMIT' | 'WITH' | 'WINDOW' | SetOp;

/** The order SQL evaluates clauses in, which is also the order steps are shown. */
export const LOGICAL_ORDER: Clause[] = ['FROM', 'JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'DISTINCT', 'ORDER BY', 'LIMIT'];

export type SelectItem = { kind: 'star'; table?: string } | { kind: 'expr'; expr: Expr; alias?: string };

export interface TableRef {
  table: string;
  alias?: string;
  /** Where the table name appears, for error messages. */
  line: number;
  column: number;
}

export interface JoinClause extends TableRef {
  kind: 'inner' | 'left';
  on: Expr;
  line: number;
}

export interface SelectStatement {
  distinct: boolean;
  columns: SelectItem[];
  /** Absent for SELECT without FROM, which reads one row with no columns. */
  from?: TableRef;
  joins: JoinClause[];
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: { expr: Expr; desc: boolean }[];
  limit?: { count: number; offset: number };
  /**
   * Later SELECTs joined by set operators, on the first SELECT of a compound. The first
   * SELECT's orderBy and limit then apply to the whole result.
   */
  compound?: { op: SetOp; select: SelectStatement; line: number; selectLine: number; selectColumn: number }[];
  /** WITH clauses, on the outermost SELECT only. */
  with?: Cte[];
  /** First source line of each clause present. */
  lines: Partial<Record<Clause, number>>;
}

/** One named query of a WITH clause. */
export interface Cte {
  name: string;
  columns?: string[];
  query: SelectStatement;
  recursive: boolean;
  line: number;
  column: number;
}

export type SetOp = 'UNION' | 'UNION ALL' | 'INTERSECT' | 'EXCEPT';

export type IsolationLevel = 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export type TransactionAction = 'begin' | 'commit' | 'rollback' | 'savepoint' | 'release' | 'rollback-to';

/**
 * One statement of a script. Every line is 1-based in the whole script. `session` is set in a
 * two-session script, where each statement starts with A: or B:.
 */
export type Statement = StatementBody & { session?: 'A' | 'B' };

type StatementBody =
  | { kind: 'select'; select: SelectStatement; line: number }
  | {
      kind: 'insert';
      table: TableRef;
      columns?: string[];
      values?: Expr[][];
      select?: SelectStatement;
      with?: Cte[];
      line: number;
      lines: { INSERT: number; VALUES?: number; SELECT?: number };
    }
  | {
      kind: 'update';
      table: TableRef;
      set: { name: string; expr: Expr; line: number; column: number }[];
      where?: Expr;
      with?: Cte[];
      line: number;
      lines: { UPDATE: number; SET: number; WHERE?: number };
    }
  | { kind: 'delete'; table: TableRef; where?: Expr; with?: Cte[]; line: number; lines: { DELETE: number; WHERE?: number } }
  /** `checks` holds every CHECK condition as parsed, so its columns can be checked against the new table. */
  | { kind: 'create'; schema: TableSchema; checks: Expr[]; line: number; column: number }
  | { kind: 'drop'; table: string; ifExists: boolean; line: number; column: number }
  | { kind: 'create-index'; name: string; table: string; columns: string[]; unique: boolean; ifNotExists: boolean; line: number; column: number }
  | { kind: 'drop-index'; name: string; ifExists: boolean; line: number; column: number }
  /** `sql` is the SELECT's text, shown in the schema panel. */
  | { kind: 'create-view'; name: string; columns?: string[]; query: SelectStatement; sql: string; ifNotExists: boolean; line: number; column: number }
  | { kind: 'drop-view'; name: string; ifExists: boolean; line: number; column: number }
  | { kind: 'explain'; select: SelectStatement; line: number }
  | { kind: 'transaction'; action: TransactionAction; name?: string; line: number; column: number }
  | { kind: 'set-isolation'; level: IsolationLevel; line: number; column: number };

