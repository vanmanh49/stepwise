import { describe, expect, it } from 'vitest';
import type { TableView } from '../types/visualization';
import { corpus } from './corpus.testutil';
import { datasets } from './datasets';
import { runQuery } from './execute';
import { MAX_STEPS, querySteps, viewAt } from './steps';
import { toPlain } from './values';

const shop = datasets.shop;

function stepsFor(sql: string, db = shop) {
  const result = querySteps(db, sql);
  if (!result.ok) throw new Error(result.error.message);
  return result.steps;
}

const tableView = (view: unknown) => view as TableView;

describe.each(corpus)('querySteps $db: $sql', ({ db, sql }) => {
  it('ends with the query result and stays consistent', () => {
    const dataset = datasets[db];
    const steps = stepsFor(sql, dataset);
    const run = runQuery(dataset, sql);
    if (!run.ok) throw new Error(run.error.message);
    const final = tableView(steps.at(-1)!.view);
    expect(final.tables.at(-1)!.rows.map((r) => r.cells)).toEqual(run.result.rows.map((row) => row.map(toPlain)));

    const lineCount = sql.split('\n').length;
    const used = new Set(Object.keys(run.statement.lines));
    const seen = new Map<string, string>();
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS);
    for (const step of steps) {
      expect(step.codeLine).toBeGreaterThanOrEqual(1);
      expect(step.codeLine).toBeLessThanOrEqual(lineCount);
      const view = tableView(step.view);
      expect(view.kind).toBe('table');
      for (const clause of view.clauses) expect(used.has(clause), clause).toBe(true);
      for (const table of view.tables) {
        for (const row of table.rows) {
          const key = `${table.columns.join(',')}|${row.id}`;
          const cells = JSON.stringify(row.cells);
          expect(seen.get(key) ?? cells, key).toBe(cells);
          seen.set(key, cells);
        }
      }
    }
  });
});

describe('querySteps', () => {
  it('starts with an overview of the clause order', () => {
    const [first] = stepsFor("SELECT name FROM customers WHERE city = 'Hue' ORDER BY name");
    expect(first!.title).toBe('Run the query');
    expect(first!.why).toBe('SQL runs the clauses in this order: FROM → WHERE → SELECT → ORDER BY.');
    expect(tableView(first!.view).current).toBeUndefined();
  });

  it('points each step at the line of its clause', () => {
    const steps = stepsFor("SELECT name\nFROM customers\nWHERE city = 'Hue'");
    const where = steps.filter((s) => tableView(s.view).current === 'WHERE');
    expect(where.length).toBeGreaterThan(0);
    for (const s of where) expect(s.codeLine).toBe(3);
    expect(steps.find((s) => s.title.startsWith('FROM customers'))!.codeLine).toBe(2);
  });

  it('explains rows removed because a comparison is unknown', () => {
    const steps = stepsFor("SELECT name FROM customers WHERE city = 'Hue'");
    const unknown = steps.find((s) => s.title.endsWith('→ unknown'))!;
    expect(unknown.title).toBe("Row 4: city = 'Hue' → unknown");
    expect(unknown.why).toBe('A comparison with NULL is unknown, and WHERE only keeps rows where the condition is true.');
    expect(unknown.variables).toEqual({ city: 'NULL' });
    const row = tableView(unknown.view).tables[0]!.rows[3]!;
    expect(row).toMatchObject({ role: 'discarded', note: 'removed' });
  });

  it('shows join pairs and unmatched LEFT JOIN rows', () => {
    const steps = stepsFor('SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id');
    expect(steps.some((s) => s.title === 'customers row 1 with orders row 1: o.customer_id = c.id → true')).toBe(true);
    expect(steps.some((s) => s.title === 'No match for row 8, so LEFT JOIN keeps it with NULLs')).toBe(true);
  });

  it('shows groups forming and collapsing', () => {
    const titles = stepsFor('SELECT category, COUNT(*) FROM products GROUP BY category').map((s) => s.title);
    expect(titles).toContain('GROUP BY sorted rows into 3 groups');
    expect(titles).toContain('Each group becomes one row');
  });

  it('caps long runs and summarises the skipped checks', () => {
    const steps = stepsFor(
      'SELECT * FROM order_items oi JOIN orders o ON oi.order_id = o.id ' +
        'JOIN products p ON oi.product_id = p.id JOIN customers c ON o.customer_id = c.id',
    );
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS);
    expect(steps.some((s) => /^…\d+ more rows checked, \d+ kept$/.test(s.title))).toBe(true);
    expect(steps.at(-1)!.title).toBe('Result: 18 rows');
  });

  it('says row for a single row', () => {
    expect(stepsFor('SELECT COUNT(*) FROM orders').at(-1)!.title).toBe('Result: 1 row');
  });

  it('reports invalid SQL', () => {
    expect(querySteps(shop, 'SELECT nope FROM customers').ok).toBe(false);
  });
});

describe('viewAt', () => {
  it('returns a step view, counting from the end when negative', () => {
    const sql = 'SELECT name FROM products ORDER BY price LIMIT 2';
    expect(viewAt(shop, sql, -1)).toEqual(stepsFor(sql).at(-1)!.view);
    expect(viewAt(shop, sql, 0)).toEqual(stepsFor(sql)[0]!.view);
  });

  it('throws for invalid SQL', () => {
    expect(() => viewAt(shop, 'SELECT', 0)).toThrow();
  });
});
