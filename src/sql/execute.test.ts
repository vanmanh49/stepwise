import { describe, expect, it } from 'vitest';
import { cloneDataset, datasets, findTable } from './datasets';
import { runQuery, type QueryResult, type TraceEvent, executeSelect } from './execute';
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

function fail(sql: string, db = shop) {
  const result = runQuery(db, sql);
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

const customers = findTable(shop, 'customers')!.rows;
const products = findTable(shop, 'products')!.rows;
const orders = findTable(shop, 'orders')!.rows;

describe('runQuery: FROM and SELECT', () => {
  it('returns every row and column for SELECT *', () => {
    const r = run('SELECT * FROM products');
    expect(r.columns).toEqual(['id', 'name', 'category', 'price']);
    expect(plain(r)).toEqual(products);
  });

  it('reads REAL columns as REAL values', () => {
    expect(run('SELECT price FROM products WHERE id = 2').rows[0]![0]).toEqual(new Real(42));
  });

  it('names output columns by alias or expression text', () => {
    const r = run('SELECT name, price * 2 AS double, id + 1 FROM products');
    expect(r.columns).toEqual(['name', 'double', 'id + 1']);
    expect(plain(r)[0]).toEqual([products[0]![1], (products[0]![3] as number) * 2, 2]);
  });

  it('expands a qualified star to one table', () => {
    const r = run('SELECT c.*, o.id FROM customers c JOIN orders o ON o.customer_id = c.id');
    expect(r.columns).toEqual(['id', 'name', 'city', 'joined', 'id']);
  });
});

describe('runQuery: WHERE', () => {
  it('drops rows whose condition is unknown', () => {
    const names = plain(run("SELECT name FROM customers WHERE city <> 'X'")).map((r) => r[0]);
    expect(names).toEqual(customers.filter((c) => c[2] !== null).map((c) => c[1]));
  });

  it('supports BETWEEN, LIKE, IN and NOT', () => {
    expect(plain(run('SELECT id FROM products WHERE price BETWEEN 10 AND 30'))).toEqual(
      products.filter((p) => (p[3] as number) >= 10 && (p[3] as number) <= 30).map((p) => [p[0]]),
    );
    expect(plain(run("SELECT name FROM customers WHERE name LIKE 'a%'"))).toEqual([['Ana'], ['An']]);
    expect(plain(run('SELECT id FROM orders WHERE customer_id IN (1, 2)')).length).toBe(
      orders.filter((o) => o[1] === 1 || o[1] === 2).length,
    );
    expect(plain(run('SELECT id FROM orders WHERE NOT customer_id = 1')).length).toBe(
      orders.filter((o) => o[1] !== 1).length,
    );
  });

  it('applies SQLite column affinity in comparisons', () => {
    expect(run("SELECT name FROM students WHERE year = '2'", school)).toEqual(
      run('SELECT name FROM students WHERE year = 2', school),
    );
    expect(run("SELECT id FROM products WHERE price > '20'")).toEqual(run('SELECT id FROM products WHERE price > 20'));
    expect(run('SELECT name FROM customers WHERE name = 5').rows).toEqual([]);
    expect(run("SELECT id FROM products WHERE price IN ('42', 12)").rows.length).toBe(3);
  });
});

describe('runQuery: JOIN', () => {
  it('pairs rows that satisfy ON', () => {
    const r = run('SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id');
    expect(plain(r)).toEqual(orders.map((o) => [o[0], customers.find((c) => c[0] === o[1])![1]]));
  });

  it('keeps unmatched rows with NULLs in a LEFT JOIN', () => {
    const r = plain(run('SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id'));
    expect(r).toContainEqual(['Lan', null]);
    expect(r).toContainEqual(['Quang', null]);
    expect(r.filter((row) => row[0] === 'Ana')).toHaveLength(3);
  });

  it('joins three tables', () => {
    const r = run(
      'SELECT c.name, p.name FROM order_items oi JOIN orders o ON oi.order_id = o.id ' +
        'JOIN customers c ON o.customer_id = c.id JOIN products p ON oi.product_id = p.id WHERE o.id = 1',
    );
    expect(plain(r)).toEqual([
      ['Ana', 'SQL Basics'],
      ['Ana', 'USB Cable'],
      ['Ana', 'Teapot'],
    ]);
  });
});

describe('runQuery: DISTINCT, ORDER BY and LIMIT', () => {
  it('treats NULLs as equal for DISTINCT', () => {
    const cities = plain(run('SELECT DISTINCT city FROM customers'));
    expect(cities.filter((r) => r[0] === null)).toHaveLength(1);
    expect(cities).toHaveLength(new Set(customers.map((c) => c[2])).size);
  });

  it('sorts by several keys with DESC', () => {
    const r = plain(run('SELECT name, price FROM products ORDER BY price DESC, name'));
    const expected = [...products]
      .sort((a, b) => (b[3] as number) - (a[3] as number) || String(a[1]).localeCompare(String(b[1])))
      .map((p) => [p[1], p[3]]);
    expect(r).toEqual(expected);
  });

  it('sorts by position, alias and unselected columns', () => {
    expect(run('SELECT name, price FROM products ORDER BY 2')).toEqual(run('SELECT name, price FROM products ORDER BY price'));
    expect(run('SELECT name, price AS p FROM products ORDER BY p DESC')).toEqual(
      run('SELECT name, price AS p FROM products ORDER BY price DESC'),
    );
    expect(plain(run('SELECT name FROM products ORDER BY price LIMIT 1'))).toEqual([['USB Cable']]);
  });

  it('puts NULLs first ascending and last descending', () => {
    expect(plain(run('SELECT city FROM customers ORDER BY city'))[0]).toEqual([null]);
    expect(plain(run('SELECT city FROM customers ORDER BY city DESC')).at(-1)).toEqual([null]);
  });

  it('applies LIMIT and OFFSET', () => {
    expect(plain(run('SELECT id FROM orders ORDER BY id LIMIT 3 OFFSET 2'))).toEqual([[3], [4], [5]]);
    expect(run('SELECT id FROM orders LIMIT 0').rows).toEqual([]);
    expect(run('SELECT id FROM orders LIMIT 5 OFFSET 99').rows).toEqual([]);
  });

  it('rejects an ORDER BY position out of range', () => {
    expect(fail('SELECT id, name, city FROM customers ORDER BY 4').message).toBe(
      'ORDER BY position 4 is out of range: the query returns 3 columns.',
    );
  });
});

describe('runQuery: name errors', () => {
  it('reports ambiguous columns', () => {
    expect(fail('SELECT id FROM orders JOIN customers ON orders.customer_id = customers.id').message).toBe(
      'Column `id` is ambiguous: it exists in `orders` and `customers`. Write `orders.id` or `customers.id`.',
    );
  });

  it('suggests a close column name at its position', () => {
    const e = fail('SELECT id,\n  customer_idd FROM orders');
    expect(e.message).toBe('No column `customer_idd`. Did you mean `customer_id`?');
    expect(e).toMatchObject({ kind: 'name', line: 2, column: 3 });
  });

  it('suggests a close table name', () => {
    expect(fail('SELECT * FROM custmers').message).toBe('No table `custmers`. Did you mean `customers`?');
  });

  it('requires the alias once a table has one', () => {
    expect(fail('SELECT customers.name FROM customers c').message).toBe('No column `customers.name`.');
  });

  it('reports unknown columns even when there are no rows', () => {
    expect(fail('SELECT nope FROM customers WHERE 0').message).toContain('No column `nope`.');
  });

  it('never throws', () => {
    expect(runQuery(shop, 'SELECT').ok).toBe(false);
  });
});

describe('executeSelect trace', () => {
  it('reports each stage in logical order', () => {
    const parsed = parseQuery("SELECT name FROM customers WHERE city = 'Hanoi' ORDER BY name LIMIT 2");
    if (!parsed.ok) throw new Error(parsed.error.message);
    const events: TraceEvent[] = [];
    executeSelect(shop, parsed.statement, (e) => events.push(e));
    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual(['scan', ...customers.map(() => 'filter-test'), 'filtered', 'projected', 'sorted', 'limited']);
    for (const e of events) if (e.kind === 'filter-test') expect(e.row.startsWith('customers#')).toBe(true);
    const first = events[1]!;
    expect(first).toMatchObject({ kind: 'filter-test', outcome: true, values: { city: 'Hanoi' } });
  });

  it('reports join tests and unmatched rows', () => {
    const parsed = parseQuery('SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id');
    if (!parsed.ok) throw new Error(parsed.error.message);
    const events: TraceEvent[] = [];
    executeSelect(shop, parsed.statement, (e) => events.push(e));
    expect(events.filter((e) => e.kind === 'scan')).toHaveLength(2);
    expect(events.filter((e) => e.kind === 'join-test')).toHaveLength(customers.length * orders.length);
    expect(events.filter((e) => e.kind === 'join-unmatched').map((e) => e.kind === 'join-unmatched' && e.leftRow)).toEqual([
      'customers#7',
      'customers#9',
    ]);
  });
});

describe('runQuery over a changed copy of a dataset', () => {
  it('uses the stored row ids', () => {
    const db = cloneDataset(datasets.shop);
    findTable(db, 'customers')!.rowIds![0] = 'customers+99';
    const events: TraceEvent[] = [];
    const parsed = parseQuery('SELECT name FROM customers');
    if (!parsed.ok) throw new Error('parse');
    executeSelect(db, parsed.statement, (e) => events.push(e));
    const scan = events.find((e) => e.kind === 'scan');
    expect(scan?.kind === 'scan' && scan.relation.rows[0]!.id).toBe('customers+99');
  });

  it('treats a non-integer number in an INTEGER column as REAL', () => {
    const db = cloneDataset(datasets.shop);
    findTable(db, 'customers')!.rows[0]![0] = 2.5;
    const result = runQuery(db, 'SELECT id / 2 FROM customers WHERE name = \'Ana\'');
    expect(result.ok && result.result.rows[0]![0]).toEqual(new Real(1.25));
  });
});
