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
);

export type Clause = 'FROM' | 'JOIN' | 'WHERE' | 'GROUP BY' | 'HAVING' | 'SELECT' | 'DISTINCT' | 'ORDER BY' | 'LIMIT';

/** The order SQL evaluates clauses in, which is also the order steps are shown. */
export const LOGICAL_ORDER: Clause[] = ['FROM', 'JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'DISTINCT', 'ORDER BY', 'LIMIT'];

export type SelectItem = { kind: 'star'; table?: string } | { kind: 'expr'; expr: Expr; alias?: string };

export interface TableRef {
  table: string;
  alias?: string;
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
