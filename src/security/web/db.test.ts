import { describe, expect, it } from 'vitest';
import { ORDERS } from './data';
import { createDb, quote, sql } from './db';

const USERS = [{ name: 'alice', role: 'customer', hash: 'h', salt: 's' }];

describe('quote', () => {
  it('doubles a quote mark', () => {
    expect(quote("o'brien")).toBe("'o''brien'");
  });
});

describe('sql', () => {
  it('quotes strings and leaves numbers alone', () => {
    expect(sql`SELECT * FROM users WHERE name = ${"o'brien"} AND id = ${3}`).toBe("SELECT * FROM users WHERE name = 'o''brien' AND id = 3");
  });
});

describe('createDb', () => {
  it('has its tables, with the orders loaded', () => {
    const db = createDb(USERS);
    expect(db.rows('users').map((r) => r.name)).toEqual(['alice']);
    expect(db.rows('sessions')).toEqual([]);
    expect(db.rows('orders')).toHaveLength(ORDERS.length);
    expect(db.rows('orders')[0]).toEqual({ id: 101, owner: 'alice', item: 'Lamp', total: 40 });
    expect(db.rows('comments')).toEqual([]);
  });

  it('reads back a name with a quote mark unchanged', () => {
    const db = createDb(USERS);
    expect(db.run(sql`INSERT INTO users (name, role, hash, salt) VALUES (${"o'brien"}, 'customer', 'h', 's')`)).toBe(true);
    expect(db.query(sql`SELECT name FROM users WHERE name = ${"o'brien"}`)).toEqual([{ name: "o'brien" }]);
  });

  it('keeps a write across statements', () => {
    const db = createDb(USERS);
    db.run(sql`INSERT INTO sessions (id, name, level) VALUES (${'s1'}, ${'alice'}, ${'full'})`);
    db.run(sql`UPDATE sessions SET level = ${'password'} WHERE id = ${'s1'}`);
    expect(db.rows('sessions')).toEqual([{ id: 's1', name: 'alice', level: 'password' }]);
  });

  it('reports a statement that fails and changes nothing', () => {
    const db = createDb(USERS);
    expect(db.run('INSERT INTO nowhere VALUES (1)')).toBe(false);
    expect(db.query('SELECT * FROM nowhere')).toEqual([]);
  });
});

describe('execute', () => {
  const db = () => createDb(USERS);

  it('returns rows', () => {
    expect(db().execute('SELECT name FROM users')).toEqual({ ok: true, rows: [{ name: 'alice' }] });
  });

  it('runs every statement and keeps their writes', () => {
    const shop = db();
    expect(shop.execute("SELECT name FROM users; DROP TABLE orders").rows).toEqual([{ name: 'alice' }]);
    expect(shop.rows('orders')).toEqual([]);
    expect(shop.execute('SELECT * FROM orders').ok).toBe(false);
  });

  it('keeps the writes made before a failure', () => {
    const shop = db();
    const result = shop.execute('DROP TABLE orders; SELECT nope FROM users');
    expect(result.ok).toBe(false);
    expect(shop.execute('SELECT * FROM orders').ok).toBe(false);
  });

  it('gives the message for bad text', () => {
    const result = db().execute("SELECT '");
    expect(result).toMatchObject({ ok: false, rows: [] });
    expect(result.error).toBeTruthy();
  });
});
