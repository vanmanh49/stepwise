import { describe, expect, it } from 'vitest';
import type { Statement } from './ast';
import { parseExpression, parseQuery, parseScript } from './parse';

function parse(sql: string): Statement[] {
  const result = parseScript(sql);
  if (!result.ok) throw new Error(`${result.error.message} (${result.error.line}:${result.error.column})`);
  return result.statements;
}

function failure(sql: string) {
  const result = parseScript(sql);
  if (result.ok) throw new Error(`expected an error for: ${sql}`);
  return result.error;
}

const only = <K extends Statement['kind']>(sql: string, kind: K) => {
  const [statement] = parse(sql);
  if (statement?.kind !== kind) throw new Error(`expected ${kind}, got ${statement?.kind}`);
  return statement as Extract<Statement, { kind: K }>;
};

describe('parseScript', () => {
  it('splits a script into statements with their lines', () => {
    const statements = parse("INSERT INTO t (a, b) VALUES (1, 'x'), (2, NULL);\nSELECT * FROM t");
    expect(statements.map((s) => [s.kind, s.line])).toEqual([
      ['insert', 1],
      ['select', 2],
    ]);
    const insert = statements[0] as Extract<Statement, { kind: 'insert' }>;
    expect(insert.table.table).toBe('t');
    expect(insert.columns).toEqual(['a', 'b']);
    expect(insert.values).toHaveLength(2);
    expect(insert.values![1]![1]!.type).toBe('literal');
  });

  it('parses INSERT … SELECT', () => {
    const insert = only('INSERT INTO t\nSELECT * FROM u', 'insert');
    expect(insert.values).toBeUndefined();
    expect(insert.select?.from?.table).toBe('u');
    expect(insert.lines).toEqual({ INSERT: 1, SELECT: 2 });
  });

  it('parses UPDATE with several assignments and WHERE', () => {
    const update = only("UPDATE t\nSET a = a + 1, b = 'y'\nWHERE c IS NULL", 'update');
    expect(update.set.map((s) => [s.name, s.expr.text, s.line])).toEqual([
      ['a', 'a + 1', 2],
      ['b', "'y'", 2],
    ]);
    expect(update.where?.type).toBe('isNull');
    expect(update.lines).toEqual({ UPDATE: 1, SET: 2, WHERE: 3 });
  });

  it('parses DELETE with and without WHERE', () => {
    expect(only('DELETE FROM t', 'delete').where).toBeUndefined();
    const del = only('DELETE FROM t\nWHERE id = 3', 'delete');
    expect(del.lines).toEqual({ DELETE: 1, WHERE: 2 });
  });

  it('parses DROP TABLE', () => {
    expect(only('DROP TABLE IF EXISTS t', 'drop')).toMatchObject({ table: 't', ifExists: true });
    expect(only('DROP TABLE t', 'drop')).toMatchObject({ table: 't', ifExists: false });
  });

  it('parses CREATE TABLE with every supported constraint', () => {
    const create = only(
      'CREATE TABLE m (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, age INTEGER DEFAULT 0 CHECK (age >= 0), ' +
        "club_id integer REFERENCES clubs(id), note TEXT DEFAULT 'none', score REAL DEFAULT -1.5, " +
        'UNIQUE (email, age), CHECK (age < 150), FOREIGN KEY (club_id) REFERENCES clubs(id))',
      'create',
    );
    expect(create.schema).toEqual({
      name: 'm',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'email', type: 'TEXT', notNull: true, unique: true },
        { name: 'age', type: 'INTEGER', default: 0, check: 'age >= 0' },
        { name: 'club_id', type: 'INTEGER', references: { table: 'clubs', column: 'id' } },
        { name: 'note', type: 'TEXT', default: 'none' },
        { name: 'score', type: 'REAL', default: -1.5 },
      ],
      unique: [['email', 'age']],
      checks: ['age < 150'],
      foreignKeys: [{ columns: ['club_id'], table: 'clubs', refColumns: ['id'] }],
    });
  });

  it('parses a composite primary key and ignores constraint names', () => {
    const create = only('CREATE TABLE e (s INTEGER, c INTEGER, CONSTRAINT pk_e PRIMARY KEY (s, c))', 'create');
    expect(create.schema.primaryKey).toEqual(['s', 'c']);
  });

  it('keeps words like key and index usable as column names', () => {
    const create = only('CREATE TABLE k (key TEXT, "index" INTEGER, check_date TEXT)', 'create');
    expect(create.schema.columns.map((c) => c.name)).toEqual(['key', 'index', 'check_date']);
  });

  it('does not split on semicolons inside strings or comments', () => {
    const statements = parse("INSERT INTO t VALUES ('a;b'); -- c;d\nSELECT a FROM t");
    expect(statements).toHaveLength(2);
    const insert = statements[0] as Extract<Statement, { kind: 'insert' }>;
    expect(insert.values![0]![0]).toMatchObject({ type: 'literal', value: 'a;b' });
  });

  it('accepts a trailing semicolon and blank statements between', () => {
    expect(parse('SELECT 1 FROM t;;\n;')).toHaveLength(1);
  });

  it('limits scripts to 10 statements', () => {
    const error = failure(Array.from({ length: 11 }, () => 'DELETE FROM t').join(';\n'));
    expect(error.kind).toBe('limit');
    expect(error.message).toBe('Scripts are limited to 10 statements.');
  });

  it('asks for something to run when the script is empty', () => {
    expect(failure(' ;; -- nothing').message).toBe('Write a statement to run.');
  });

  it.each([
    ['ALTER TABLE t ADD c TEXT', 'ALTER'],
    ['INSERT OR REPLACE INTO t VALUES (1)', 'INSERT OR'],
    ['INSERT INTO t VALUES (1) ON CONFLICT DO NOTHING', 'ON CONFLICT'],
    ['CREATE TABLE c (p INTEGER REFERENCES p(id) ON DELETE CASCADE)', 'ON DELETE'],
    ['UPDATE t SET a = 1 RETURNING *', 'RETURNING'],
    ['CREATE TABLE t (a INTEGER PRIMARY KEY AUTOINCREMENT)', 'AUTOINCREMENT'],
    ['CREATE TABLE t (a INTEGER CHECK (a IN (SELECT id FROM u)))', 'subqueries in CHECK'],
  ])('rejects %s as unsupported', (sql, feature) => {
    const error = failure(sql);
    expect(error.kind).toBe('unsupported');
    expect(error.message).toContain(feature);
  });

  it('names the three column types it supports', () => {
    const error = failure('CREATE TABLE t (name VARCHAR(20))');
    expect(error.kind).toBe('unsupported');
    expect(error.message).toContain('INTEGER, REAL or TEXT');
    expect(failure('CREATE TABLE t (name)').message).toContain('INTEGER, REAL or TEXT');
  });

  it('points at the problem', () => {
    const error = failure('UPDATE t SET = 1');
    expect([error.line, error.column]).toEqual([1, 14]);
  });

  it('reports errors on the right line of a longer script', () => {
    const error = failure('DELETE FROM t;\nUPDATE t SET a 1');
    expect(error.line).toBe(2);
  });
});

