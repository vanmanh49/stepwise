import { describe, expect, it } from 'vitest';
import type { Expr, SelectStatement } from './ast';
import { parseQuery } from './parse';
import { Real } from './values';

function parse(sql: string): SelectStatement {
  const result = parseQuery(sql);
  if (!result.ok) throw new Error(result.error.message);
  return result.statement;
}

function error(sql: string) {
  const result = parseQuery(sql);
  if (result.ok) throw new Error('expected a parse error');
  return result.error;
}

const where = (sql: string): Expr => {
  const w = parse(sql).where;
  if (!w) throw new Error('no WHERE');
  return w;
};

describe('parseQuery', () => {
  it('parses every supported clause', () => {
    const s = parse(
      'SELECT DISTINCT c.name AS n, price * 2 FROM customers c LEFT JOIN orders o ON o.customer_id = c.id ' +
        'WHERE c.city IS NOT NULL AND price BETWEEN 1 AND 9 GROUP BY c.name HAVING COUNT(DISTINCT o.id) > 1 ' +
        'ORDER BY n DESC, 2 LIMIT 5 OFFSET 2;',
    );
    expect(s.distinct).toBe(true);
    expect(s.columns[0]).toMatchObject({ kind: 'expr', alias: 'n', expr: { type: 'column', table: 'c', name: 'name' } });
    expect(s.columns[1]).toMatchObject({ kind: 'expr', expr: { type: 'binary', op: '*', text: 'price * 2' } });
    expect(s.from).toEqual({ table: 'customers', alias: 'c', line: 1, column: 45 });
    expect(s.joins[0]).toMatchObject({ kind: 'left', table: 'orders', alias: 'o', on: { type: 'binary', op: '=' } });
    expect(s.where).toMatchObject({ type: 'binary', op: 'AND', left: { type: 'isNull', negated: true } });
    expect(s.groupBy[0]).toMatchObject({ type: 'column', table: 'c', name: 'name' });
    expect(s.having).toMatchObject({ type: 'binary', op: '>', left: { type: 'aggregate', fn: 'COUNT', distinct: true } });
    expect(s.orderBy).toMatchObject([{ desc: true }, { desc: false, expr: { type: 'literal', value: 2 } }]);
    expect(s.limit).toEqual({ count: 5, offset: 2 });
  });

  it('records the line of each clause', () => {
    const s = parse('SELECT name\nFROM customers\nWHERE id = 1\nORDER BY name');
    expect(s.lines).toEqual({ SELECT: 1, FROM: 2, WHERE: 3, 'ORDER BY': 4 });
    expect(parse('SELECT DISTINCT city\nFROM customers').lines).toMatchObject({ SELECT: 1, DISTINCT: 1 });
  });

  it('gives AND higher precedence than OR, and NOT higher than AND', () => {
    expect(where('SELECT * FROM t WHERE a OR b AND NOT c')).toMatchObject({
      op: 'OR',
      left: { type: 'column', name: 'a' },
      right: { op: 'AND', left: { name: 'b' }, right: { type: 'unary', op: 'NOT', operand: { name: 'c' } } },
    });
  });

  it('gives * higher precedence than +', () => {
    expect(where('SELECT * FROM t WHERE a + b * c > 1')).toMatchObject({
      op: '>',
      left: { op: '+', right: { op: '*' } },
    });
  });

  it('parses IN, subqueries and LIKE', () => {
    expect(where('SELECT * FROM t WHERE x NOT IN (1, 2)')).toMatchObject({ type: 'inList', negated: true, items: [{}, {}] });
    expect(where('SELECT * FROM t WHERE x IN (SELECT id FROM t)')).toMatchObject({ type: 'inSubquery', negated: false });
    expect(where('SELECT * FROM t WHERE x = (SELECT MAX(id) FROM t)')).toMatchObject({
      right: { type: 'subquery', query: { columns: [{ expr: { type: 'aggregate', fn: 'MAX' } }] } },
    });
    expect(where("SELECT * FROM t WHERE x NOT LIKE 'a%'")).toMatchObject({ type: 'like', negated: true });
  });

  it('reads integer and real literals', () => {
    expect(where('SELECT * FROM t WHERE x = 2.0')).toMatchObject({ right: { type: 'literal', value: new Real(2) } });
    expect(where('SELECT * FROM t WHERE x = 2')).toMatchObject({ right: { type: 'literal', value: 2 } });
    expect(where('SELECT * FROM t WHERE x = -1')).toMatchObject({ right: { type: 'unary', op: '-' } });
  });

  it('parses stars and qualified stars', () => {
    expect(parse('SELECT *, c.* FROM customers c').columns).toEqual([{ kind: 'star' }, { kind: 'star', table: 'c' }]);
    expect(parse('SELECT COUNT(*) FROM t').columns[0]).toMatchObject({ expr: { type: 'aggregate', arg: '*' } });
  });

  it('accepts a trailing semicolon and inner joins', () => {
    const s = parse('SELECT 1 FROM t INNER JOIN u ON t.id = u.id JOIN v AS w ON w.id = u.id;');
    expect(s.joins.map((j) => [j.kind, j.alias])).toEqual([
      ['inner', undefined],
      ['inner', 'w'],
    ]);
  });
});

