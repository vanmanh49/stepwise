import { describe, expect, it } from 'vitest';
import { datasets, type Dataset } from './datasets';
import type { TraceEvent } from './execute';
import { runScript, type ScriptResult } from './script';
import { querySteps } from './steps';
import type { WriteEvent } from './write';

const company = datasets.company;

function run(sql: string, db: Dataset = company): { result: Extract<ScriptResult, { ok: true }>; events: WriteEvent[] } {
  const events: WriteEvent[] = [];
  const result = runScript(db, sql, (e) => events.push(e));
  if (!result.ok) throw new Error(result.error.message);
  return { result, events };
}

const lastRows = (sql: string, db?: Dataset) => run(sql, db).result.statements.at(-1)!.result!.rows;
const searches = (events: WriteEvent[]) => events.filter((e): e is Extract<TraceEvent, { kind: 'index-search' }> => e.kind === 'index-search');

describe('reading through a created index', () => {
  it('reads only the matching rows, in index order', () => {
    const { result, events } = run('CREATE INDEX idx_salary ON employees(salary);\nSELECT name FROM employees WHERE salary > 5000');
    expect(result.statements.at(-1)!.result!.rows.map((r) => r[0])).toEqual(['Tuan', 'Vy', 'Khoa', 'Hoa', 'Minh', 'Lan']);
    const [search] = searches(events);
    expect(search).toMatchObject({ table: 'employees', label: 'employees', index: 'idx_salary', examined: 6, total: 12, condition: 'salary > 5000' });
    expect(search!.path[0]).toBe(search!.tree.root);
    expect(searches(events)).toHaveLength(1);
  });

  it('gives the same rows as a scan after writes change the indexed column', () => {
    const sql = 'CREATE INDEX i ON employees(salary);\nUPDATE employees SET salary = 9999 WHERE id = 4;\nUPDATE employees SET salary = 100 WHERE id = 1;\nSELECT name FROM employees WHERE salary >= 9000';
    expect(lastRows(sql)).toEqual([['Tuan']]);
    expect(lastRows('CREATE INDEX i ON employees(salary);\nUPDATE employees SET salary = 9999 WHERE id = 4;\nSELECT name FROM employees WHERE salary >= 9000')).toEqual([['Lan'], ['Tuan']]);
  });

  it('never matches NULL in an indexed column', () => {
    const sql = 'SELECT name FROM employees WHERE department_id < 3';
    const plain = lastRows(sql).map((r) => r[0]).toSorted();
    expect(lastRows(`CREATE INDEX i ON employees(department_id);\n${sql}`).map((r) => r[0]).toSorted()).toEqual(plain);
    expect(plain).not.toContain('Thu');
  });

  it('searches IN lists and two-column indexes', () => {
    expect(lastRows('CREATE INDEX i ON employees(salary);\nSELECT name FROM employees WHERE salary IN (4800, 5200)').map((r) => r[0])).toEqual(['Linh', 'Quang', 'Tuan', 'Vy']);
    expect(lastRows('CREATE INDEX i ON employees(department_id, salary);\nSELECT name FROM employees WHERE department_id = 2 AND salary > 5000').map((r) => r[0])).toEqual(['Tuan', 'Vy', 'Khoa', 'Minh']);
  });

  it('compares with the column’s type, as a scan does', () => {
    expect(lastRows("CREATE INDEX i ON employees(salary);\nSELECT name FROM employees WHERE salary = '9000'")).toEqual([['Lan']]);
  });

  it('searches the inner table of a join once per outer row', () => {
    const sql = "CREATE INDEX idx_dept ON employees(department_id);\nSELECT e.name FROM departments d JOIN employees e ON e.department_id = d.id WHERE d.name = 'Sales'";
    const { result, events } = run(sql);
    expect(result.statements.at(-1)!.result!.rows.map((r) => r[0]).toSorted()).toEqual(['Hoa', 'Linh', 'Mai', 'Quang']);
    expect(searches(events)).toHaveLength(4);
    const pairs = events.filter((e) => e.kind === 'join-test');
    expect(pairs).toHaveLength(11); // 1 + 6 + 4 + 0 candidates instead of 4 × 12
  });

  it('keeps a LEFT JOIN’s unmatched rows', () => {
    const sql = 'CREATE INDEX idx_dept ON employees(department_id);\nSELECT d.name, e.name FROM departments d LEFT JOIN employees e ON e.department_id = d.id';
    expect(lastRows(sql)).toContainEqual(['Support', null]);
    expect(lastRows(sql)).toHaveLength(12);
  });

  it('leaves rowid and implicit-index plans reading every row', () => {
    const { events } = run('SELECT e.name, m.name FROM employees e JOIN employees m ON m.id = e.manager_id');
    expect(searches(events)).toEqual([]);
    expect(events.filter((e) => e.kind === 'join-test')).toHaveLength(144);
    const steps = querySteps(datasets.school, "SELECT * FROM students WHERE email = 'mai@school.edu'");
    if (!steps.ok) throw new Error(steps.error.message);
    expect(steps.steps.filter((s) => s.title.startsWith('Row')).length).toBe(10);
  });
});
