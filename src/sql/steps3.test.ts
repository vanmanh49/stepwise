import { describe, expect, it } from 'vitest';
import type { Step, TableView } from '../types/visualization';
import { datasets } from './datasets';
import { runQuery } from './execute';
import { querySteps } from './steps';
import { toPlain } from './values';

export function steps(sql: string, db = datasets.shop): Step[] {
  const result = querySteps(db, sql);
  if (!result.ok) throw new Error(result.error.message);
  return result.steps;
}

export const view = (step: Step) => step.view as TableView;

export function expectWellFormed(list: Step[], sql: string, db = datasets.shop) {
  const lines = sql.split('\n').length;
  expect(list.length).toBeLessThanOrEqual(400);
  for (const step of list) {
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
    expect(step.title).not.toBe('');
  }
  const expected = runQuery(db, sql);
  if (!expected.ok) throw new Error(expected.error.message);
  const result = view(list.at(-1)!).tables.at(-1)!;
  expect(result.rows.map((r) => r.cells)).toEqual(expected.result.rows.map((r) => r.map(toPlain)));
}

const TIERS = "SELECT name, price,\n  CASE WHEN price >= 40 THEN 'premium' WHEN price >= 15 THEN 'standard' ELSE 'budget' END AS tier\nFROM products;";

describe('CASE steps', () => {
  it('shows the branch each row takes', () => {
    const list = steps(TIERS);
    expectWellFormed(list, TIERS);
    const titles = list.map((s) => s.title);
    expect(titles).toContain("Row 2: price 42.0 → WHEN price >= 40 is true → 'premium'");
    expect(titles).toContain("Row 4: price 6.5 → ELSE → 'budget'");
    const step = list.find((s) => s.title.startsWith('Row 4: price'))!;
    expect(step.codeLine).toBe(1);
    expect(view(step).current).toBe('SELECT');
    const row = view(step).tables[0]!.rows.find((r) => r.role === 'active')!;
    expect(row.focus).toEqual([3]);
  });

  it('names the matching value in the simple form', () => {
    const titles = steps("SELECT CASE category WHEN 'Books' THEN 'read' ELSE 'other' END FROM products").map((s) => s.title);
    expect(titles).toContain("Row 1: category Books → WHEN 'Books' matches → 'read'");
  });
});

describe('self join labels', () => {
  it('labels each copy of a table by its alias', () => {
    const sql = 'SELECT e.name, m.name\nFROM employees e\nJOIN employees m ON m.id = e.manager_id;';
    const list = steps(sql, datasets.company);
    const join = list.find((s) => view(s).current === 'JOIN')!;
    expect(view(join).tables.map((t) => t.label)).toEqual(['e (employees)', 'm (employees)']);
    expect(join.title).toContain('e (employees) row');
  });
});

describe('set operation steps', () => {
  const shipped = "SELECT customer_id FROM orders WHERE status = 'shipped'";
  const pending = "SELECT customer_id FROM orders WHERE status = 'pending'";

  it('shows each side, then combines them', () => {
    const sql = `${shipped}\nUNION\n${pending}\nORDER BY 1;`;
    const list = steps(sql);
    expectWellFormed(list, sql);
    const titles = list.map((s) => s.title);
    expect(titles.some((t) => /^Left SELECT: \d+ rows$/.test(t))).toBe(true);
    expect(titles.some((t) => /^Right SELECT: \d+ rows$/.test(t))).toBe(true);
    const combine = list.find((s) => view(s).current === 'UNION')!;
    expect(combine.codeLine).toBe(2);
    expect(view(combine).clauses).toEqual(['SELECT', 'UNION', 'SELECT', 'ORDER BY']);
    const [left, right, result] = view(combine).tables;
    expect([left, right, result].every(Boolean)).toBe(true);
    const notes = [...left!.rows, ...right!.rows].map((r) => r.note);
    expect(notes).toContain('duplicate, dropped');
    expect(notes).toContain('kept');
  });

  it('marks rows in both for INTERSECT and removed rows for EXCEPT', () => {
    const intersect = steps(`${shipped}\nINTERSECT\n${pending}`).find((s) => view(s).current === 'INTERSECT')!;
    const left = view(intersect).tables[0]!.rows;
    expect(left.filter((r) => r.note === 'in both').every((r) => r.role === 'found')).toBe(true);
    expect(left.some((r) => r.note === 'only in left' && r.role === 'discarded')).toBe(true);
    const except = steps(`${shipped}\nEXCEPT\n${pending}`).find((s) => view(s).current === 'EXCEPT')!;
    expect(view(except).tables[0]!.rows.some((r) => r.note === 'also in right, removed' && r.role === 'discarded')).toBe(true);
  });

  it('combines three SELECTs in two steps', () => {
    const sql = 'SELECT id FROM customers WHERE id <= 3\nUNION\nSELECT id FROM customers WHERE id = 5\nEXCEPT\nSELECT id FROM customers WHERE id = 2';
    const list = steps(sql);
    expectWellFormed(list, sql);
    expect(list.filter((s) => ['UNION', 'EXCEPT'].includes(view(s).current ?? '')).length).toBe(2);
  });
});
