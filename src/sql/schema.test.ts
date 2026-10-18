import { describe, expect, it } from 'vitest';
import { cloneDataset, datasets, findTable } from './datasets';
import { columnNotes, createTableSql, isRowidAlias } from './schema';

const shopTable = (name: string) => findTable(datasets.shop, name)!;

describe('columnNotes', () => {
  it('lists each column’s constraints as short badges', () => {
    expect(columnNotes(shopTable('order_items'))).toEqual(['PK → orders.id', 'PK → products.id', 'CHECK']);
    expect(columnNotes(shopTable('customers'))).toEqual(['PK', 'NOT NULL', '', '']);
    expect(columnNotes(findTable(datasets.school, 'students')!)).toEqual(['PK', 'NOT NULL', '', 'UNIQUE']);
  });

  it('shows defaults', () => {
    expect(columnNotes({ name: 't', columns: [{ name: 'n', type: 'INTEGER', default: 0, notNull: true }] })).toEqual(['NOT NULL DEFAULT 0']);
    expect(columnNotes({ name: 't', columns: [{ name: 's', type: 'TEXT', default: 'new' }] })).toEqual(["DEFAULT 'new'"]);
  });
});

describe('createTableSql', () => {
  it('writes column constraints inline', () => {
    expect(createTableSql(shopTable('customers'))).toBe('CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT, joined TEXT)');
  });

  it('writes composite keys at the end', () => {
    expect(createTableSql(shopTable('order_items'))).toBe(
      'CREATE TABLE order_items (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES products(id), quantity INTEGER CHECK (quantity > 0), PRIMARY KEY (order_id, product_id))',
    );
  });

  it('writes table-level unique, check and foreign keys', () => {
    expect(
      createTableSql({
        name: 'm',
        columns: [
          { name: 'a', type: 'INTEGER' },
          { name: 'b', type: 'TEXT', default: 'x' },
        ],
        unique: [['a', 'b']],
        checks: ['a > 0'],
        foreignKeys: [{ columns: ['a'], table: 'p', refColumns: ['id'] }],
      }),
    ).toBe("CREATE TABLE m (a INTEGER, b TEXT DEFAULT 'x', UNIQUE (a, b), CHECK (a > 0), FOREIGN KEY (a) REFERENCES p(id))");
  });
});

describe('isRowidAlias', () => {
  it('finds the single INTEGER PRIMARY KEY column', () => {
    expect(isRowidAlias(shopTable('customers'))).toBe('id');
    expect(isRowidAlias(shopTable('order_items'))).toBeUndefined();
    expect(isRowidAlias({ name: 't', columns: [{ name: 'code', type: 'TEXT', primaryKey: true }] })).toBeUndefined();
  });
});

describe('cloneDataset', () => {
  it('copies deeply and gives every row a stable id', () => {
    const copy = cloneDataset(datasets.shop);
    const customers = findTable(copy, 'customers')!;
    expect(customers.rowIds?.slice(0, 2)).toEqual(['customers#0', 'customers#1']);
    customers.rows[0]![1] = 'Changed';
    customers.rows.pop();
    expect(shopTable('customers').rows[0]![1]).toBe('Ana');
    expect(shopTable('customers').rows).toHaveLength(10);
  });
});