describe('phase 4 statements', () => {
  it('parses CREATE INDEX and DROP INDEX', () => {
    expect(only('CREATE UNIQUE INDEX IF NOT EXISTS i ON t (a, b)', 'create-index')).toMatchObject({
      name: 'i',
      table: 't',
      columns: ['a', 'b'],
      unique: true,
      ifNotExists: true,
      line: 1,
    });
    expect(only('CREATE INDEX idx ON employees(salary)', 'create-index')).toMatchObject({ unique: false, ifNotExists: false, columns: ['salary'] });
    expect(only('DROP INDEX IF EXISTS i', 'drop-index')).toMatchObject({ name: 'i', ifExists: true });
  });

  it('parses CREATE VIEW with its SELECT text and DROP VIEW', () => {
    const view = only('CREATE VIEW v (x, y) AS\nSELECT a, b FROM t WHERE a > 1', 'create-view');
    expect(view).toMatchObject({ name: 'v', columns: ['x', 'y'], sql: 'SELECT a, b FROM t WHERE a > 1', ifNotExists: false });
    expect(view.query.from?.table).toBe('t');
    expect(only('CREATE VIEW IF NOT EXISTS w AS SELECT 1', 'create-view').ifNotExists).toBe(true);
    expect(only('DROP VIEW IF EXISTS v', 'drop-view')).toMatchObject({ name: 'v', ifExists: true });
  });

  it('parses EXPLAIN QUERY PLAN', () => {
    expect(only('EXPLAIN QUERY PLAN SELECT * FROM t', 'explain').select.from?.table).toBe('t');
    expect(failure('EXPLAIN SELECT 1').message).toBe('Only EXPLAIN QUERY PLAN is supported here.');
  });

  it.each([
    ['BEGIN', 'begin', undefined],
    ['BEGIN TRANSACTION', 'begin', undefined],
    ['COMMIT', 'commit', undefined],
    ['END', 'commit', undefined],
    ['END TRANSACTION', 'commit', undefined],
    ['ROLLBACK', 'rollback', undefined],
    ['SAVEPOINT s', 'savepoint', 's'],
    ['RELEASE s', 'release', 's'],
    ['RELEASE SAVEPOINT s', 'release', 's'],
    ['ROLLBACK TO s', 'rollback-to', 's'],
    ['ROLLBACK TO SAVEPOINT s', 'rollback-to', 's'],
  ])('parses %s', (sql, action, name) => {
    const statement = only(sql, 'transaction');
    expect(statement.action).toBe(action);
    expect(statement.name).toBe(name);
  });

  it('parses SET TRANSACTION ISOLATION LEVEL', () => {
    expect(only('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'set-isolation').level).toBe('REPEATABLE READ');
    expect(only('SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED', 'set-isolation').level).toBe('READ UNCOMMITTED');
    expect(failure('SET TRANSACTION ISOLATION LEVEL SNAPSHOT').message).toContain('READ UNCOMMITTED, READ COMMITTED, REPEATABLE READ or SERIALIZABLE');
  });

  it('reads A: and B: session prefixes', () => {
    const statements = parse('A: BEGIN;\nB: SELECT * FROM t;\na: COMMIT');
    expect(statements.map((s) => [s.kind, s.session, s.line])).toEqual([
      ['transaction', 'A', 1],
      ['select', 'B', 2],
      ['transaction', 'A', 3],
    ]);
    expect(parse('SELECT 1')[0]!.session).toBeUndefined();
    expect(failure('A: SELECT 1; SELECT 2').message).toBe('Start every statement with A: or B:, or none of them.');
    expect(failure('C: SELECT 1').message).toBe('Sessions are called A and B.');
  });
});

describe('parseExpression', () => {
  it('parses a CHECK condition', () => {
    expect(parseExpression('quantity > 0')).toMatchObject({ type: 'binary', op: '>' });
  });
});

describe('parseQuery', () => {
  it('still runs one SELECT only', () => {
    const result = parseQuery('DELETE FROM t');
    expect(result.ok).toBe(false);
  });
});
