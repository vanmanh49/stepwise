import { describe, expect, it } from 'vitest';
import { datasets } from './datasets';
import { runQuery } from './execute';
import { parseQuery } from './parse';
import { toPlain } from './values';

export function rows(sql: string, db = datasets.shop) {
  const result = runQuery(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} (${result.error.line}:${result.error.column})`);
  return result.result.rows.map((r) => r.map(toPlain));
}

export function error(sql: string, db = datasets.shop) {
  const result = runQuery(db, sql);
  if (result.ok) throw new Error(`expected an error: ${sql}`);
  return result.error;
}

describe('CASE', () => {
  it('parses the searched form', () => {
    const parsed = parseQuery("SELECT CASE WHEN price > 1 THEN 'a' WHEN price > 0 THEN 'b' ELSE 'c' END FROM products");
    if (!parsed.ok) throw new Error(parsed.error.message);
    const item = parsed.statement.columns[0]!;
    expect(item.kind === 'expr' && item.expr).toMatchObject({ type: 'case', whens: [{}, {}], else: { type: 'literal', value: 'c' } });
  });

  it('parses the simple form', () => {
    const parsed = parseQuery("SELECT CASE category WHEN 'Books' THEN 1 END FROM products");
    if (!parsed.ok) throw new Error(parsed.error.message);
    const item = parsed.statement.columns[0]!;
    expect(item.kind === 'expr' && item.expr).toMatchObject({ type: 'case', operand: { type: 'column', name: 'category' } });
  });

  it('needs END', () => {
    expect(error("SELECT CASE WHEN 1 THEN 'a' FROM products").message).toContain('Expected END');
  });

  it('takes the first true branch, and NULL without ELSE', () => {
    expect(rows('SELECT CASE WHEN 1 = 1 THEN 1 WHEN 1 = 1 THEN 2 END FROM customers WHERE id = 1')).toEqual([[1]]);
    expect(rows('SELECT CASE WHEN 1 = 0 THEN 1 END FROM customers WHERE id = 1')).toEqual([[null]]);
  });

  it('never matches NULL in the simple form', () => {
    expect(rows("SELECT CASE city WHEN NULL THEN 'n' ELSE 'e' END FROM customers WHERE id = 4")).toEqual([['e']]);
  });

  it('works inside aggregates and GROUP BY', () => {
    expect(rows("SELECT SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) FROM orders")).toEqual([[7]]);
    expect(rows("SELECT CASE WHEN price > 30 THEN 'high' ELSE 'low' END, COUNT(*) FROM products GROUP BY CASE WHEN price > 30 THEN 'high' ELSE 'low' END ORDER BY 1")).toEqual([
      ['high', 4],
      ['low', 5],
    ]);
  });
});
