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
  /** Searched CASE has no operand; simple CASE compares the operand with each WHEN. */
  | { type: 'case'; operand?: Expr; whens: { when: Expr; then: Expr }[]; else?: Expr }
);

/** The sub-expressions of a CASE, in evaluation order. */
export function caseParts(expr: Extract<Expr, { type: 'case' }>): Expr[] {
  return [...(expr.operand ? [expr.operand] : []), ...expr.whens.flatMap((w) => [w.when, w.then]), ...(expr.else ? [expr.else] : [])];
}

export type Clause = 'FROM' | 'JOIN' | 'WHERE' | 'GROUP BY' | 'HAVING' | 'SELECT' | 'DISTINCT' | 'ORDER BY' | 'LIMIT';

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
  from: TableRef;
  joins: JoinClause[];
  where?: Expr;
  groupBy: Expr[];
  having?: Expr;
  orderBy: { expr: Expr; desc: boolean }[];
  limit?: { count: number; offset: number };
  /** First source line of each clause present. */
  lines: Partial<Record<Clause, number>>;
}

/** One statement of a script. Every line is 1-based in the whole script. */
export type Statement =
  | { kind: 'select'; select: SelectStatement; line: number }
  | {
      kind: 'insert';
      table: TableRef;
      columns?: string[];
      values?: Expr[][];
      select?: SelectStatement;
      line: number;
      lines: { INSERT: number; VALUES?: number; SELECT?: number };
    }
  | {
      kind: 'update';
      table: TableRef;
      set: { name: string; expr: Expr; line: number; column: number }[];
      where?: Expr;
      line: number;
      lines: { UPDATE: number; SET: number; WHERE?: number };
    }
  | { kind: 'delete'; table: TableRef; where?: Expr; line: number; lines: { DELETE: number; WHERE?: number } }
  /** `checks` holds every CHECK condition as parsed, so its columns can be checked against the new table. */
  | { kind: 'create'; schema: TableSchema; checks: Expr[]; line: number; column: number }
  | { kind: 'drop'; table: string; ifExists: boolean; line: number; column: number };

export type WriteClause = 'INSERT' | 'VALUES' | 'UPDATE' | 'SET' | 'DELETE' | 'CREATE TABLE' | 'DROP TABLE';
