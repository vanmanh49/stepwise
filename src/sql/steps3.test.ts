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
