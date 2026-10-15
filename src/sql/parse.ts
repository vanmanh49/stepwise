import type { AggregateFn, Expr, JoinClause, SelectItem, SelectStatement } from './ast';
import { SqlError } from './errors';
import { tokenize, type Token } from './tokenize';
import { Real } from './values';

export const MAX_QUERY_LENGTH = 2000;

export type ParseResult = { ok: true; statement: SelectStatement } | { ok: false; error: SqlError };

const AGGREGATES = new Set<string>(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
const COMPARISONS = new Set(['=', '<>', '!=', '<', '<=', '>', '>=']);

/** Statement or clause keywords that belong to a later lesson, with the curriculum id that covers them. */
const LATER: Record<string, string | undefined> = {
  INSERT: 'insert',
  UPDATE: 'update',
  DELETE: 'delete',
  CREATE: 'create-table',
  DROP: undefined,
  ALTER: undefined,
  WITH: 'ctes',
  UNION: 'set-operations',
  INTERSECT: 'set-operations',
  EXCEPT: 'set-operations',
  OVER: 'window-functions',
  CASE: 'case-expressions',
  EXISTS: undefined,
};

type ExprBody = Expr extends infer E ? (E extends unknown ? Omit<E, 'text' | 'line' | 'column'> : never) : never;

function unsupported(feature: string, token: Token, topic?: string): SqlError {
  const message = `\`${feature}\` isn't supported here yet.` + (topic ? ' It is covered in a later lesson.' : '');
  return new SqlError(message, 'unsupported', token.line, token.column, topic);
}

class Parser {
  private pos = 0;

  constructor(
    private readonly sql: string,
    private readonly tokens: Token[],
  ) {}

  private get token(): Token {
    return this.tokens[this.pos]!;
  }

  private peek(offset = 1): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private next(): Token {
    const token = this.token;
    if (token.kind !== 'eof') this.pos++;
    return token;
  }

  private isKeyword(...words: string[]): boolean {
    return this.token.kind === 'keyword' && words.includes(this.token.value);
  }

  private isPunct(ch: string): boolean {
    return this.token.kind === 'punct' && this.token.value === ch;
  }

  private acceptKeyword(word: string): boolean {
    if (!this.isKeyword(word)) return false;
    this.next();
    return true;
  }

  private fail(expected: string, hint = ''): never {
    const t = this.token;
    if (t.kind === 'keyword' && t.value in LATER) throw unsupported(t.value, t, LATER[t.value]);
    const found = t.kind === 'eof' ? 'the end of the query' : `\`${t.text}\``;
    throw new SqlError(`Expected ${expected}, found ${found}.${hint}`, 'syntax', t.line, t.column);
  }

  private expectKeyword(word: string, hint = ''): Token {
    if (!this.isKeyword(word)) this.fail(word, hint);
    return this.next();
  }

  private expectPunct(ch: string): Token {
    if (!this.isPunct(ch)) this.fail(`\`${ch}\``);
    return this.next();
  }

  private identifier(what: string): Token {
    if (this.token.kind !== 'identifier') this.fail(what);
    return this.next();
  }

  /** Builds a node whose text spans from `start` to the last consumed token. */
  private node(start: Token, body: ExprBody): Expr {
    const end = this.tokens[this.pos - 1]!;
    return { ...body, text: this.sql.slice(start.start, end.end).trim(), line: start.line, column: start.column } as Expr;
  }

  statement(): SelectStatement {
    const t = this.token;
    if (t.kind === 'keyword' && t.value in LATER) throw unsupported(t.value, t, LATER[t.value]);
    const statement = this.select();
    if (this.isKeyword('UNION', 'INTERSECT', 'EXCEPT')) this.fail('the end of the query');
    if (this.isPunct(';')) this.next();
    if (this.token.kind !== 'eof') {
      if (this.tokens[this.pos - 1]?.value === ';') {
        throw new SqlError('Run one statement at a time.', 'syntax', this.token.line, this.token.column);
      }
      this.fail('the end of the query');
    }
    return statement;
  }

  select(): SelectStatement {
    const lines: SelectStatement['lines'] = {};
    const selectToken = this.expectKeyword('SELECT');
    lines.SELECT = selectToken.line;
    const distinct = this.acceptKeyword('DISTINCT');
    if (distinct) lines.DISTINCT = selectToken.line;
    else this.acceptKeyword('ALL');

    const columns: SelectItem[] = [this.selectItem()];
    while (this.isPunct(',')) {
      this.next();
      columns.push(this.selectItem());
    }

    const hint = this.token.kind === 'identifier' ? ' Is a comma missing, or AS before an alias?' : '';
    lines.FROM = this.expectKeyword('FROM', hint).line;
    const from = this.tableRef();
    if (this.isPunct(',')) {
      throw new SqlError(
        "Joining tables with a comma isn't supported here. Use JOIN … ON instead.",
        'unsupported',
        this.token.line,
        this.token.column,
      );
    }

    const joins: JoinClause[] = [];
    for (;;) {
      const start = this.token;
      if (this.isKeyword('RIGHT', 'FULL', 'CROSS', 'NATURAL')) {
        throw unsupported(`${start.value} JOIN`, start);
      }
      let kind: JoinClause['kind'];
      if (this.acceptKeyword('JOIN')) kind = 'inner';
      else if (this.isKeyword('INNER')) {
        this.next();
        this.expectKeyword('JOIN');
        kind = 'inner';
      } else if (this.isKeyword('LEFT')) {
        this.next();
        this.acceptKeyword('OUTER');
        this.expectKeyword('JOIN');
        kind = 'left';
      } else break;
      const ref = this.tableRef();
      if (this.isKeyword('USING')) throw unsupported('USING', this.token);
      this.expectKeyword('ON');
      joins.push({ kind, ...ref, on: this.expr(), line: start.line });
      lines.JOIN ??= start.line;
    }

    let where: Expr | undefined;
    if (this.isKeyword('WHERE')) {
      lines.WHERE = this.next().line;
      where = this.expr();
    }

    const groupBy: Expr[] = [];
    if (this.isKeyword('GROUP')) {
      lines['GROUP BY'] = this.next().line;
      this.expectKeyword('BY');
      groupBy.push(this.expr());
      while (this.isPunct(',')) {
        this.next();
        groupBy.push(this.expr());
      }
    }

    let having: Expr | undefined;
    if (this.isKeyword('HAVING')) {
      lines.HAVING = this.next().line;
      having = this.expr();
    }

    const orderBy: SelectStatement['orderBy'] = [];
    if (this.isKeyword('ORDER')) {
      lines['ORDER BY'] = this.next().line;
      this.expectKeyword('BY');
      do {
        if (orderBy.length > 0) this.next();
        const expr = this.expr();
        let desc = false;
        if (this.acceptKeyword('DESC')) desc = true;
        else this.acceptKeyword('ASC');
        orderBy.push({ expr, desc });
      } while (this.isPunct(','));
    }

    let limit: SelectStatement['limit'];
    if (this.isKeyword('LIMIT')) {
      lines.LIMIT = this.next().line;
      const count = this.wholeNumber('LIMIT');
      const offset = this.acceptKeyword('OFFSET') ? this.wholeNumber('OFFSET') : 0;
      limit = { count, offset };
    }

    return {
      distinct,
      columns,
      from,
      joins,
      ...(where && { where }),
      groupBy,
      ...(having && { having }),
      orderBy,
      ...(limit && { limit }),
      lines,
    };
  }

  private wholeNumber(clause: string): number {
    const t = this.token;
    if (t.kind !== 'number' || !/^\d+$/.test(t.value)) {
      throw new SqlError(`${clause} needs a whole number.`, 'syntax', t.line, t.column);
    }
    this.next();
    return Number(t.value);
  }

  private tableRef(): { table: string; alias?: string } {
    const table = this.identifier('a table name').value;
    let alias: string | undefined;
    if (this.acceptKeyword('AS')) alias = this.identifier('an alias').value;
    else if (this.token.kind === 'identifier') alias = this.next().value;
    return alias === undefined ? { table } : { table, alias };
  }

  private selectItem(): SelectItem {
    if (this.token.kind === 'operator' && this.token.value === '*') {
      this.next();
      return { kind: 'star' };
    }
    if (this.token.kind === 'identifier' && this.peek().value === '.' && this.peek(2).value === '*') {
      const table = this.next().value;
      this.next();
      this.next();
      return { kind: 'star', table };
    }
    const expr = this.expr();
    if (this.acceptKeyword('AS')) return { kind: 'expr', expr, alias: this.identifier('an alias').value };
    return { kind: 'expr', expr };
  }

  expr(): Expr {
    return this.or();
  }

  private or(): Expr {
    const start = this.token;
    let left = this.and();
    while (this.acceptKeyword('OR')) left = this.node(start, { type: 'binary', op: 'OR', left, right: this.and() });
    return left;
  }

  private and(): Expr {
    const start = this.token;
    let left = this.not();
    while (this.acceptKeyword('AND')) left = this.node(start, { type: 'binary', op: 'AND', left, right: this.not() });
    return left;
  }

  private not(): Expr {
    const start = this.token;
    if (this.acceptKeyword('NOT')) return this.node(start, { type: 'unary', op: 'NOT', operand: this.not() });
    return this.comparison();
  }

  private comparison(): Expr {
    const start = this.token;
    let left = this.additive();
    for (;;) {
      const t = this.token;
      if (t.kind === 'operator' && COMPARISONS.has(t.value)) {
        this.next();
        const op = t.value === '!=' ? '<>' : (t.value as '=' | '<>' | '<' | '<=' | '>' | '>=');
        left = this.node(start, { type: 'binary', op, left, right: this.additive() });
        continue;
      }
      if (this.isKeyword('IS')) {
        this.next();
        const negated = this.acceptKeyword('NOT');
        this.expectKeyword('NULL');
        left = this.node(start, { type: 'isNull', operand: left, negated });
        continue;
      }
      const negated = this.isKeyword('NOT') && this.peek().kind === 'keyword' && ['IN', 'LIKE', 'BETWEEN'].includes(this.peek().value);
      if (negated) this.next();
      if (this.acceptKeyword('BETWEEN')) {
        const low = this.additive();
        this.expectKeyword('AND');
        left = this.node(start, { type: 'between', operand: left, low, high: this.additive(), negated });
        continue;
      }
      if (this.acceptKeyword('LIKE')) {
        left = this.node(start, { type: 'like', operand: left, pattern: this.additive(), negated });
        continue;
      }
      if (this.acceptKeyword('IN')) {
        this.expectPunct('(');
        if (this.isKeyword('SELECT')) {
          const query = this.select();
          this.expectPunct(')');
          left = this.node(start, { type: 'inSubquery', operand: left, query, negated });
          continue;
        }
        const items = [this.expr()];
        while (this.isPunct(',')) {
          this.next();
          items.push(this.expr());
        }
        this.expectPunct(')');
        left = this.node(start, { type: 'inList', operand: left, items, negated });
        continue;
      }
      return left;
    }
  }

  private additive(): Expr {
    const start = this.token;
    let left = this.multiplicative();
    while (this.token.kind === 'operator' && (this.token.value === '+' || this.token.value === '-')) {
      const op = this.next().value as '+' | '-';
      left = this.node(start, { type: 'binary', op, left, right: this.multiplicative() });
    }
    return left;
  }

  private multiplicative(): Expr {
    const start = this.token;
    let left = this.unary();
    while (this.token.kind === 'operator' && ['*', '/', '%'].includes(this.token.value)) {
      const op = this.next().value as '*' | '/' | '%';
      left = this.node(start, { type: 'binary', op, left, right: this.unary() });
    }
    return left;
  }

  private unary(): Expr {
    const start = this.token;
    if (start.kind === 'operator' && (start.value === '-' || start.value === '+')) {
      this.next();
      const operand = this.unary();
      return start.value === '-' ? this.node(start, { type: 'unary', op: '-', operand }) : operand;
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.token;
    switch (t.kind) {
      case 'number': {
        this.next();
        const value = /[.eE]/.test(t.value) ? new Real(Number(t.value)) : Number(t.value);
        return this.node(t, { type: 'literal', value });
      }
      case 'string':
        this.next();
        return this.node(t, { type: 'literal', value: t.value });
      case 'keyword':
        if (t.value === 'NULL' || t.value === 'TRUE' || t.value === 'FALSE') {
          this.next();
          return this.node(t, { type: 'literal', value: t.value === 'NULL' ? null : t.value === 'TRUE' ? 1 : 0 });
        }
        return this.fail('a value or column');
      case 'punct':
        if (t.value === '(') {
          this.next();
          if (this.isKeyword('SELECT')) {
            const query = this.select();
            this.expectPunct(')');
            return this.node(t, { type: 'subquery', query });
          }
          const inner = this.expr();
          this.expectPunct(')');
          return { ...inner, text: this.sql.slice(t.start, this.tokens[this.pos - 1]!.end), line: t.line, column: t.column };
        }
        return this.fail('a value or column');
      case 'identifier': {
        if (this.peek().kind === 'punct' && this.peek().value === '(') return this.call();
        this.next();
        if (this.isPunct('.')) {
          this.next();
          const name = this.identifier('a column name').value;
          return this.node(t, { type: 'column', table: t.value, name });
        }
        return this.node(t, { type: 'column', name: t.value });
      }
      default:
        return this.fail('a value or column');
    }
  }

  private call(): Expr {
    const nameToken = this.next();
    const fn = nameToken.value.toUpperCase();
    if (!AGGREGATES.has(fn)) {
      throw new SqlError(`Function \`${fn}\` isn't supported here yet.`, 'unsupported', nameToken.line, nameToken.column);
    }
    this.expectPunct('(');
    let arg: Expr | '*';
    let distinct = false;
    if (fn === 'COUNT' && this.token.kind === 'operator' && this.token.value === '*') {
      this.next();
      arg = '*';
    } else {
      distinct = this.acceptKeyword('DISTINCT');
      arg = this.expr();
    }
    this.expectPunct(')');
    if (this.isKeyword('OVER')) throw unsupported('OVER', this.token, LATER.OVER);
    return this.node(nameToken, { type: 'aggregate', fn: fn as AggregateFn, arg, distinct });
  }
}

export function parseQuery(sql: string): ParseResult {
  try {
    if (sql.length > MAX_QUERY_LENGTH) {
      throw new SqlError('Queries are limited to 2,000 characters.', 'limit', 1, 1);
    }
    const tokens = tokenize(sql);
    const meaningful = tokens.filter((t) => t.kind !== 'eof' && !(t.kind === 'punct' && t.value === ';'));
    if (meaningful.length === 0) throw new SqlError('Write a query to run.', 'syntax', 1, 1);
    return { ok: true, statement: new Parser(sql, tokens).statement() };
  } catch (error) {
    if (error instanceof SqlError) return { ok: false, error };
    throw error;
  }
}
