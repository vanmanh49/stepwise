import type { DatasetId } from './datasets';

type Entry = { db: DatasetId; sql: string; ordered?: boolean };

const shop = (sql: string, ordered = false): Entry => ({ db: 'shop', sql, ordered });
const school = (sql: string, ordered = false): Entry => ({ db: 'school', sql, ordered });
const company = (sql: string, ordered = false): Entry => ({ db: 'company', sql, ordered });

/** Phase 3 queries run through both the interpreter and SQLite; results must match. */
export const corpus3: Entry[] = [
  // CASE
  shop("SELECT name, CASE WHEN price >= 40 THEN 'premium' WHEN price >= 15 THEN 'standard' ELSE 'budget' END FROM products"),
  shop("SELECT name, CASE category WHEN 'Books' THEN 'read' WHEN 'Kitchen' THEN 'cook' END FROM products"),
  shop("SELECT name, CASE WHEN city IS NULL THEN 'unknown' ELSE city END FROM customers"),
  shop("SELECT CASE city WHEN NULL THEN 'null' ELSE 'other' END FROM customers"),
  shop("SELECT SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END), SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) FROM orders"),
  shop("SELECT name FROM products ORDER BY CASE category WHEN 'Kitchen' THEN 0 ELSE 1 END, name", true),
  shop("SELECT CASE WHEN price > 30 THEN 'high' ELSE 'low' END AS band, COUNT(*) FROM products GROUP BY CASE WHEN price > 30 THEN 'high' ELSE 'low' END"),
  shop("SELECT name FROM products WHERE CASE WHEN category = 'Books' THEN price < 20 ELSE price < 10 END"),
  shop('SELECT CASE WHEN 1 = 0 THEN 1 END FROM customers WHERE id = 1'),
  shop("SELECT CASE WHEN price > 40 THEN price * 2 WHEN price > 10 THEN price ELSE 0 END FROM products"),
  school("SELECT name, CASE year WHEN 1 THEN 'first' WHEN 2 THEN 'second' ELSE 'senior' END FROM students"),
  school("SELECT AVG(CASE WHEN grade >= 80 THEN 1.0 ELSE 0 END) FROM enrollments"),
  company("SELECT name, CASE WHEN manager_id IS NULL THEN 'boss' WHEN salary > 5000 THEN 'senior' ELSE 'staff' END FROM employees"),
  // SELECT without FROM
  shop("SELECT 1, 'a', NULL"),
  shop('SELECT 7 / 2, 7.0 / 2, 7 % 3'),
  shop('SELECT COUNT(*), SUM(5)'),
  shop("SELECT CASE WHEN 1 > 2 THEN 'x' ELSE 'y' END"),
  // Set operations
  shop('SELECT city FROM customers UNION SELECT city FROM customers'),
  shop('SELECT city FROM customers UNION ALL SELECT city FROM customers'),
  shop("SELECT customer_id FROM orders WHERE status = 'shipped' UNION SELECT customer_id FROM orders WHERE status = 'pending'"),
  shop("SELECT customer_id FROM orders WHERE status = 'shipped' INTERSECT SELECT customer_id FROM orders WHERE status = 'pending'"),
  shop("SELECT customer_id FROM orders WHERE status = 'shipped' EXCEPT SELECT customer_id FROM orders WHERE status = 'pending'"),
  shop('SELECT name FROM customers UNION SELECT name FROM products ORDER BY name', true),
  shop('SELECT id, name FROM customers UNION SELECT id, name FROM products ORDER BY 1 DESC, 2 LIMIT 5', true),
  shop('SELECT city FROM customers INTERSECT SELECT city FROM customers WHERE city IS NULL'),
  shop('SELECT city FROM customers EXCEPT SELECT city FROM customers WHERE city IS NULL'),
  shop('SELECT id FROM customers WHERE id <= 3 UNION SELECT id FROM customers WHERE id = 5 EXCEPT SELECT id FROM customers WHERE id = 2'),
  shop('SELECT id FROM customers UNION ALL SELECT id FROM products INTERSECT SELECT id FROM orders'),
  shop('SELECT 1 UNION SELECT 1.0 UNION SELECT 2'),
  shop("SELECT price FROM products WHERE price > 40 UNION SELECT 42"),
  school('SELECT student_id FROM enrollments UNION SELECT id FROM students ORDER BY 1 LIMIT 3 OFFSET 2', true),
  school('SELECT title FROM courses EXCEPT SELECT c.title FROM courses c JOIN enrollments e ON e.course_id = c.id'),
  company('SELECT name FROM employees WHERE salary > 5000 UNION SELECT name FROM departments ORDER BY name', true),
  // CTEs
  company('WITH big AS (SELECT name, salary FROM employees WHERE salary > 6000) SELECT name FROM big ORDER BY salary DESC', true),
  company('WITH eng AS (SELECT * FROM employees WHERE department_id = 2), rich AS (SELECT name FROM eng WHERE salary > 5000) SELECT * FROM rich'),
  company('WITH d AS (SELECT department_id, AVG(salary) AS avg_salary FROM employees GROUP BY department_id) SELECT a.department_id, b.department_id FROM d a JOIN d b ON a.avg_salary < b.avg_salary'),
  company('WITH t (who, pay) AS (SELECT name, salary FROM employees) SELECT who, pay * 2 FROM t WHERE pay > 5000'),
  company('WITH employees AS (SELECT 1 AS n) SELECT * FROM employees'),
  company('WITH top AS (SELECT MAX(salary) AS s FROM employees) SELECT name FROM employees WHERE salary = (SELECT s FROM top)'),
  company('WITH dept_pay AS (SELECT department_id, AVG(salary) AS avg_salary FROM employees GROUP BY department_id) SELECT e.name, e.salary, d.avg_salary FROM employees e JOIN dept_pay d ON d.department_id = e.department_id WHERE e.salary > d.avg_salary'),
  company('WITH pay AS (SELECT department_id, SUM(salary) AS total FROM employees GROUP BY department_id) SELECT d.name, p.total FROM departments d LEFT JOIN pay p ON p.department_id = d.id'),
  company('WITH a AS (SELECT id FROM employees WHERE salary > 5000), b AS (SELECT id FROM employees WHERE department_id = 2) SELECT * FROM a INTERSECT SELECT * FROM b'),
  company('WITH x AS (SELECT name FROM employees UNION SELECT name FROM departments) SELECT COUNT(*) FROM x'),
  company('WITH avg_all AS (SELECT AVG(salary) AS a FROM employees) SELECT name FROM employees, avg_all WHERE salary > a'.replace(', avg_all WHERE', ' JOIN avg_all ON 1 = 1 WHERE')),
  shop("WITH busy AS (SELECT customer_id, COUNT(*) AS n FROM orders GROUP BY customer_id HAVING COUNT(*) > 1) SELECT c.name, b.n FROM customers c JOIN busy b ON b.customer_id = c.id"),
  school('WITH graded AS (SELECT * FROM enrollments WHERE grade IS NOT NULL) SELECT student_id, AVG(grade) FROM graded GROUP BY student_id'),
  company('WITH x AS (SELECT 7 / 2 AS i, 7.0 / 2 AS r) SELECT i, r, i * 2, r * 2 FROM x'),
];
