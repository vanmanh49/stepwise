import { describe, expect, it } from 'vitest';
import { datasets, findTable } from './datasets';
import { executeSelect, runQuery, type QueryResult, type TraceEvent } from './execute';
import { parseQuery } from './parse';
import { Real, toPlain } from './values';

const shop = datasets.shop;
const school = datasets.school;

function run(sql: string, db = shop): QueryResult {
  const result = runQuery(db, sql);
  if (!result.ok) throw new Error(result.error.message);
  return result.result;
}

const plain = (r: QueryResult) => r.rows.map((row) => row.map(toPlain));

function fail(sql: string, db = shop): string {
  const result = runQuery(db, sql);
  if (result.ok) throw new Error('expected an error');
  return result.error.message;
}

const customers = findTable(shop, 'customers')!.rows;
const products = findTable(shop, 'products')!.rows;
const orders = findTable(shop, 'orders')!.rows;
const prices = products.map((p) => p[3] as number);

describe('aggregates', () => {
  it('computes every aggregate over the whole table', () => {
    const r = run(
      'SELECT COUNT(*), COUNT(city), COUNT(DISTINCT city), SUM(id), AVG(id), MIN(name), MAX(name) FROM customers',
    );
    const names = customers.map((c) => c[1] as string).toSorted();
    expect(plain(r)).toEqual([[10, 8, 4, 55, 5.5, names[0], names.at(-1)]]);
  });

  it('sums REAL prices as REAL and averages them', () => {
    const sum = prices.reduce((a, b) => a + b, 0);
    const [row] = run('SELECT SUM(price), AVG(price), MIN(price), MAX(price) FROM products').rows;
    expect(row).toEqual([new Real(sum), new Real(sum / prices.length), new Real(6.5), new Real(59.9)]);
  });

  it('keeps SUM of integers an integer and makes AVG real', () => {
    const [row] = run('SELECT SUM(quantity), AVG(quantity) FROM order_items').rows;
    expect(typeof row![0]).toBe('number');
    expect(row![1]).toBeInstanceOf(Real);
  });

  it('returns one row over empty input', () => {
    expect(plain(run('SELECT COUNT(*), COUNT(id), SUM(id), AVG(id), MIN(id), MAX(id) FROM orders WHERE 0'))).toEqual([
      [0, 0, null, null, null, null],
    ]);
  });

  it('allows expressions around aggregates', () => {
    expect(plain(run('SELECT MAX(id) - MIN(id) + 1 FROM orders'))).toEqual([[orders.length]]);
  });
});

describe('GROUP BY and HAVING', () => {
  it('makes one row per group, NULL included, in order of first appearance', () => {
    expect(plain(run('SELECT city, COUNT(*) FROM customers GROUP BY city'))).toEqual([
      ['Hanoi', 3],
      ['Hue', 2],
      [null, 2],
      ['Da Nang', 2],
      ['Can Tho', 1],
    ]);
  });

  it('filters groups with HAVING', () => {
    expect(plain(run('SELECT category FROM products GROUP BY category HAVING AVG(price) > 30'))).toEqual([['Electronics']]);
    expect(plain(run('SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 1'))).toEqual([
      [1, 3],
      [2, 2],
      [3, 2],
    ]);
  });

  it('treats the whole table as one group for HAVING without GROUP BY', () => {
    expect(plain(run('SELECT COUNT(*) FROM orders HAVING COUNT(*) > 100'))).toEqual([]);
    expect(plain(run('SELECT COUNT(*) FROM orders HAVING COUNT(*) > 1'))).toEqual([[orders.length]]);
  });

  it('orders groups by an aggregate', () => {
    expect(plain(run('SELECT category, COUNT(*) AS n FROM products GROUP BY category ORDER BY n DESC, category'))).toEqual([
      ['Electronics', 4],
      ['Books', 3],
      ['Kitchen', 2],
    ]);
    expect(plain(run('SELECT category FROM products GROUP BY category ORDER BY MAX(price)'))).toEqual([
      ['Kitchen'],
      ['Books'],
      ['Electronics'],
    ]);
  });

  it('accepts grouped columns written with or without a table name', () => {
    expect(run('SELECT p.category, COUNT(*) FROM products p GROUP BY category').rows).toHaveLength(3);
    expect(run('SELECT p.id, p.name, SUM(oi.quantity) FROM products p LEFT JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id, p.name').rows).toHaveLength(products.length);
  });

  it('accepts expressions that match a GROUP BY expression', () => {
    expect(plain(run('SELECT year + 1, COUNT(*) FROM students GROUP BY year + 1', school))).toEqual([
      [2, 3],
      [3, 3],
      [4, 2],
      [5, 2],
    ]);
    expect(run('SELECT price > 10, COUNT(*) FROM products GROUP BY price > 10').rows).toHaveLength(2);
  });

  it('groups by select-list position', () => {
    expect(run('SELECT city, COUNT(*) FROM customers GROUP BY 1')).toEqual(run('SELECT city, COUNT(*) FROM customers GROUP BY city'));
    expect(fail('SELECT city FROM customers GROUP BY 2')).toBe('GROUP BY position 2 is out of range: the query returns 1 column.');
  });

  it('resolves SELECT aliases in GROUP BY and HAVING', () => {
    expect(plain(run('SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id HAVING n > 1'))).toEqual([
      [1, 3],
      [2, 2],
      [3, 2],
    ]);
    expect(run('SELECT category AS c, COUNT(*) FROM products GROUP BY c').rows).toHaveLength(3);
  });

  it('rejects columns that are neither grouped nor aggregated', () => {
    const message = '`name` must appear in GROUP BY or be used in an aggregate such as COUNT or MAX.';
    expect(fail('SELECT name, COUNT(*) FROM customers')).toBe(message);
    expect(fail('SELECT name FROM products GROUP BY category')).toBe(message);
  });

  it('points WHERE aggregates to HAVING', () => {
    expect(fail('SELECT customer_id FROM orders WHERE COUNT(*) > 1')).toBe(
      "Aggregates like COUNT can't be used in WHERE, which runs before rows are grouped. Use HAVING instead.",
    );
  });

  it('rejects nested aggregates', () => {
    expect(fail('SELECT MAX(COUNT(*)) FROM orders')).toBe("Aggregates can't be nested.");
  });
});

