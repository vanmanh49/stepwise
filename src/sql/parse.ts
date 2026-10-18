import { caseParts, type AggregateFn, type Expr, type JoinClause, type SelectItem, type SelectStatement, type SetOp, type Statement, type TableRef } from './ast';
import { asSqlError, SqlError } from './errors';
import type { ColumnDef, ColumnType, TableSchema } from './schema';
import { tokenize, type Token } from './tokenize';
import { Real } from './values';

export const MAX_QUERY_LENGTH = 2000;
export const MAX_STATEMENTS = 10;
/** Deeper nesting is never needed and could overflow the call stack. */
const MAX_DEPTH = 100;

export type ParseResult = { ok: true; statement: SelectStatement } | { ok: false; error: SqlError };
export type ScriptParse = { ok: true; statements: Statement[] } | { ok: false; error: SqlError };

const COLUMN_TYPES = new Set<string>(['INTEGER', 'REAL', 'TEXT']);
/** Statements a script can run but a single SELECT query cannot. */
const WRITES = new Set(['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP']);

const AGGREGATES = new Set<string>(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
const COMPARISONS = new Set(['=', '<>', '!=', '<', '<=', '>', '>=']);

/** Statement or clause keywords that belong to a later lesson, with the curriculum id that covers them. */
const LATER: Record<string, string | undefined> = {
  ALTER: undefined,
  WITH: 'ctes',
  OVER: 'window-functions',
  EXISTS: undefined,
};

type ExprBody = Expr extends infer E ? (E extends unknown ? Omit<E, 'text' | 'line' | 'column'> : never) : never;

function unsupported(feature: string, token: Token, topic?: string): SqlError {
  const message = `\`${feature}\` isn't supported here yet.` + (topic ? ' It is covered in a later lesson.' : '');
  return new SqlError(message, 'unsupported', token.line, token.column, topic);
}

class Parser {
  private pos = 0;
  private depth = 0;

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
    if (t.kind === 'keyword' && WRITES.has(t.value)) {
      throw new SqlError(`Only a SELECT query can run here, not ${t.value}.`, 'unsupported', t.line, t.column);
    }
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

  /** One SELECT up to HAVING: the part each side of a UNION has. ORDER BY and LIMIT belong to the whole query. */
  private selectCore(): SelectStatement {
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

    if (this.token.kind === 'identifier') this.fail('FROM', ' Is a comma missing, or AS before an alias?');
    // Without FROM, the query reads a single row with no columns, as in SQLite.
    let from: TableRef | undefined;
    const joins: JoinClause[] = [];
    if (this.isKeyword('FROM')) {
      lines.FROM = this.next().line;
      from = this.tableRef();
      if (this.isPunct(',')) {
        throw new SqlError(
          "Joining tables with a comma isn't supported here. Use JOIN … ON instead.",
          'unsupported',
          this.token.line,
          this.token.column,
        );
      }
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

    return {
      distinct,
      columns,
      ...(from && { from }),
      joins,
      ...(where && { where }),
      groupBy,
      ...(having && { having }),
      orderBy: [],
      lines,
    };
  }

  select(): SelectStatement {
    const statement = this.selectCore();
    const lines = statement.lines;
    const compound: NonNullable<SelectStatement['compound']> = [];
    while (this.isKeyword('UNION', 'INTERSECT', 'EXCEPT')) {
      const opToken = this.next();
      const op: SetOp = opToken.value === 'UNION' && this.acceptKeyword('ALL') ? 'UNION ALL' : (opToken.value as SetOp);
      const at = this.token;
      compound.push({ op, select: this.selectCore(), line: opToken.line, selectLine: at.line, selectColumn: at.column });
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

    if (this.isKeyword('UNION', 'INTERSECT', 'EXCEPT')) {
      throw new SqlError('ORDER BY and LIMIT go after the last SELECT of a UNION.', 'syntax', this.token.line, this.token.column);
    }
    return { ...statement, ...(compound.length > 0 && { compound }), orderBy, ...(limit && { limit }), lines };
  }

  private wholeNumber(clause: string): number {
    const t = this.token;
    if (t.kind !== 'number' || !/^\d+$/.test(t.value)) {
      throw new SqlError(`${clause} needs a whole number.`, 'syntax', t.line, t.column);
    }
    this.next();
    return Number(t.value);
  }

  private tableRef(): TableRef {
    const name = this.identifier('a table name');
    const ref: TableRef = { table: name.value, line: name.line, column: name.column };
    if (this.acceptKeyword('AS')) ref.alias = this.identifier('an alias').value;
    else if (this.token.kind === 'identifier') ref.alias = this.next().value;
    return ref;
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

  /**
   * The current token is this word, as a keyword or an unquoted identifier. Words such as KEY or
   * CHECK are recognised by position, so they stay usable as names, as in SQLite.
   */
  private isWord(word: string): boolean {
    const t = this.token;
    return (t.kind === 'keyword' || (t.kind === 'identifier' && !t.text.startsWith('"'))) && t.value.toUpperCase() === word;
  }

  private acceptWord(word: string): boolean {
    if (!this.isWord(word)) return false;
    this.next();
    return true;
  }

  private expectWord(word: string): Token {
    if (!this.isWord(word)) this.fail(word);
    return this.next();
  }

  private atEnd(): boolean {
    return this.token.kind === 'eof';
  }

  script(): Statement[] {
    const statements: Statement[] = [];
    for (;;) {
      while (this.isPunct(';')) this.next();
      if (this.atEnd()) break;
      if (statements.length === MAX_STATEMENTS) {
        throw new SqlError(`Scripts are limited to ${MAX_STATEMENTS} statements.`, 'limit', this.token.line, this.token.column);
      }
      statements.push(this.scriptStatement());
      if (!this.atEnd() && !this.isPunct(';')) this.fail('`;` or the end of the statement');
    }
    if (statements.length === 0) throw new SqlError('Write a statement to run.', 'syntax', 1, 1);
    return statements;
  }

  private scriptStatement(): Statement {
    const t = this.token;
    if (this.isKeyword('SELECT')) {
      const select = this.select();
      if (this.isKeyword('UNION', 'INTERSECT', 'EXCEPT')) this.fail('the end of the statement');
      return { kind: 'select', select, line: t.line };
    }
    if (this.isKeyword('INSERT')) return this.insert();
    if (this.isKeyword('UPDATE')) return this.update();
    if (this.isKeyword('DELETE')) return this.deleteFrom();
    if (this.isKeyword('CREATE')) return this.create();
    if (this.isKeyword('DROP')) return this.drop();
    if (this.isKeyword('ALTER')) throw unsupported('ALTER TABLE', t);
    for (const word of ['BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'END']) {
      if (this.isWord(word)) throw unsupported(word, t, 'transactions');
    }
    if (t.kind === 'keyword' && t.value in LATER) throw unsupported(t.value, t, LATER[t.value]);
    return this.fail('a statement such as SELECT, INSERT, UPDATE or DELETE');
  }

  /** Clauses SQLite allows after a write that this interpreter does not run. */
  private rejectWriteTail(): void {
    if (this.isKeyword('ON') && this.peek().value.toUpperCase() === 'CONFLICT') throw unsupported('ON CONFLICT', this.token);
    if (this.isWord('RETURNING')) throw unsupported('RETURNING', this.token);
  }

  private tableName(): TableRef {
    const name = this.identifier('a table name');
    return { table: name.value, line: name.line, column: name.column };
  }

  private nameList(what: string): string[] {
    this.expectPunct('(');
    const names = [this.identifier(what).value];
    while (this.isPunct(',')) {
      this.next();
      names.push(this.identifier(what).value);
    }
    this.expectPunct(')');
    return names;
  }

  private insert(): Statement {
    const start = this.expectKeyword('INSERT');
    if (this.isKeyword('OR')) throw unsupported('INSERT OR', this.token);
    this.expectKeyword('INTO');
    const table = this.tableName();
    const columns = this.isPunct('(') ? this.nameList('a column name') : undefined;
    const lines: { INSERT: number; VALUES?: number; SELECT?: number } = { INSERT: start.line };
    let values: Expr[][] | undefined;
    let select: SelectStatement | undefined;
    if (this.isKeyword('VALUES')) {
      lines.VALUES = this.next().line;
      values = [this.valueRow()];
      while (this.isPunct(',')) {
        this.next();
        values.push(this.valueRow());
      }
    } else if (this.isKeyword('SELECT')) {
      lines.SELECT = this.token.line;
      select = this.select();
    } else if (this.isWord('DEFAULT')) {
      throw unsupported('DEFAULT VALUES', this.token);
    } else {
      this.fail('VALUES or SELECT');
    }
    this.rejectWriteTail();
    return { kind: 'insert', table, ...(columns && { columns }), ...(values && { values }), ...(select && { select }), line: start.line, lines };
  }

  private valueRow(): Expr[] {
    this.expectPunct('(');
    const row = [this.expr()];
    while (this.isPunct(',')) {
      this.next();
      row.push(this.expr());
    }
    this.expectPunct(')');
    return row;
  }

  private update(): Statement {
    const start = this.expectKeyword('UPDATE');
    if (this.isKeyword('OR')) throw unsupported('UPDATE OR', this.token);
    const table = this.tableName();
    const setToken = this.expectKeyword('SET');
    const set: { name: string; expr: Expr; line: number; column: number }[] = [];
    do {
      if (set.length > 0) this.next();
      const column = this.identifier('a column name');
      if (!(this.token.kind === 'operator' && this.token.value === '=')) this.fail('`=`');
      this.next();
      set.push({ name: column.value, expr: this.expr(), line: column.line, column: column.column });
    } while (this.isPunct(','));
    const lines: { UPDATE: number; SET: number; WHERE?: number } = { UPDATE: start.line, SET: setToken.line };
    let where: Expr | undefined;
    if (this.isKeyword('WHERE')) {
      lines.WHERE = this.next().line;
      where = this.expr();
    }
    this.rejectWriteTail();
    return { kind: 'update', table, set, ...(where && { where }), line: start.line, lines };
  }

  private deleteFrom(): Statement {
    const start = this.expectKeyword('DELETE');
    this.expectKeyword('FROM');
    const table = this.tableName();
    const lines: { DELETE: number; WHERE?: number } = { DELETE: start.line };
    let where: Expr | undefined;
    if (this.isKeyword('WHERE')) {
      lines.WHERE = this.next().line;
      where = this.expr();
    }
    this.rejectWriteTail();
    return { kind: 'delete', table, ...(where && { where }), line: start.line, lines };
  }

  private drop(): Statement {
    const start = this.expectKeyword('DROP');
    if (this.isWord('INDEX')) throw unsupported('DROP INDEX', start, 'indexes');
    if (this.isWord('VIEW')) throw unsupported('DROP VIEW', start, 'views');
    this.expectKeyword('TABLE');
    let ifExists = false;
    if (this.acceptWord('IF')) {
      this.expectKeyword('EXISTS');
      ifExists = true;
    }
    const name = this.identifier('a table name');
    return { kind: 'drop', table: name.value, ifExists, line: start.line, column: name.column };
  }

  private create(): Statement {
    const start = this.expectKeyword('CREATE');
    if (this.isWord('TEMP') || this.isWord('TEMPORARY')) throw unsupported('CREATE TEMP TABLE', this.token);
    if (this.isWord('INDEX') || this.isWord('UNIQUE')) throw unsupported('CREATE INDEX', start, 'indexes');
    if (this.isWord('VIEW')) throw unsupported('CREATE VIEW', start, 'views');
    if (this.isWord('TRIGGER')) throw unsupported('CREATE TRIGGER', start);
    this.expectKeyword('TABLE');
    if (this.isWord('IF')) throw unsupported('IF NOT EXISTS', this.token);
    const name = this.identifier('a table name');
    if (this.isKeyword('AS')) throw unsupported('CREATE TABLE … AS', this.token);
    const schema: TableSchema = { name: name.value, columns: [] };
    const checks: Expr[] = [];
    this.expectPunct('(');
    do {
      if (schema.columns.length > 0 || schema.primaryKey || schema.unique || schema.checks || schema.foreignKeys) this.next();
      if (['CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'].some((w) => this.isWord(w))) this.tableConstraint(schema, checks);
      else if (schema.primaryKey || schema.unique || schema.checks || schema.foreignKeys) this.fail('a table constraint, after the columns');
      else schema.columns.push(this.columnDef(checks));
    } while (this.isPunct(','));
    this.expectPunct(')');
    return { kind: 'create', schema, checks, line: start.line, column: start.column };
  }

  private columnType(name: Token): ColumnType {
    const t = this.token;
    if (t.kind !== 'identifier' && t.kind !== 'keyword') {
      throw new SqlError(`Give column \`${name.value}\` a type: INTEGER, REAL or TEXT.`, 'syntax', t.line, t.column);
    }
    const type = t.value.toUpperCase();
    if (!COLUMN_TYPES.has(type)) {
      throw new SqlError(`\`${t.text}\` isn't a column type here. Use INTEGER, REAL or TEXT.`, 'unsupported', t.line, t.column);
    }
    this.next();
    return type as ColumnType;
  }

  private columnDef(checks: Expr[]): ColumnDef {
    const name = this.identifier('a column name');
    const column: ColumnDef = { name: name.value, type: this.columnType(name) };
    for (;;) {
      if (this.acceptWord('CONSTRAINT')) this.identifier('a constraint name');
      else if (this.acceptWord('PRIMARY')) {
        this.expectWord('KEY');
        if (this.isKeyword('ASC', 'DESC')) this.next();
        if (this.isWord('AUTOINCREMENT')) throw unsupported('AUTOINCREMENT', this.token);
        column.primaryKey = true;
      } else if (this.acceptKeyword('NOT')) {
        this.expectKeyword('NULL');
        column.notNull = true;
      } else if (this.acceptKeyword('NULL')) {
        // An explicit NULL means "may be NULL", the default.
      } else if (this.acceptWord('UNIQUE')) column.unique = true;
      else if (this.acceptWord('DEFAULT')) column.default = this.defaultValue();
      else if (this.acceptWord('CHECK')) column.check = this.checkCondition(checks);
      else if (this.acceptWord('REFERENCES')) {
        const table = this.identifier('a table name').value;
        const [refColumn, ...more] = this.nameList('a column name');
        if (more.length > 0) this.fail('one column');
        this.rejectForeignKeyActions();
        column.references = { table, column: refColumn! };
      } else if (this.isWord('COLLATE') || this.isWord('GENERATED') || this.isWord('AS')) {
        throw unsupported(this.token.value.toUpperCase(), this.token);
      } else break;
    }
    return column;
  }

  private tableConstraint(schema: TableSchema, checks: Expr[]): void {
    if (this.acceptWord('CONSTRAINT')) this.identifier('a constraint name');
    if (this.acceptWord('PRIMARY')) {
      this.expectWord('KEY');
      schema.primaryKey = this.nameList('a column name');
    } else if (this.acceptWord('UNIQUE')) {
      (schema.unique ??= []).push(this.nameList('a column name'));
    } else if (this.acceptWord('CHECK')) {
      (schema.checks ??= []).push(this.checkCondition(checks));
    } else if (this.acceptWord('FOREIGN')) {
      this.expectWord('KEY');
      const columns = this.nameList('a column name');
      this.expectWord('REFERENCES');
      const table = this.identifier('a table name').value;
      const refColumns = this.nameList('a column name');
      this.rejectForeignKeyActions();
      (schema.foreignKeys ??= []).push({ columns, table, refColumns });
    } else {
      this.fail('PRIMARY KEY, UNIQUE, CHECK or FOREIGN KEY');
    }
  }

  private rejectForeignKeyActions(): void {
    if (this.isKeyword('ON')) throw unsupported(`ON ${this.peek().value.toUpperCase()}`, this.token);
    if (this.isWord('DEFERRABLE') || this.isWord('MATCH')) throw unsupported(this.token.value.toUpperCase(), this.token);
  }

  private defaultValue(): number | string | null {
    const t = this.token;
    const negative = t.kind === 'operator' && t.value === '-';
    const value = negative ? this.peek() : t;
    if (value.kind === 'number') {
      if (negative) this.next();
      this.next();
      return (negative ? -1 : 1) * Number(value.value);
    }
    if (!negative && t.kind === 'string') return this.next().value;
    if (!negative && this.isKeyword('NULL')) {
      this.next();
      return null;
    }
    throw unsupported('DEFAULT with an expression', t);
  }

  /** A CHECK condition, kept as text and collected in `checks`. It may only read the row's own columns. */
  private checkCondition(checks: Expr[]): string {
    this.expectPunct('(');
    const start = this.token;
    const condition = this.expr();
    this.expectPunct(')');
    const found = firstNode(condition, (e) => e.type === 'subquery' || e.type === 'inSubquery' || e.type === 'aggregate');
    if (found) throw unsupported(found.type === 'aggregate' ? 'aggregates in CHECK' : 'subqueries in CHECK', start);
    checks.push(condition);
    return condition.text;
  }

  /** A whole input that must be one expression, such as a stored CHECK condition. */
  standaloneExpr(): Expr {
    const expr = this.expr();
    if (this.token.kind !== 'eof') this.fail('the end of the expression');
    return expr;
  }

  expr(): Expr {
    return this.nested(() => this.or());
  }

  /** Runs `parse` one nesting level deeper, refusing absurd depths before the stack overflows. */
  private nested<T>(parse: () => T): T {
    if (++this.depth > MAX_DEPTH) {
      throw new SqlError('This query nests too deeply (more than 100 levels).', 'limit', this.token.line, this.token.column);
    }
    try {
      return parse();
    } finally {
      this.depth--;
    }
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
    if (this.acceptKeyword('NOT')) return this.node(start, { type: 'unary', op: 'NOT', operand: this.nested(() => this.not()) });
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
      const operand = this.nested(() => this.unary());
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
        if (t.value === 'CASE') return this.caseExpr();
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

  private caseExpr(): Expr {
    const start = this.expectKeyword('CASE');
    const operand = this.isKeyword('WHEN') ? undefined : this.expr();
    const whens: { when: Expr; then: Expr }[] = [];
    do {
      this.expectKeyword('WHEN');
      const when = this.expr();
      this.expectKeyword('THEN');
      whens.push({ when, then: this.expr() });
    } while (this.isKeyword('WHEN'));
    const otherwise = this.acceptKeyword('ELSE') ? this.expr() : undefined;
    this.expectKeyword('END');
    return this.node(start, { type: 'case', ...(operand && { operand }), whens, ...(otherwise && { else: otherwise }) });
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
    return { ok: false, error: asSqlError(error) };
  }
}

/** The first node of `expr`, itself included, for which `test` holds. */
export function firstNode(expr: Expr, test: (e: Expr) => boolean): Expr | undefined {
  if (test(expr)) return expr;
  const children: Expr[] = [];
  switch (expr.type) {
    case 'unary':
    case 'isNull':
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
    case 'inSubquery':
      children.push(expr.operand);
      break;
    case 'aggregate':
      if (expr.arg !== '*') children.push(expr.arg);
      break;
    case 'case':
      children.push(...caseParts(expr));
      break;
  }
  for (const child of children) {
    const found = firstNode(child, test);
    if (found) return found;
  }
  return undefined;
}

/** Parses a script of statements separated by `;`. Never throws. */
export function parseScript(sql: string): ScriptParse {
  try {
    if (sql.length > MAX_QUERY_LENGTH) {
      throw new SqlError('Scripts are limited to 2,000 characters.', 'limit', 1, 1);
    }
    return { ok: true, statements: new Parser(sql, tokenize(sql)).script() };
  } catch (error) {
    return { ok: false, error: asSqlError(error) };
  }
}

/** Parses one expression, such as a stored CHECK condition. Throws SqlError. */
export function parseExpression(text: string): Expr {
  return new Parser(text, tokenize(text)).standaloneExpr();
}
