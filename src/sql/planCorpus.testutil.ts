import type { DatasetId } from './datasets';

/**
 * EXPLAIN QUERY PLAN cases compared with SQLite. Only queries SQLite plans by the rules the
 * planner models: no join reordering, automatic indexes, OR optimisation or MIN/MAX shortcuts.
 */
export interface PlanCase {
  dataset: DatasetId;
  /** Statements run first, such as CREATE INDEX. */
  setup?: string;
  sql: string;
}

const salary = 'CREATE INDEX idx_salary ON employees(salary)';
const dept = 'CREATE INDEX idx_dept ON employees(department_id)';
const deptSalary = 'CREATE INDEX idx_dept_salary ON employees(department_id, salary)';

const company = (sql: string, setup?: string): PlanCase => ({ dataset: 'company', sql, ...(setup && { setup }) });
const school = (sql: string, setup?: string): PlanCase => ({ dataset: 'school', sql, ...(setup && { setup }) });

export const planCorpus: PlanCase[] = [
  // Scans and rowid lookups.
  company('SELECT * FROM employees'),
  company('SELECT * FROM employees WHERE id = 3'),
  company('SELECT * FROM employees WHERE id > 3'),
  company('SELECT * FROM employees WHERE id IN (1, 2)'),
  company('SELECT name FROM employees WHERE id BETWEEN 2 AND 5'),
  company('SELECT name FROM employees WHERE id < 5'),
  company('SELECT name FROM employees WHERE salary > 5000'),
  company('SELECT name FROM employees WHERE department_id = 2'),
  company('SELECT name FROM employees ORDER BY id'),
  company('SELECT name FROM employees ORDER BY id DESC'),
  company('SELECT COUNT(*) FROM employees'),
  // Temp B-trees.
  company('SELECT department_id, COUNT(*) FROM employees GROUP BY department_id'),
  company('SELECT DISTINCT department_id FROM employees'),
  company('SELECT DISTINCT department_id FROM employees ORDER BY department_id'),
  company('SELECT department_id, COUNT(*) FROM employees GROUP BY department_id ORDER BY department_id'),
  school('SELECT name FROM students ORDER BY name LIMIT 3'),
  // Joins in written order.
  company('SELECT e.name, d.name FROM employees e JOIN departments d ON d.id = e.department_id'),
  company('SELECT e.name, m.name FROM employees e JOIN employees m ON m.id = e.manager_id'),
  company('SELECT e.name, m.name FROM employees e LEFT JOIN employees m ON m.id = e.manager_id'),
  company("SELECT e.name FROM departments d JOIN employees e ON e.department_id = d.id WHERE d.name = 'Sales'", dept),
  company('SELECT e.name FROM departments d LEFT JOIN employees e ON e.department_id = d.id', dept),
  // Subqueries.
  company('SELECT name FROM employees WHERE salary > (SELECT AVG(salary) FROM employees)'),
  company('SELECT name FROM employees e WHERE salary > (SELECT AVG(salary) FROM employees x WHERE x.department_id = e.department_id)'),
  company('SELECT name, (SELECT name FROM departments d WHERE d.id = e.department_id) FROM employees e'),
  // Compound queries.
  company('SELECT name FROM employees UNION ALL SELECT name FROM departments'),
  company('SELECT name FROM employees UNION SELECT name FROM departments'),
  company('SELECT department_id FROM employees INTERSECT SELECT id FROM departments'),
  company('SELECT department_id FROM employees EXCEPT SELECT id FROM departments'),
  // CTEs: simple ones are inlined; others run as a co-routine.
  company('WITH d AS (SELECT name, salary FROM employees) SELECT * FROM d'),
  company('WITH d AS (SELECT name, salary FROM employees WHERE salary > 5000) SELECT name FROM d WHERE salary < 8000'),
  company('WITH d AS (SELECT department_id, AVG(salary) AS a FROM employees GROUP BY department_id) SELECT * FROM d'),
  company('WITH d AS (SELECT DISTINCT department_id FROM employees) SELECT * FROM d'),
  // One-column index.
  company('SELECT name FROM employees WHERE salary > 5000', salary),
  company('SELECT salary FROM employees WHERE salary > 5000', salary),
  company('SELECT id, salary FROM employees WHERE salary > 5000', salary),
  company('SELECT COUNT(*) FROM employees WHERE salary > 5000', salary),
  company('SELECT name FROM employees WHERE salary >= 5000', salary),
  company('SELECT name FROM employees WHERE salary <= 5000', salary),
  company('SELECT name FROM employees WHERE salary BETWEEN 4000 AND 6000', salary),
  company('SELECT name FROM employees WHERE salary >= 4000 AND salary <= 6000', salary),
  company('SELECT name FROM employees WHERE salary < 4000 AND salary > 3000', salary),
  company('SELECT name FROM employees WHERE salary = 5200', salary),
  company('SELECT name FROM employees WHERE salary IN (5200, 4800)', salary),
  company('SELECT name FROM employees WHERE 5000 < salary', salary),
  company('SELECT name FROM employees WHERE salary + 0 > 5000', salary),
  company('SELECT name FROM employees WHERE salary IS NULL', salary),
  company("SELECT name FROM employees WHERE salary > 5000 AND name LIKE 'K%'", salary),
  company('SELECT name FROM employees WHERE salary > 5000 LIMIT 2', salary),
  company('SELECT name FROM employees WHERE id = 3 AND salary > 1000', salary),
  company('SELECT name FROM employees ORDER BY salary', salary),
  company('SELECT name FROM employees ORDER BY salary DESC', salary),
  company('SELECT name FROM employees ORDER BY name', salary),
  company('SELECT name FROM employees ORDER BY salary, name', salary),
  company("SELECT name FROM employees WHERE name = 'Lan' ORDER BY salary", salary),
  company('SELECT name FROM employees WHERE salary > 5000 ORDER BY salary', salary),
  company('SELECT name FROM employees WHERE salary > 5000 ORDER BY name', salary),
  company('SELECT DISTINCT salary FROM employees', salary),
  company('SELECT salary, COUNT(*) FROM employees GROUP BY salary', salary),
  company('SELECT salary, COUNT(*) FROM employees GROUP BY salary ORDER BY COUNT(*)', salary),
  company("SELECT name FROM employees WHERE hired > '2020-01-01'", 'CREATE INDEX idx_hired ON employees(hired)'),
  company("SELECT * FROM employees WHERE name = 'Lan'", 'CREATE UNIQUE INDEX idx_name ON employees(name)'),
  // Grouping through an index.
  company('SELECT department_id, COUNT(*) FROM employees GROUP BY department_id', dept),
  company('SELECT department_id, SUM(salary) FROM employees GROUP BY department_id', dept),
  company('SELECT DISTINCT department_id FROM employees', dept),
  // Two-column index.
  company('SELECT name FROM employees WHERE department_id = 2 AND salary > 5000', deptSalary),
  company('SELECT name FROM employees WHERE salary > 5000', deptSalary),
  company('SELECT name FROM employees WHERE department_id = 2', deptSalary),
  company('SELECT salary FROM employees WHERE department_id = 2 ORDER BY salary', deptSalary),
  company('SELECT name FROM employees WHERE department_id IN (2, 3) AND salary > 5000', deptSalary),
  // Equality beats a range.
  company('SELECT name FROM employees WHERE department_id = 2 AND salary > 5000', `${salary}; ${dept}`),
  // Implicit indexes.
  school("SELECT * FROM students WHERE email = 'mai@school.edu'"),
  school('SELECT * FROM enrollments WHERE student_id = 1'),
  school('SELECT * FROM enrollments WHERE student_id = 1 AND course_id = 2'),
  school('SELECT * FROM enrollments WHERE course_id = 2'),
  school('SELECT student_id, COUNT(*) FROM enrollments GROUP BY student_id'),
  school('SELECT name FROM students WHERE year = 2 ORDER BY name', 'CREATE INDEX idx_year ON students(year)'),
];
