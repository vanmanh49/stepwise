import { describe, expect, it } from 'vitest';
import { datasets, indexesOf, type Dataset } from './datasets';
import { runScript, type ScriptResult } from './script';

const company = datasets.company;

function ok(sql: string, db: Dataset = company): Extract<ScriptResult, { ok: true }> {
  const result = runScript(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} (line ${result.error.line})`);
  return result;
}

function error(sql: string, db: Dataset = company): string {
  const result = runScript(db, sql);
  if (result.ok) throw new Error(`expected a failure: ${sql}`);
  return result.error.message;
}

const selected = (result: Extract<ScriptResult, { ok: true }>) => result.statements.at(-1)!.result!.rows;

describe('CREATE INDEX and DROP INDEX', () => {
  it('adds and removes an index', () => {
    const created = ok('CREATE INDEX idx_salary ON employees(salary)');
    expect(indexesOf(created.db, 'employees')).toEqual([{ name: 'idx_salary', table: 'employees', columns: ['salary'], unique: false, implicit: false }]);
    expect(ok('CREATE INDEX idx_salary ON employees(salary); DROP INDEX idx_salary').db.indexes).toEqual([]);
  });

  it('reports unknown tables, columns and names', () => {
    expect(error('CREATE INDEX i ON nobody(x)')).toBe('No table `nobody`.');
    expect(error('CREATE INDEX i ON employees(wage)')).toMatch(/^No column `wage` in employees\./);
    expect(error('CREATE INDEX i ON employees(salary); CREATE INDEX i ON employees(name)')).toBe('An index called `i` already exists.');
    expect(ok('CREATE INDEX i ON employees(salary); CREATE INDEX IF NOT EXISTS i ON employees(name)').db.indexes).toHaveLength(1);
    expect(error('DROP INDEX i')).toBe('No index `i`.');
    expect(ok('DROP INDEX IF EXISTS i').ok).toBe(true);
    expect(error('DROP INDEX sqlite_autoindex_students_1', datasets.school)).toBe(
      '`sqlite_autoindex_students_1` belongs to a UNIQUE or PRIMARY KEY constraint and can\'t be dropped.',
    );
  });

  it('refuses a UNIQUE index over duplicate values, naming the rows', () => {
    expect(error('CREATE UNIQUE INDEX i ON employees(salary)')).toBe("Can't create UNIQUE index `i`: rows 4 and 5 both have salary 5200.");
    expect(error('CREATE UNIQUE INDEX i ON employees(department_id, salary)')).toBe(
      "Can't create UNIQUE index `i`: rows 4 and 5 both have department_id 2, salary 5200.",
    );
    expect(ok('CREATE UNIQUE INDEX i ON employees(name)').db.indexes![0]!.unique).toBe(true);
  });

  it('drops a table’s indexes with the table', () => {
    expect(ok('CREATE TABLE t (x INTEGER); CREATE INDEX i ON t(x); DROP TABLE t').db.indexes).toEqual([]);
  });
});

describe('views', () => {
  const deptPay = 'CREATE VIEW dept_pay AS SELECT department_id, SUM(salary) AS total FROM employees GROUP BY department_id';

  it('stores a query and reads it like a table', () => {
    const result = ok(`${deptPay}; SELECT total FROM dept_pay WHERE department_id = 2`);
    expect(selected(result)).toEqual([[30500]]);
    expect(result.db.views!.map((v) => [v.name, v.sql])).toEqual([
      ['dept_pay', 'SELECT department_id, SUM(salary) AS total FROM employees GROUP BY department_id'],
    ]);
  });

  it('reads views of views, views in joins and column lists', () => {
    expect(selected(ok(`${deptPay}; CREATE VIEW big AS SELECT * FROM dept_pay WHERE total > 10000; SELECT department_id FROM big`))).toEqual([[2], [3]]);
    expect(selected(ok(`${deptPay}; SELECT d.name FROM departments d JOIN dept_pay p ON p.department_id = d.id WHERE p.total < 10000`))).toEqual([['Management']]);
    expect(selected(ok('CREATE VIEW v (who, pay) AS SELECT name, salary FROM employees WHERE id = 1; SELECT who, pay FROM v'))).toEqual([['Lan', 9000]]);
    expect(error('CREATE VIEW v (a, b) AS SELECT name FROM employees')).toBe('View `v` lists 2 columns but its SELECT returns 1.');
  });

  it('sees the tables as they are when it is read', () => {
    expect(selected(ok("CREATE VIEW names AS SELECT name FROM employees; INSERT INTO employees (name, salary) VALUES ('Tam', 1000); SELECT COUNT(*) FROM names"))).toEqual([[13]]);
  });

  it('is read-only', () => {
    const message = 'Views are read-only here; change the table it reads from.';
    expect(error(`${deptPay}; INSERT INTO dept_pay VALUES (5, 0)`)).toBe(message);
    expect(error(`${deptPay}; UPDATE dept_pay SET total = 0`)).toBe(message);
    expect(error(`${deptPay}; DELETE FROM dept_pay`)).toBe(message);
  });

  it('names the right DROP and refuses clashing names', () => {
    expect(error(`${deptPay}; DROP TABLE dept_pay`)).toBe('`dept_pay` is a view. Use DROP VIEW.');
    expect(error('DROP VIEW employees')).toBe('`employees` is a table. Use DROP TABLE.');
    expect(error('DROP VIEW v')).toBe('No view `v`.');
    expect(ok('DROP VIEW IF EXISTS v').ok).toBe(true);
    expect(error('CREATE VIEW employees AS SELECT 1')).toBe('A table or view called `employees` already exists.');
    expect(error(`${deptPay}; CREATE TABLE dept_pay (x INTEGER)`)).toBe('A table or view called `dept_pay` already exists.');
    expect(ok(`${deptPay}; CREATE VIEW IF NOT EXISTS dept_pay AS SELECT 1`).db.views).toHaveLength(1);
    expect(ok(`${deptPay}; DROP VIEW dept_pay`).db.views).toEqual([]);
  });

  it('checks its query when created, so it cannot name itself', () => {
    expect(error('CREATE VIEW v AS SELECT * FROM v')).toBe('No table `v`.');
    expect(error('CREATE VIEW v AS SELECT wage FROM employees')).toMatch(/No column `wage`/);
  });

  it('fails when read after its table is dropped', () => {
    const db = ok('CREATE TABLE t (x INTEGER); CREATE VIEW v AS SELECT x FROM t; DROP TABLE t').db;
    expect(error('SELECT * FROM v', db)).toMatch(/^No table `t`\./);
  });

  it('cannot form a cycle, because a new view must read views that exist', () => {
    expect(error('CREATE VIEW v1 AS SELECT 1 AS x; CREATE VIEW v2 AS SELECT x FROM v1; DROP VIEW v1; CREATE VIEW v1 AS SELECT x FROM v2')).toMatch(
      /^No table `v1`\./,
    );
  });
});
