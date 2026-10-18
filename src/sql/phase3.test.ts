import { describe, expect, it } from 'vitest';
import { datasets, findTable } from './datasets';
import { runScript } from './script';
import { runQuery } from './execute';
import { parseQuery } from './parse';
import { querySteps } from './steps';
import { toPlain } from './values';

export function rows(sql: string, db = datasets.shop) {
  const result = runQuery(db, sql);
  if (!result.ok) throw new Error(`${result.error.message} (${result.error.line}:${result.error.column})`);
  return result.result.rows.map((r) => r.map(toPlain));
}

export function error(sql: string, db = datasets.shop) {
  const result = runQuery(db, sql);
  if (result.ok) throw new Error(`expected an error: ${sql}`);
  return result.error;
}

describe('CASE', () => {
  it('parses the searched form', () => {
    const parsed = parseQuery("SELECT CASE WHEN price > 1 THEN 'a' WHEN price > 0 THEN 'b' ELSE 'c' END FROM products");
    if (!parsed.ok) throw new Error(parsed.error.message);
    const item = parsed.statement.columns[0]!;
    expect(item.kind === 'expr' && item.expr).toMatchObject({ type: 'case', whens: [{}, {}], else: { type: 'literal', value: 'c' } });
  });

  it('parses the simple form', () => {
    const parsed = parseQuery("SELECT CASE category WHEN 'Books' THEN 1 END FROM products");
    if (!parsed.ok) throw new Error(parsed.error.message);
    const item = parsed.statement.columns[0]!;
    expect(item.kind === 'expr' && item.expr).toMatchObject({ type: 'case', operand: { type: 'column', name: 'category' } });
  });

  it('needs END', () => {
    expect(error("SELECT CASE WHEN 1 THEN 'a' FROM products").message).toContain('Expected END');
  });

  it('takes the first true branch, and NULL without ELSE', () => {
    expect(rows('SELECT CASE WHEN 1 = 1 THEN 1 WHEN 1 = 1 THEN 2 END FROM customers WHERE id = 1')).toEqual([[1]]);
    expect(rows('SELECT CASE WHEN 1 = 0 THEN 1 END FROM customers WHERE id = 1')).toEqual([[null]]);
  });

  it('never matches NULL in the simple form', () => {
    expect(rows("SELECT CASE city WHEN NULL THEN 'n' ELSE 'e' END FROM customers WHERE id = 4")).toEqual([['e']]);
  });

  it('works inside aggregates and GROUP BY', () => {
    expect(rows("SELECT SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) FROM orders")).toEqual([[7]]);
    expect(rows("SELECT CASE WHEN price > 30 THEN 'high' ELSE 'low' END, COUNT(*) FROM products GROUP BY CASE WHEN price > 30 THEN 'high' ELSE 'low' END ORDER BY 1")).toEqual([
      ['high', 4],
      ['low', 5],
    ]);
  });
});

describe('SELECT without FROM', () => {
  it('returns one row', () => {
    expect(rows("SELECT 1, 'a'")).toEqual([[1, 'a']]);
    expect(rows('SELECT 1 + 1 AS two')).toEqual([[2]]);
  });

  it('can be filtered away', () => {
    expect(rows('SELECT 1 WHERE 0')).toEqual([]);
  });

  it('counts its one row', () => {
    expect(rows('SELECT COUNT(*)')).toEqual([[1]]);
  });

  it('has no columns to name', () => {
    expect(error('SELECT x').message).toContain('No column `x`');
  });

  it('still asks for a comma when two names run together', () => {
    expect(error('SELECT name city FROM customers').message).toContain('Is a comma missing');
  });

  it('steps from start to result on line 1', () => {
    const result = querySteps(datasets.shop, 'SELECT 1 + 1');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
    expect(result.steps.every((s) => s.codeLine === 1)).toBe(true);
    expect(result.steps.at(-1)!.title).toBe('Result: 1 row');
  });
});

const sorted = (r: unknown[][]) => [...r].map((x) => JSON.stringify(x)).sort();