describe('subqueries', () => {
  it('filters with IN and NOT IN', () => {
    expect(plain(run('SELECT name FROM students WHERE id IN (SELECT student_id FROM enrollments WHERE course_id = 1)', school))).toEqual([
      ['Mai'],
      ['Tuan'],
      ['Phuong'],
      ['Viet'],
    ]);
    expect(plain(run('SELECT name FROM students WHERE id NOT IN (SELECT student_id FROM enrollments)', school))).toEqual([['Nga']]);
  });

  it('uses a scalar subquery as a value', () => {
    expect(plain(run('SELECT title FROM courses WHERE credits > (SELECT AVG(credits) FROM courses)', school))).toEqual([
      ['Databases'],
      ['Algorithms'],
      ['Compilers'],
    ]);
  });

  it('gives NULL for no rows and the first row for several', () => {
    expect(plain(run('SELECT (SELECT id FROM orders WHERE 0) FROM customers WHERE id = 1'))).toEqual([[null]]);
    expect(plain(run('SELECT (SELECT id FROM orders) FROM customers WHERE id = 1'))).toEqual([[1]]);
  });

  it('needs one column from a value subquery', () => {
    expect(fail('SELECT name FROM customers WHERE id = (SELECT id, name FROM customers)')).toBe(
      'A subquery used as a value must return one column.',
    );
  });

  it('runs correlated subqueries against the outer row', () => {
    expect(
      plain(run('SELECT name FROM customers c WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) > 1')),
    ).toEqual([['Ana'], ['Binh'], ['Chi']]);
  });

  it('resolves a correlated subquery that repeats the outer column names', () => {
    // `salary` inside means x.salary, and e.department_id reaches out to the outer row.
    const sql = 'SELECT name FROM employees e WHERE salary > (SELECT AVG(salary) FROM employees x WHERE x.department_id = e.department_id)';
    expect(plain(run(sql, datasets.company))).toEqual([['Minh'], ['Hoa'], ['Tuan'], ['Vy'], ['Khoa']]);
  });

  it('finds nothing with NOT IN against a NULL', () => {
    expect(run('SELECT name FROM customers WHERE id NOT IN (1, NULL)').rows).toEqual([]);
    expect(run('SELECT name FROM customers WHERE city NOT IN (SELECT city FROM customers)').rows).toEqual([]);
  });
});

describe('grouping trace', () => {
  it('reports groups and then HAVING tests on group rows', () => {
    const parsed = parseQuery('SELECT category, COUNT(*) FROM products GROUP BY category HAVING COUNT(*) > 2');
    if (!parsed.ok) throw new Error(parsed.error.message);
    const events: TraceEvent[] = [];
    executeSelect(shop, parsed.statement, (e) => events.push(e));
    const grouped = events.find((e) => e.kind === 'grouped');
    if (grouped?.kind !== 'grouped') throw new Error('no grouped event');
    expect(grouped.groups.flatMap((g) => g.rowIds).toSorted()).toEqual(products.map((_, i) => `products#${i}`).toSorted());
    expect(grouped.relation.rows.map((r) => r.id)).toEqual(['group#1', 'group#2', 'group#3']);
    const having = events.filter((e) => e.kind === 'filter-test');
    expect(having).toHaveLength(3);
    for (const e of having) expect(e).toMatchObject({ clause: 'HAVING', row: expect.stringMatching(/^group#/) });
    expect(having[0]).toMatchObject({ values: { 'COUNT(*)': '3' } });
  });
});