describe('parse errors', () => {
  it('points at the token where FROM was expected', () => {
    const e = error('SELECT name customers');
    expect(e.message).toContain('Expected FROM');
    expect(e).toMatchObject({ kind: 'syntax', line: 1, column: 13 });
  });

  it('describes the end of the query', () => {
    expect(error('SELECT name FROM').message).toBe('Expected a table name, found the end of the query.');
  });

  it('asks for a query when there is none', () => {
    expect(error('').message).toBe('Write a query to run.');
    expect(error('-- only a comment').message).toBe('Write a query to run.');
  });

  it('runs one statement at a time', () => {
    expect(error('SELECT 1 FROM t; SELECT 2 FROM t').message).toBe('Run one statement at a time.');
  });

  it('limits the query length', () => {
    const e = error(`SELECT name FROM t WHERE name = '${'x'.repeat(2000)}'`);
    expect(e).toMatchObject({ kind: 'limit', message: 'Queries are limited to 2,000 characters.' });
  });

  it('needs a whole number after LIMIT and OFFSET', () => {
    expect(error('SELECT 1 FROM t LIMIT 2.5').message).toBe('LIMIT needs a whole number.');
    expect(error('SELECT 1 FROM t LIMIT 2 OFFSET x').message).toBe('OFFSET needs a whole number.');
  });

  it.each([
    ['INSERT INTO t VALUES (1)', 'Only a SELECT query can run here, not INSERT.', undefined],
    ['UPDATE t SET a = 1', 'Only a SELECT query can run here, not UPDATE.', undefined],
    ['DELETE FROM t', 'Only a SELECT query can run here, not DELETE.', undefined],
    ['CREATE TABLE t (a INTEGER)', 'Only a SELECT query can run here, not CREATE.', undefined],
    ['WITH x AS (SELECT 1) SELECT * FROM x', '`WITH` isn\'t supported here yet. It is covered in a later lesson.', 'ctes'],
    ['SELECT COUNT(*) OVER (PARTITION BY a) FROM t', '`OVER` isn\'t supported here yet. It is covered in a later lesson.', 'window-functions'],
    ['SELECT * FROM t RIGHT JOIN u ON t.a = u.a', '`RIGHT JOIN` isn\'t supported here yet.', undefined],
    ['SELECT UPPER(name) FROM t', 'Function `UPPER` isn\'t supported here yet.', undefined],
  ])('explains that %s is unsupported', (sql, message, topic) => {
    const e = error(sql);
    expect(e.kind).toBe('unsupported');
    expect(e.message).toBe(message);
    expect(e.topic).toBe(topic);
  });

  it('reports tokenizer errors', () => {
    expect(error("SELECT 'abc FROM t").message).toBe('This string is missing its closing quote.');
  });
});
