// Test-only: queries the interpreter must answer exactly as SQLite does.
import type { DatasetId } from './datasets';

export interface CorpusQuery {
  db: DatasetId;
  sql: string;
  /** Compare row order too; only set when the ORDER BY keys have no ties. */
  ordered?: boolean;
}

const shop = (sql: string, ordered = false): CorpusQuery => ({ db: 'shop', sql, ordered });
const school = (sql: string, ordered = false): CorpusQuery => ({ db: 'school', sql, ordered });

export const corpus: CorpusQuery[] = [
  // projection and arithmetic
  shop('SELECT id, price * 2 FROM products'),
  shop('SELECT id, price / 2 FROM products'),
  shop('SELECT id, id / 2, id % 3 FROM orders'),
  shop('SELECT id, 1.0 * id / 4 FROM orders'),
  shop('SELECT id, -price FROM products'),
  shop('SELECT id, id / 0, id % 0 FROM orders'),
  shop('SELECT quantity * 10 + 1 FROM order_items'),
  shop('SELECT 7 / 2, 7.0 / 2, -7 / 2, 7 % -3 FROM customers WHERE id = 1'),
  shop('SELECT name, price - 0.5 AS cheaper FROM products'),
  school('SELECT name, year * 100 + id FROM students'),
  shop('SELECT price * quantity FROM order_items oi JOIN products p ON p.id = oi.product_id'),
  shop("SELECT 5.5 % 2, 2 + '3', '4' * 2 FROM customers WHERE id = 1"),

  // WHERE and NULL
  shop('SELECT name FROM customers WHERE city = NULL'),
  shop('SELECT name FROM customers WHERE city IS NULL'),
  shop('SELECT name FROM customers WHERE city IS NOT NULL'),
  shop("SELECT name FROM customers WHERE NOT (city = 'Hanoi')"),
  shop("SELECT name FROM customers WHERE city = 'Hanoi' OR city IS NULL"),
  shop("SELECT name FROM customers WHERE city <> 'Hanoi' AND id > 2"),
  shop("SELECT name FROM customers WHERE city = 'Hanoi' OR city = 'Hue'"),
  shop("SELECT name FROM customers WHERE NOT (city = 'Hanoi' AND id > 1)"),
  shop("SELECT name FROM customers WHERE (city = 'Hanoi') = 0"),
  shop('SELECT id FROM products WHERE price BETWEEN 10 AND 40'),
  shop('SELECT id FROM products WHERE price NOT BETWEEN 10 AND 40'),
  shop('SELECT id FROM orders WHERE customer_id IN (1, 3, 99)'),
  shop('SELECT id FROM orders WHERE customer_id NOT IN (1, 3)'),
  shop("SELECT name FROM customers WHERE city IN ('Hue', NULL)"),
  shop("SELECT name FROM customers WHERE city NOT IN ('Hue', NULL)"),
  school('SELECT student_id FROM enrollments WHERE grade > 80'),
  school('SELECT student_id FROM enrollments WHERE grade IS NULL OR grade < 60'),
  school('SELECT name FROM students WHERE email IS NULL AND year > 1'),
  shop("SELECT id FROM orders WHERE status = 'shipped' AND ordered_on >= '2024-03-01'"),
  shop('SELECT name FROM customers WHERE NULL'),
  shop('SELECT name FROM customers WHERE 1'),
  shop("SELECT id FROM orders WHERE id > 3 AND NOT status = 'pending'"),

  // LIKE
  shop("SELECT name FROM customers WHERE name LIKE 'a%'"),
  shop("SELECT name FROM customers WHERE name LIKE '%n%'"),
  shop("SELECT name FROM customers WHERE name LIKE '_n%'"),
  shop("SELECT name FROM products WHERE name NOT LIKE '%e%'"),
  shop("SELECT id FROM orders WHERE id LIKE '1%'"),
  shop("SELECT name FROM customers WHERE city LIKE 'h%'"),

  // affinity
  school("SELECT name FROM students WHERE year = '2'"),
  shop("SELECT id FROM products WHERE price > '20'"),
  shop('SELECT name FROM customers WHERE name = 5'),
  shop('SELECT name FROM customers WHERE name > 5'),
  shop("SELECT id FROM orders WHERE customer_id = '1'"),
  shop('SELECT id FROM orders WHERE ordered_on > 2024'),
  shop("SELECT id FROM products WHERE price IN ('42', 12)"),

  // ORDER BY and LIMIT
  shop('SELECT name FROM customers ORDER BY name', true),
  shop('SELECT name FROM customers ORDER BY name DESC', true),
  shop('SELECT name, city FROM customers ORDER BY city, name', true),
  shop('SELECT name, city FROM customers ORDER BY city DESC, name', true),
  shop('SELECT name, price FROM products ORDER BY price DESC, name', true),
  shop('SELECT name, price FROM products ORDER BY 2, 1', true),
  shop('SELECT name AS n FROM products ORDER BY n', true),
  shop('SELECT name FROM products ORDER BY price, id', true),
  shop('SELECT id FROM orders ORDER BY id LIMIT 3', true),
  shop('SELECT id FROM orders ORDER BY id LIMIT 3 OFFSET 4', true),
  shop('SELECT id FROM orders ORDER BY id LIMIT 5 OFFSET 20', true),
  shop('SELECT id FROM orders ORDER BY ordered_on DESC LIMIT 2 OFFSET 3', true),
  shop('SELECT id, customer_id FROM orders ORDER BY customer_id DESC, id', true),
  shop('SELECT id FROM orders LIMIT 0'),
  school('SELECT name, grade FROM enrollments e JOIN students s ON s.id = e.student_id ORDER BY grade, name, e.course_id', true),

  // DISTINCT
  shop('SELECT DISTINCT city FROM customers'),
  shop('SELECT DISTINCT status FROM orders'),
  shop('SELECT DISTINCT category, price FROM products'),
  shop('SELECT DISTINCT customer_id FROM orders ORDER BY customer_id', true),
  school('SELECT DISTINCT grade IS NULL FROM enrollments'),
  school('SELECT DISTINCT year FROM students ORDER BY year DESC', true),

  // aggregates
  shop('SELECT COUNT(*) FROM customers'),
  shop('SELECT COUNT(city), COUNT(DISTINCT city) FROM customers'),
  shop('SELECT SUM(price), AVG(price), MIN(price), MAX(price) FROM products'),
  shop('SELECT SUM(quantity), AVG(quantity) FROM order_items'),
  shop('SELECT COUNT(*), SUM(id), AVG(id), MIN(id), MAX(id) FROM orders WHERE id > 100'),
  shop('SELECT MIN(name), MAX(name) FROM customers'),
  shop('SELECT MIN(city), MAX(city) FROM customers'),
  shop('SELECT COUNT(DISTINCT customer_id) FROM orders'),
  shop('SELECT MAX(id) - MIN(id) FROM orders'),
  shop("SELECT SUM(price * 2) FROM products WHERE category = 'Books'"),
  school('SELECT AVG(grade), COUNT(grade), COUNT(*) FROM enrollments'),
  school('SELECT SUM(credits) / COUNT(*) FROM courses'),
  school('SELECT AVG(credits) FROM courses'),
  shop("SELECT COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.city = 'Hanoi'"),

  // GROUP BY and HAVING
  shop('SELECT city, COUNT(*) FROM customers GROUP BY city'),
  shop('SELECT category, COUNT(*), AVG(price) FROM products GROUP BY category'),
  shop('SELECT category FROM products GROUP BY category HAVING AVG(price) > 30'),
  shop('SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 1'),
  shop('SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY COUNT(*) DESC, status', true),
  shop('SELECT category, MAX(price) FROM products GROUP BY category ORDER BY MAX(price)', true),
  shop('SELECT category, COUNT(*) AS n FROM products GROUP BY category ORDER BY n DESC', true),
  shop("SELECT customer_id FROM orders GROUP BY customer_id HAVING MAX(ordered_on) > '2024-04-01'"),
  shop('SELECT COUNT(*) FROM orders HAVING COUNT(*) > 5'),
  shop('SELECT COUNT(*) FROM orders HAVING COUNT(*) > 50'),
  school('SELECT course_id, AVG(grade) FROM enrollments GROUP BY course_id'),
  school('SELECT year, COUNT(email) FROM students GROUP BY year ORDER BY year', true),
  school('SELECT grade, COUNT(*) FROM enrollments WHERE grade IS NULL GROUP BY grade'),
  shop('SELECT o.customer_id, SUM(oi.quantity) FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.customer_id'),
  shop('SELECT category, COUNT(*) FROM products WHERE price > 100 GROUP BY category'),

  // joins
  shop('SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id'),
  shop("SELECT o.id, c.name FROM orders o INNER JOIN customers c ON c.id = o.customer_id AND c.city = 'Hanoi'"),
  shop('SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id'),
  shop('SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL'),
  shop("SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'pending'"),
  shop("SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'pending'"),
  shop('SELECT p.name, oi.quantity FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = 1'),
  shop(
    'SELECT c.name, p.name FROM order_items oi JOIN orders o ON oi.order_id = o.id ' +
      'JOIN customers c ON o.customer_id = c.id JOIN products p ON oi.product_id = p.id',
  ),
  shop('SELECT p.name, oi.order_id FROM products p LEFT JOIN order_items oi ON oi.product_id = p.id'),
  shop('SELECT p.name, SUM(oi.quantity) FROM products p LEFT JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id, p.name'),
  shop('SELECT * FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.id < 3'),
  shop("SELECT c.*, o.status FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.status = 'cancelled'"),
  school('SELECT s.name, c.title FROM enrollments e JOIN students s ON s.id = e.student_id JOIN courses c ON c.id = e.course_id'),
  school('SELECT c.title, COUNT(e.student_id) FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id GROUP BY c.id, c.title'),
  school('SELECT s.name FROM students s LEFT JOIN enrollments e ON e.student_id = s.id WHERE e.course_id IS NULL'),
  shop('SELECT a.name, b.name FROM customers a JOIN customers b ON a.city = b.city AND a.id < b.id'),
  shop('SELECT c.name, o.id FROM customers c JOIN orders o ON o.customer_id = c.id ORDER BY o.id', true),

  // subqueries
  school('SELECT name FROM students WHERE id IN (SELECT student_id FROM enrollments WHERE course_id = 1)'),
  school('SELECT name FROM students WHERE id NOT IN (SELECT student_id FROM enrollments)'),
  school('SELECT title FROM courses WHERE credits > (SELECT AVG(credits) FROM courses)'),
  school('SELECT title FROM courses WHERE id NOT IN (SELECT course_id FROM enrollments)'),
  shop('SELECT name FROM customers c WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) > 1'),
  shop('SELECT name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) FROM customers c'),
  shop('SELECT name FROM products WHERE price = (SELECT MAX(price) FROM products)'),
  shop(
    'SELECT name FROM products WHERE id IN (SELECT product_id FROM order_items WHERE order_id IN ' +
      "(SELECT id FROM orders WHERE status = 'pending'))",
  ),
  shop('SELECT name FROM customers WHERE city NOT IN (SELECT city FROM customers WHERE id > 8)'),
  shop('SELECT name FROM customers WHERE city NOT IN (SELECT city FROM customers)'),
  shop('SELECT (SELECT name FROM customers WHERE id = o.customer_id) FROM orders o'),
  shop('SELECT name FROM products p WHERE price > (SELECT AVG(price) FROM products WHERE category = p.category)'),
  school('SELECT name FROM students s WHERE year = (SELECT MAX(year) FROM students)'),
];
