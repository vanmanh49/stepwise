// Timings for the SQL engine on queries that do many row checks. Run with `npm run bench`.
import { expect, test } from 'vitest';
import { datasets } from './datasets';
import { runQuery } from './execute';
import { scriptSteps } from './scriptSteps';

const company = datasets.company;
const crossJoin = 'SELECT COUNT(*) FROM employees a JOIN employees b ON 1 = 1 JOIN employees c ON 1 = 1 JOIN employees d ON a.id = d.id';
const filtered = 'SELECT a.name, b.name FROM employees a JOIN employees b ON a.salary > b.salary AND a.department_id = b.department_id';
const correlated = 'SELECT name FROM employees e WHERE salary > (SELECT AVG(salary) FROM employees x WHERE x.department_id = e.department_id)';
const budget = Array.from({ length: 10 }, () => crossJoin).join(' UNION ALL ');

const queries = { '4-table join, 22,600 row checks': crossJoin, 'self join with a filtering ON': filtered, 'correlated subquery': correlated };

test('execute only', async ({ bench }) => {
  // Time the real work, not an early error.
  for (const sql of Object.values(queries)) expect(runQuery(company, sql).ok, sql).toBe(true);
  expect(runQuery(company, budget)).toMatchObject({ ok: false, error: { kind: 'limit' } });
  await bench.compare(...Object.entries(queries).map(([name, sql]) => bench(name, () => void runQuery(company, sql))));
});

test('execute a query that hits the work budget', async ({ bench }) => {
  // Each run takes hundreds of milliseconds, so a few are enough.
  await bench('query that hits the work budget', () => void runQuery(company, budget)).run({ iterations: 5 });
});

test('execute and build steps', async ({ bench }) => {
  await bench.compare(...Object.entries(queries).map(([name, sql]) => bench(name, () => void scriptSteps(company, sql))));
});
