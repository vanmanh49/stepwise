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
  it('has the three tables, with the orders loaded', () => {
    const db = createDb(USERS);
    expect(db.rows('users').map((r) => r.name)).toEqual(['alice']);
    expect(db.rows('sessions')).toEqual([]);
    expect(db.rows('orders')).toHaveLength(ORDERS.length);
    expect(db.rows('orders')[0]).toEqual({ id: 101, owner: 'alice', item: 'Lamp', total: 40 });
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