describe('set operations', () => {
  it('UNION removes duplicates, including NULL duplicates', () => {
    expect(sorted(rows('SELECT city FROM customers UNION SELECT city FROM customers'))).toEqual(
      sorted(rows('SELECT DISTINCT city FROM customers')),
    );
  });

  it('UNION ALL keeps every row', () => {
    expect(rows('SELECT city FROM customers UNION ALL SELECT city FROM customers')).toHaveLength(20);
  });

  it('INTERSECT and EXCEPT', () => {
    const shipped = "SELECT customer_id FROM orders WHERE status = 'shipped'";
    const pending = "SELECT customer_id FROM orders WHERE status = 'pending'";
    const both = rows(`${shipped} INTERSECT ${pending}`).map((r) => r[0]);
    const onlyShipped = rows(`${shipped} EXCEPT ${pending}`).map((r) => r[0]);
    const s = new Set(rows(shipped).map((r) => r[0]));
    const p = new Set(rows(pending).map((r) => r[0]));
    expect(new Set(both)).toEqual(new Set([...s].filter((x) => p.has(x))));
    expect(new Set(onlyShipped)).toEqual(new Set([...s].filter((x) => !p.has(x))));
    expect(new Set(both).size).toBe(both.length);
  });

  it('runs three operands left to right', () => {
    const r = rows('SELECT id FROM customers WHERE id <= 3 UNION SELECT id FROM customers WHERE id = 5 EXCEPT SELECT id FROM customers WHERE id = 2');
    expect(r.map((x) => x[0]).sort()).toEqual([1, 3, 5]);
  });

  it('names columns after the first SELECT', () => {
    const result = runQuery(datasets.shop, 'SELECT name AS who FROM customers UNION SELECT name FROM products');
    expect(result.ok && result.result.columns).toEqual(['who']);
  });

  it('refuses different column counts at the second SELECT', () => {
    const e = error('SELECT id, name FROM customers\nUNION\nSELECT id, name, city FROM customers');
    expect(e.message).toBe('Each SELECT in a UNION must return the same number of columns: the first returns 2, this one returns 3.');
    expect(e.line).toBe(3);
  });

  it('sorts and limits the whole result by name or position', () => {
    expect(rows('SELECT id FROM customers WHERE id < 3 UNION SELECT id FROM products WHERE id > 7 ORDER BY 1 DESC LIMIT 2')).toEqual([[9], [8]]);
    expect(rows("SELECT name FROM customers WHERE id = 1 UNION SELECT name FROM products WHERE id = 1 ORDER BY name")).toEqual([['Ana'], ['SQL Basics']]);
  });

  it('only sorts by a result column or position', () => {
    expect(error('SELECT price FROM products UNION SELECT id FROM customers ORDER BY price * 2').message).toBe(
      'ORDER BY after UNION can only name a result column or its position.',
    );
  });

  it('puts ORDER BY and LIMIT after the last SELECT', () => {
    expect(error('SELECT id FROM customers ORDER BY id UNION SELECT id FROM products').message).toBe(
      'ORDER BY and LIMIT go after the last SELECT of a UNION.',
    );
  });
});

describe('CTEs', () => {
  const company = datasets.company;

  it('reads a CTE like a table', () => {
    expect(rows('WITH big AS (SELECT name, salary FROM employees WHERE salary > 6000) SELECT name FROM big ORDER BY salary DESC', company)).toEqual([
      ['Lan'],
      ['Minh'],
      ['Hoa'],
    ]);
  });

  it('lets later CTEs use earlier ones', () => {
    const sql =
      'WITH eng AS (SELECT * FROM employees WHERE department_id = 2), rich AS (SELECT name FROM eng WHERE salary > 5000) SELECT COUNT(*) FROM rich';
    expect(rows(sql, company)).toEqual([[4]]);
  });

  it('can be used twice in one query', () => {
    const sql = 'WITH d AS (SELECT department_id, AVG(salary) AS avg_salary FROM employees GROUP BY department_id) SELECT COUNT(*) FROM d a JOIN d b ON a.avg_salary < b.avg_salary';
    expect(rows(sql, company)).toEqual([[6]]);
  });

  it('renames columns with a column list', () => {
    const result = runQuery(company, 'WITH t (who, pay) AS (SELECT name, salary FROM employees) SELECT who FROM t WHERE pay = 9000');
    expect(result.ok && result.result.rows).toEqual([['Lan']]);
  });

  it('checks the column list against the SELECT', () => {
    expect(error('WITH t (a, b) AS (SELECT id, name, salary FROM employees) SELECT * FROM t', company).message).toBe(
      'CTE `t` lists 2 columns but its SELECT returns 3.',
    );
  });

  it('shadows a table of the same name for this query only', () => {
    expect(rows('WITH employees AS (SELECT 1 AS n) SELECT * FROM employees', company)).toEqual([[1]]);
    expect(rows('SELECT COUNT(*) FROM employees', company)).toEqual([[12]]);
  });

  it('is visible inside subqueries', () => {
    expect(rows('WITH top AS (SELECT MAX(salary) AS s FROM employees) SELECT name FROM employees WHERE salary = (SELECT s FROM top)', company)).toEqual([['Lan']]);
  });

  it('suggests a close name for a missing CTE', () => {
    expect(error('WITH dept_pay AS (SELECT 1 AS n) SELECT * FROM dept_py', company).message).toContain('Did you mean `dept_pay`?');
  });

  it('needs RECURSIVE to refer to itself', () => {
    expect(error('WITH n (x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 3) SELECT * FROM n', company).message).toBe(
      'Add RECURSIVE to let a CTE refer to itself.',
    );
  });

  it('can come before INSERT, UPDATE and DELETE', () => {
    const update = runScript(company, 'WITH low AS (SELECT id FROM employees WHERE salary < 4000) UPDATE employees SET salary = salary + 100 WHERE id IN (SELECT id FROM low)');
    expect(update.ok && findTable(update.db, 'employees')!.rows.filter((r) => r[4] === 3100 || r[4] === 3700 || r[4] === 4000).length).toBe(3);
    const del = runScript(company, 'WITH leaf AS (SELECT id FROM employees WHERE id = 11) DELETE FROM employees WHERE id IN (SELECT id FROM leaf)');
    expect(del.ok && findTable(del.db, 'employees')!.rows).toHaveLength(11);
    const ins = runScript(company, "WITH n AS (SELECT 'Tam' AS name) INSERT INTO employees (name, salary) SELECT name, 3000 FROM n");
    expect(ins.ok && findTable(ins.db, 'employees')!.rows.at(-1)).toEqual([13, 'Tam', null, null, 3000, null]);
  });
});
