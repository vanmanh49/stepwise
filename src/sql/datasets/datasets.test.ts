import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqlite } from '../sqlite.testutil';
import { datasets, findTable, type Dataset, type DatasetTable } from './index';

const FOREIGN_KEYS: Record<string, Record<string, [table: string, column: string]>> = {
  orders: { customer_id: ['customers', 'id'] },
  order_items: { order_id: ['orders', 'id'], product_id: ['products', 'id'] },
  enrollments: { student_id: ['students', 'id'], course_id: ['courses', 'id'] },
  employees: { manager_id: ['employees', 'id'], department_id: ['departments', 'id'] },
  transfers: { from_id: ['accounts', 'id'], to_id: ['accounts', 'id'] },
};

function table(db: Dataset, name: string): DatasetTable {
  const t = findTable(db, name);
  if (!t) throw new Error(`missing table ${name}`);
  return t;
}

/** Values of one column, by name. */
function col(t: DatasetTable, name: string): (number | string | null)[] {
  const index = t.columns.findIndex((c) => c.name === name);
  if (index < 0) throw new Error(`missing column ${t.name}.${name}`);
  return t.rows.map((row) => row[index]!);
}

const unique = <T,>(values: T[]) => new Set(values).size === values.length;

describe.each(Object.values(datasets).map((db) => [db.id, db] as const))('dataset %s', (_id, db) => {
  it.each(db.tables.map((t) => [t.name, t] as const))('table %s is well formed', (_name, t) => {
    expect(t.rows.length).toBeGreaterThanOrEqual(1);
    expect(t.rows.length).toBeLessThanOrEqual(20);
    const keys = FOREIGN_KEYS[t.name] ?? {};
    for (const row of t.rows) {
      expect(row).toHaveLength(t.columns.length);
      t.columns.forEach((c, i) => {
        const cell = row[i];
        if (cell === null) {
          // A foreign key may be NULL (no parent), unless the column is declared NOT NULL.
          expect(c.name === 'id' || (c.name in keys && c.notNull === true), `${t.name}.${c.name} must not be NULL`).toBe(false);
          return;
        }
        if (c.type === 'INTEGER') expect(Number.isInteger(cell), `${t.name}.${c.name}`).toBe(true);
        if (c.type === 'REAL') expect(typeof cell).toBe('number');
        if (c.type === 'TEXT') expect(typeof cell).toBe('string');
      });
    }
    if (t.columns.some((c) => c.name === 'id')) expect(unique(col(t, 'id'))).toBe(true);
    for (const [column, [target, targetColumn]] of Object.entries(keys)) {
      const ids = new Set(col(table(db, target), targetColumn));
      for (const value of col(t, column)) if (value !== null) expect(ids.has(value), `${t.name}.${column}=${value}`).toBe(true);
    }
  });
});

