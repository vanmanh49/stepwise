import { describe, expect, it } from 'vitest';
import { datasets, findTable, type Dataset } from './datasets';
import { runScript, type ScriptResult } from './script';

const shop = datasets.shop;
const school = datasets.school;

function ok(sql: string, db: Dataset = shop): Extract<ScriptResult, { ok: true }> {
  const result = runScript(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} (line ${result.error.line})`);
  return result;
}

function failed(sql: string, db: Dataset = shop): Extract<ScriptResult, { ok: false }> {
  const result = runScript(db, sql);
  if (result.ok) throw new Error(`expected a failure: ${sql}`);
  return result;
}

const rows = (result: ScriptResult, table: string) => findTable(result.db, table)?.rows;
const last = (result: ScriptResult, table: string) => rows(result, table)!.at(-1);
const selected = (result: Extract<ScriptResult, { ok: true }>) => result.statements.at(-1)!.result!.rows;

describe('INSERT', () => {
  it('adds a row with a column list and leaves the rest NULL', () => {
    const result = ok("INSERT INTO customers (id, name) VALUES (11, 'Tam')");
    expect(last(result, 'customers')).toEqual([11, 'Tam', null, null]);
    expect(result.statements[0]).toMatchObject({ kind: 'insert', affected: 1, line: 1 });
  });

  it('fills every column when no list is given, and adds several rows at once', () => {
    const result = ok("INSERT INTO customers VALUES (11, 'Tam', 'Hue', '2024-03-01'), (12, 'Vy', NULL, '2024-03-02')");
    expect(rows(result, 'customers')!.slice(-2)).toEqual([
      [11, 'Tam', 'Hue', '2024-03-01'],
      [12, 'Vy', null, '2024-03-02'],
    ]);
    expect(result.statements[0]!.affected).toBe(2);
  });

  it('gives an INTEGER PRIMARY KEY the next id when it is left out or NULL', () => {
    const result = ok("INSERT INTO customers (name) VALUES ('Tam');\nINSERT INTO customers (id, name) VALUES (NULL, 'Vy')");
    expect(rows(result, 'customers')!.slice(-2).map((r) => r[0])).toEqual([11, 12]);
  });

  it('starts automatic ids at 1 and uses defaults in a new table', () => {
    const result = ok("CREATE TABLE clubs (id INTEGER PRIMARY KEY, name TEXT, size INTEGER DEFAULT 5);\nINSERT INTO clubs (name) VALUES ('Chess')", school);
    expect(rows(result, 'clubs')).toEqual([[1, 'Chess', 5]]);
  });

  it('converts values to the column types', () => {
    const result = ok("CREATE TABLE t (i INTEGER, r REAL, s TEXT);\nINSERT INTO t VALUES ('5', '2.5', 7), ('x', 3, 1.5)");
    expect(rows(result, 't')).toEqual([
      [5, 2.5, '7'],
      ['x', 3, '1.5'],
    ]);
  });

  it('inserts the result of a SELECT', () => {
    const result = ok(
      "CREATE TABLE books (id INTEGER PRIMARY KEY, name TEXT, price REAL);\nINSERT INTO books SELECT id, name, price FROM products WHERE category = 'Books'",
    );
    expect(rows(result, 'books')!.map((r) => r[1])).toEqual(['SQL Basics', 'Data Atlas', 'Poetry Pocket']);
  });

  it('reads the table as it was before the statement when inserting from itself', () => {
    const result = ok('CREATE TABLE n (v INTEGER);\nINSERT INTO n VALUES (1), (2);\nINSERT INTO n SELECT v + 10 FROM n');
    expect(rows(result, 'n')).toEqual([[1], [2], [11], [12]]);
  });

  it('rejects a wrong number of values', () => {
    expect(failed("INSERT INTO customers (id, name) VALUES (11)").error.message).toBe('INSERT gives 1 value for 2 columns.');
  });

  it('suggests a column name', () => {
    const { error } = failed("INSERT INTO customers (id, nme) VALUES (11, 'Tam')");
    expect(error.kind).toBe('name');
    expect(error.message).toContain('Did you mean `name`?');
  });
});

describe('UPDATE', () => {
  it('changes the rows WHERE matches', () => {
    const result = ok("UPDATE customers SET city = 'Hanoi' WHERE id = 4");
    expect(rows(result, 'customers')![3]).toEqual([4, 'Dung', 'Hanoi', '2023-04-10']);
    expect(result.statements[0]!.affected).toBe(1);
  });

  it('changes every row without WHERE', () => {
    const result = ok("UPDATE customers SET city = 'Hue'");
    expect(rows(result, 'customers')!.every((r) => r[2] === 'Hue')).toBe(true);
    expect(result.statements[0]!.affected).toBe(10);
  });

  it('reads every value from the row as it was before the update', () => {
    const result = ok('CREATE TABLE p (a INTEGER, b INTEGER);\nINSERT INTO p VALUES (1, 2);\nUPDATE p SET a = b, b = a');
    expect(rows(result, 'p')).toEqual([[2, 1]]);
  });

  it('sets a value from a subquery and keeps REAL prices REAL', () => {
    const result = ok("UPDATE products SET price = price * 1.1 WHERE category = 'Books';\nSELECT price FROM products WHERE id = 1");
    expect(selected(result)[0]![0]).toEqual(expect.objectContaining({ value: expect.closeTo(21.45, 10) }));
    const sub = ok('UPDATE products SET price = (SELECT MAX(price) FROM products) WHERE id = 3');
    expect(rows(sub, 'products')![2]![3]).toBe(59.9);
  });

  it('lets a subquery see rows changed earlier in the same UPDATE, as SQLite does', () => {
    const result = ok('UPDATE products SET price = (SELECT AVG(price) FROM products p2 WHERE p2.category = products.category)');
    const prices = rows(result, 'products')!.map((r) => r[3] as number);
    const sqlite = [23.416666666666668, 24.722222222222225, 18.962962962962965, 30.1, 36, 30.025, 27.03125, 29.75, 32.625];
    prices.forEach((p, i) => expect(p).toBeCloseTo(sqlite[i]!, 10));
  });

  it('fails on the first duplicate key, as SQLite checks row by row, and changes nothing', () => {
    const { error } = failed('UPDATE products SET id = id + 1');
    expect(error.kind).toBe('constraint');
    expect(error.constraint?.rule).toBe('PRIMARY KEY');
    expect(error.message).toBe('PRIMARY KEY failed: products.id already has 2 (row 2).');
    const after = failed('UPDATE products SET id = id + 1');
    expect(rows(after, 'products')).toEqual(findTable(shop, 'products')!.rows);
  });
});

describe('DELETE', () => {
  it('removes the rows WHERE matches', () => {
    const result = ok('DELETE FROM order_items WHERE order_id = 3');
    expect(rows(result, 'order_items')!.some((r) => r[0] === 3)).toBe(false);
    expect(result.statements[0]!.affected).toBe(findTable(shop, 'order_items')!.rows.filter((r) => r[0] === 3).length);
  });

  it('removes every row without WHERE', () => {
    expect(rows(ok('DELETE FROM order_items'), 'order_items')).toEqual([]);
  });

  it('accepts a subquery in WHERE', () => {
    const result = ok('DELETE FROM products WHERE id NOT IN (SELECT product_id FROM order_items)');
    const used = new Set(findTable(shop, 'order_items')!.rows.map((r) => r[1]));
    expect(rows(result, 'products')!.every((r) => used.has(r[0]))).toBe(true);
  });
});

describe('constraints', () => {
  it('rejects NULL in a NOT NULL column', () => {
    const { error } = failed("INSERT INTO customers (id, city) VALUES (11, 'Hue')");
    expect(error.constraint).toEqual({ rule: 'NOT NULL', table: 'customers', column: 'name' });
    expect(error.message).toBe("NOT NULL failed: customers.name can't be NULL (row 11).");
  });

  it('rejects duplicates in a UNIQUE column but lets NULLs repeat', () => {
    const { error } = failed("INSERT INTO students (name, email) VALUES ('X', 'mai@school.edu')", school);
    expect(error.message).toBe("UNIQUE failed: students.email already has 'mai@school.edu' (row 1).");
    expect(ok("INSERT INTO students (name, email) VALUES ('X', NULL), ('Y', NULL)", school).ok).toBe(true);
  });

  it('checks a composite primary key', () => {
    const { error } = failed('INSERT INTO order_items VALUES (1, 1, 5)');
    expect(error.constraint?.rule).toBe('PRIMARY KEY');
    expect(error.message).toBe('PRIMARY KEY failed: order_items.(order_id, product_id) already has (1, 1) (row 1).');
  });

  it('fails a CHECK only when it is false', () => {
    const { error } = failed('INSERT INTO order_items VALUES (1, 9, 0)');
    expect(error.message).toBe('CHECK failed: quantity > 0 is false for this row.');
    expect(ok('INSERT INTO order_items VALUES (1, 9, NULL)').ok).toBe(true);
  });

  it('requires a matching parent for a foreign key', () => {
    const { error } = failed("INSERT INTO orders VALUES (99, 99, '2024-05-01', 'pending')");
    expect(error.constraint).toEqual({ rule: 'FOREIGN KEY', table: 'orders', column: 'customer_id' });
    expect(error.message).toBe('FOREIGN KEY failed: orders.customer_id 99 has no matching customers.id.');
    expect(failed('UPDATE orders SET customer_id = 42 WHERE id = 1').error.constraint?.rule).toBe('FOREIGN KEY');
  });

  it('stops a parent row being deleted while children refer to it', () => {
    const { error } = failed('DELETE FROM customers WHERE id = 1');
    expect(error.message).toBe('FOREIGN KEY failed: customers row 1 still has rows in orders that refer to it.');
  });

  it('rejects a DELETE without WHERE as a whole when some rows are still referenced', () => {
    const result = failed('DELETE FROM customers');
    expect(result.error.constraint?.rule).toBe('FOREIGN KEY');
    expect(rows(result, 'customers')).toEqual(findTable(shop, 'customers')!.rows);
  });

  it('allows deleting the children first, then the parent', () => {
    const result = ok(
      'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_id = 1);\nDELETE FROM orders WHERE customer_id = 1;\nDELETE FROM customers WHERE id = 1',
    );
    expect(rows(result, 'customers')!.some((r) => r[0] === 1)).toBe(false);
  });
});

describe('scripts', () => {
  it('stops at the first failing statement and keeps earlier changes', () => {
    const result = failed("INSERT INTO customers (name) VALUES ('Tam');\nUPDATE customers SET city = 'Hue' WHERE id = 11;\nINSERT INTO customers (id) VALUES (12)");
    expect(result.failedIndex).toBe(2);
    expect(result.error.line).toBe(3);
    expect(last(result, 'customers')).toEqual([11, 'Tam', 'Hue', null]);
    expect(result.statements).toHaveLength(2);
  });

  it('reports a parse error without running anything', () => {
    const result = failed("INSERT INTO customers (name) VALUES ('Tam');\nUPDATE customers SET city 'Hue'");
    expect(result.failedIndex).toBe(-1);
    expect(rows(result, 'customers')).toHaveLength(10);
  });

  it('refuses to create a table that exists', () => {
    expect(failed('CREATE TABLE customers (id INTEGER)').error.message).toBe('Table `customers` already exists.');
  });

  it('drops tables, honouring foreign keys', () => {
    expect(failed('DROP TABLE customers').error.constraint?.rule).toBe('FOREIGN KEY');
    const dropped = failed('DROP TABLE order_items;\nSELECT * FROM order_items');
    expect(dropped.failedIndex).toBe(1);
    expect(dropped.error.message).toContain('No table `order_items`');
    expect(ok('DROP TABLE IF EXISTS nope').ok).toBe(true);
    expect(failed('DROP TABLE nope').error.kind).toBe('name');
  });

  it('limits a table to 50 rows', () => {
    const values = Array.from({ length: 41 }, (_, i) => `(${100 + i}, 'C${i}')`).join(', ');
    const { error } = failed(`INSERT INTO customers (id, name) VALUES ${values}`);
    expect(error.kind).toBe('limit');
    expect(error.message).toBe('This table would hold more than 50 rows.');
  });

  it('can create a new table in each of its 10 statements', () => {
    const creates = Array.from({ length: 10 }, (_, i) => `CREATE TABLE t${i} (a INTEGER)`).join(';\n');
    expect(ok(creates).db.tables).toHaveLength(14);
  });

  it('starts from a fresh copy every time', () => {
    const sql = "INSERT INTO customers (name) VALUES ('Tam')";
    expect(last(ok(sql), 'customers')).toEqual(last(ok(sql), 'customers'));
    expect(findTable(shop, 'customers')!.rows).toHaveLength(10);
  });

  it('keeps row ids stable and gives new rows their own', () => {
    const result = ok("INSERT INTO customers (name) VALUES ('Tam');\nDELETE FROM customers WHERE id = 8");
    const ids = findTable(result.db, 'customers')!.rowIds!;
    expect(ids[7]).toBe('customers#8');
    expect(ids.at(-1)).toBe('customers+1');
  });
});
