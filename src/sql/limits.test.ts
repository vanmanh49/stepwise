import { describe, expect, it } from 'vitest';
import { checkExercise } from './check';
import { datasets } from './datasets';
import { runQuery } from './execute';
import { parseQuery } from './parse';
import { MAX_STEPS, querySteps } from './steps';

const shop = datasets.shop;

function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}

describe('work limits', () => {
  const explosive =
    'SELECT COUNT(*) FROM customers a JOIN customers b ON 1 = 1 JOIN customers c ON 1 = 1 JOIN customers d ON 1 = 1';

  it('refuses a join that produces too many rows, with a teaching error', () => {
    for (const result of [runQuery(shop, explosive), querySteps(shop, explosive)]) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('limit');
        expect(result.error.message).toContain('JOIN');
      }
    }
    expect(checkExercise(shop, explosive, { solution: 'SELECT 1 FROM customers', orderMatters: false }).status).toBe('error');
  });

  it('steps through a large but allowed cross join quickly', () => {
    const { value, ms } = timed(() =>
      querySteps(shop, 'SELECT COUNT(*) FROM customers a JOIN customers b ON 1 = 1 JOIN customers c ON 1 = 1'),
    );
    expect(value.ok).toBe(true);
    if (value.ok) expect(value.steps.length).toBeLessThanOrEqual(MAX_STEPS);
    expect(ms).toBeLessThan(1500);
  });

  it('runs an uncorrelated subquery once, however deeply nested', () => {
    let sql = 'SELECT id FROM customers';
    for (let i = 0; i < 8; i++) sql = `SELECT id FROM customers WHERE id IN (${sql})`;
    const { value, ms } = timed(() => runQuery(shop, sql));
    expect(value.ok).toBe(true);
    if (value.ok) expect(value.result.rows).toHaveLength(10);
    expect(ms).toBeLessThan(500);
  });

  it('still re-runs a correlated subquery for each row', () => {
    const result = runQuery(shop, 'SELECT name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) FROM customers c');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.result.rows.map((r) => r[1])).toEqual([3, 2, 2, 1, 1, 1, 1, 0, 1, 0]);
  });
});

describe('never throws', () => {
  it('reports deeply nested parentheses as an error', () => {
    const sql = 'SELECT ' + '('.repeat(985) + '1' + ')'.repeat(985) + ' FROM customers';
    const parsed = parseQuery(sql);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatchObject({ kind: 'limit', message: 'This query nests too deeply (more than 100 levels).' });
    expect(querySteps(shop, sql).ok).toBe(false);
    expect(runQuery(shop, sql).ok).toBe(false);
  });

  it('allows ordinary nesting', () => {
    expect(runQuery(shop, 'SELECT ' + '('.repeat(30) + '1' + ')'.repeat(30) + ' FROM customers').ok).toBe(true);
  });
});