describe('shop dataset', () => {
  const shop = datasets.shop;
  const customers = table(shop, 'customers');
  const products = table(shop, 'products');
  const orders = table(shop, 'orders');
  const items = table(shop, 'order_items');

  it('has customers covering the lesson cases', () => {
    expect(customers.rows.length).toBeGreaterThanOrEqual(8);
    expect(customers.rows.length).toBeLessThanOrEqual(12);
    const cities = col(customers, 'city');
    expect(cities).toContain(null);
    expect(cities).toContain('Hanoi');
    expect(cities).toContain('Hue');
    const named = cities.filter((c) => c !== null);
    expect(unique(named)).toBe(false);
    expect(col(customers, 'name').some((n) => String(n).startsWith('A'))).toBe(true);
    const orderCounts = col(customers, 'id').map((id) => col(orders, 'customer_id').filter((c) => c === id).length);
    expect(orderCounts).toContain(0);
    expect(orderCounts.some((n) => n > 1)).toBe(true);
  });

  it('has products covering the lesson cases', () => {
    expect(products.rows.length).toBeGreaterThanOrEqual(8);
    expect(products.rows.length).toBeLessThanOrEqual(12);
    const categories = col(products, 'category');
    expect(new Set(categories)).toEqual(new Set(['Books', 'Electronics', 'Kitchen']));
    const prices = col(products, 'price') as number[];
    const averages = [...new Set(categories)].map((cat) => {
      const ps = prices.filter((_, i) => categories[i] === cat);
      return ps.reduce((a, b) => a + b, 0) / ps.length;
    });
    expect(averages.some((a) => a > 30)).toBe(true);
    expect(averages.some((a) => a <= 30)).toBe(true);
    expect(unique(prices)).toBe(false);
    const sorted = prices.toSorted((a, b) => a - b);
    expect(sorted[0]).toBeLessThan(sorted[1]!);
    expect(sorted[1]).toBeLessThan(sorted[2]!);
    expect(sorted[2]).toBeLessThan(sorted[3]!);
    expect(prices.some((p) => Number.isInteger(p))).toBe(true);
    const ordered = new Set(col(items, 'product_id'));
    expect(col(products, 'id').some((id) => !ordered.has(id))).toBe(true);
  });

  it('has orders covering the lesson cases', () => {
    expect(orders.rows.length).toBeGreaterThanOrEqual(10);
    expect(orders.rows.length).toBeLessThanOrEqual(15);
    expect(new Set(col(orders, 'status'))).toEqual(new Set(['shipped', 'pending', 'cancelled']));
    const dates = col(orders, 'ordered_on');
    expect(unique(dates)).toBe(true);
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('has order items covering the lesson cases', () => {
    const pairs = items.rows.map((r) => `${r[0]}/${r[1]}`);
    expect(unique(pairs)).toBe(true);
    for (const q of col(items, 'quantity')) {
      expect(q).toBeGreaterThanOrEqual(1);
      expect(q).toBeLessThanOrEqual(5);
    }
    expect(col(items, 'order_id').filter((id) => id === 1).length).toBeGreaterThanOrEqual(2);
  });
});

describe('school dataset', () => {
  const school = datasets.school;
  const students = table(school, 'students');
  const courses = table(school, 'courses');
  const enrollments = table(school, 'enrollments');

  it('has students covering the lesson cases', () => {
    expect(students.rows.length).toBeGreaterThanOrEqual(8);
    expect(students.rows.length).toBeLessThanOrEqual(12);
    for (const y of col(students, 'year')) {
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(4);
    }
    expect(col(students, 'email')).toContain(null);
    const enrolled = new Set(col(enrollments, 'student_id'));
    expect(col(students, 'id').some((id) => !enrolled.has(id))).toBe(true);
  });

  it('has courses covering the lesson cases', () => {
    expect(courses.rows.length).toBeGreaterThanOrEqual(5);
    expect(courses.rows.length).toBeLessThanOrEqual(8);
    const credits = col(courses, 'credits');
    for (const c of credits) {
      expect(c).toBeGreaterThanOrEqual(2);
      expect(c).toBeLessThanOrEqual(5);
    }
    expect(new Set(credits).size).toBeGreaterThan(1);
    const taken = new Set(col(enrollments, 'course_id'));
    expect(col(courses, 'id').some((id) => !taken.has(id))).toBe(true);
  });

  it('has enrollments covering the lesson cases', () => {
    expect(unique(enrollments.rows.map((r) => `${r[0]}/${r[1]}`))).toBe(true);
    const grades = col(enrollments, 'grade');
    expect(grades).toContain(null);
    for (const g of grades) {
      if (g === null) continue;
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(100);
    }
  });
});

describe('findTable', () => {
  it('ignores case', () => {
    expect(findTable(datasets.shop, 'CUSTOMERS')?.name).toBe('customers');
    expect(findTable(datasets.shop, 'nope')).toBeUndefined();
  });
});

describe('SQLite loader', () => {
  let sqlite: Awaited<ReturnType<typeof openSqlite>>;
  beforeAll(async () => {
    sqlite = await openSqlite(datasets.shop);
  });
  afterAll(() => sqlite.close());

  it('loads every row', () => {
    expect(sqlite.query('SELECT COUNT(*) FROM customers').rows).toEqual([[table(datasets.shop, 'customers').rows.length]]);
  });

  it('reports columns for an empty result', () => {
    expect(sqlite.query('SELECT price FROM products WHERE 0')).toEqual({ columns: ['price'], rows: [] });
  });
});

describe('declared constraints', () => {
  it('match the spec', () => {
    const shop = (n: string) => findTable(datasets.shop, n)!;
    const school = (n: string) => findTable(datasets.school, n)!;
    const pk = (t: DatasetTable) => t.columns.filter((c) => c.primaryKey).map((c) => c.name);
    const notNull = (t: DatasetTable) => t.columns.filter((c) => c.notNull).map((c) => c.name);
    expect(pk(shop('customers'))).toEqual(['id']);
    expect(pk(shop('products'))).toEqual(['id']);
    expect(pk(shop('orders'))).toEqual(['id']);
    expect(notNull(shop('customers'))).toEqual(['name']);
    expect(notNull(shop('products'))).toEqual(['name', 'price']);
    expect(shop('orders').columns.find((c) => c.name === 'customer_id')?.references).toEqual({ table: 'customers', column: 'id' });
    expect(shop('order_items').primaryKey).toEqual(['order_id', 'product_id']);
    expect(shop('order_items').columns.find((c) => c.name === 'quantity')?.check).toBe('quantity > 0');
    expect(pk(school('students'))).toEqual(['id']);
    expect(pk(school('courses'))).toEqual(['id']);
    expect(notNull(school('students'))).toEqual(['name']);
    expect(notNull(school('courses'))).toEqual(['title']);
    expect(school('students').columns.find((c) => c.name === 'email')?.unique).toBe(true);
    expect(school('enrollments').primaryKey).toEqual(['student_id', 'course_id']);
    expect(school('enrollments').columns.find((c) => c.name === 'course_id')?.references).toEqual({ table: 'courses', column: 'id' });
  });

  it.each(Object.values(datasets).map((db) => [db.id, db] as const))('hold for every row of %s in SQLite', async (_id, db) => {
    const sqlite = await openSqlite(db);
    expect(sqlite.query('PRAGMA foreign_key_check').rows).toEqual([]);
    expect(sqlite.query('PRAGMA foreign_keys').rows).toEqual([[1]]);
    sqlite.close();
  });
});

describe('company dataset', () => {
  const company = datasets.company;
  const emp = (name: string) => {
    const t = findTable(company, 'employees')!;
    return t.rows.find((r) => r[1] === name)!;
  };

  it('has departments and employees as the spec lists them', () => {
    expect(findTable(company, 'departments')!.rows).toEqual([[1, 'Management'], [2, 'Engineering'], [3, 'Sales'], [4, 'Support']]);
    expect(findTable(company, 'employees')!.rows).toHaveLength(12);
    expect(emp('Lan')).toEqual([1, 'Lan', null, 1, 9000, '2015-02-01']);
    expect(emp('Bao')).toEqual([11, 'Bao', 6, 2, 3600, '2023-03-01']);
  });

  it('has the properties the lessons rely on', () => {
    const employees = findTable(company, 'employees')!;
    const byId = new Map(employees.rows.map((r) => [r[0], r]));
    const chain: unknown[] = [];
    for (let r = emp('Bao'); r; r = byId.get(r[2]!)!) chain.unshift(r[1]);
    expect(chain).toEqual(['Lan', 'Minh', 'Tuan', 'Khoa', 'Bao']);
    expect([emp('Tuan')[4], emp('Vy')[4], emp('Tuan')[3], emp('Vy')[3]]).toEqual([5200, 5200, 2, 2]);
    expect(emp('Khoa')[4]! > emp('Tuan')[4]!).toBe(true);
    expect(emp('Linh')[5]! < emp('Hoa')[5]!).toBe(true);
    expect(emp('Thu')[3]).toBeNull();
    expect(employees.rows.some((r) => r[3] === 4)).toBe(false);
  });
});

describe('bank dataset', () => {
  it('has accounts and transfers as the spec lists them', () => {
    expect(findTable(datasets.bank, 'accounts')!.rows).toEqual([[1, 'An', 500], [2, 'Binh', 300], [3, 'Chi', 0], [4, 'Dung', 1200]]);
    expect(findTable(datasets.bank, 'transfers')!.rows).toEqual([[1, 1, 2, 100], [2, 4, 3, 250]]);
    expect(findTable(datasets.bank, 'accounts')!.columns.find((c) => c.name === 'balance')!.check).toBe('balance >= 0');
  });
});

describe('signups dataset', () => {
  const t = () => findTable(datasets.signups, 'course_signups')!;
  it('is one unnormalized table with the repeats the lesson needs', () => {
    expect(t().rows).toHaveLength(10);
    expect(new Set(col(t(), 'student')).size).toBe(4);
    expect(new Set(col(t(), 'course')).size).toBe(3);
    expect(new Set(col(t(), 'teacher')).size).toBe(2);
    const haRooms = t().rows.filter((r) => r[4] === 'Ha').map((r) => r[5]);
    expect(haRooms.filter((r) => r === 'B12')).toHaveLength(3);
    expect(haRooms.filter((r) => r === 'B21')).toHaveLength(1);
    expect(t().primaryKey).toBeUndefined();
  });
});

describe('new datasets in SQLite', () => {
  it.each(['bank', 'signups'] as const)('%s loads with its constraints satisfied', async (id) => {
    const sqlite = await openSqlite(datasets[id]);
    expect(sqlite.query('PRAGMA foreign_key_check').rows).toEqual([]);
    sqlite.close();
  });
});
