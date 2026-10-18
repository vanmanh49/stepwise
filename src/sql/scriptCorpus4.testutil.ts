import type { DatasetId } from './datasets';

/** A script as its statements, so SQLite can run them one by one and carry on after an error inside a transaction. */
export interface Script4 {
  db: DatasetId;
  statements: string[];
}

const bank = (...statements: string[]): Script4 => ({ db: 'bank', statements });
const company = (...statements: string[]): Script4 => ({ db: 'company', statements });
const school = (...statements: string[]): Script4 => ({ db: 'school', statements });

const debit = 'UPDATE accounts SET balance = balance - 100 WHERE id = 1';
const credit = 'UPDATE accounts SET balance = balance + 100 WHERE id = 2';
const balances = 'SELECT id, balance FROM accounts';

/** Phase 4 scripts: views, indexes and transactions; final tables, SELECT results and which statements failed must match SQLite. */
export const scriptCorpus4: Script4[] = [
  // Transactions.
  bank('BEGIN', debit, credit, 'COMMIT', balances),
  bank('BEGIN', debit, credit, 'ROLLBACK', balances),
  bank('BEGIN TRANSACTION', debit, 'END TRANSACTION', balances),
  bank('BEGIN', debit, 'UPDATE accounts SET balance = balance - 999 WHERE id = 2', credit, 'COMMIT', balances),
  bank('BEGIN', "INSERT INTO accounts (owner, balance) VALUES ('Em', -5)", "INSERT INTO accounts (owner, balance) VALUES ('Em', 5)", 'COMMIT', balances),
  bank('BEGIN', 'INSERT INTO transfers (from_id, to_id, amount) VALUES (9, 1, 10)', 'COMMIT', 'SELECT COUNT(*) FROM transfers'),
  bank('BEGIN', debit, 'BEGIN', credit, 'COMMIT', balances),
  bank('BEGIN', debit, 'SAVEPOINT s', credit, 'ROLLBACK TO s', 'COMMIT', balances),
  bank('BEGIN', 'SAVEPOINT a', debit, 'SAVEPOINT b', credit, 'RELEASE b', 'ROLLBACK TO a', 'COMMIT', balances),
  bank('BEGIN', 'SAVEPOINT a', debit, 'ROLLBACK TO SAVEPOINT a', 'ROLLBACK TO a', credit, 'COMMIT', balances),
  bank('SAVEPOINT s', debit, 'RELEASE SAVEPOINT s', balances),
  bank('SAVEPOINT s', debit, 'ROLLBACK TO s', 'RELEASE s', balances),
  bank('BEGIN', debit, 'ROLLBACK TO nowhere', 'COMMIT', balances),
  bank('BEGIN', 'DELETE FROM transfers', 'DELETE FROM accounts WHERE id = 3', 'ROLLBACK', 'SELECT COUNT(*) FROM accounts', 'SELECT COUNT(*) FROM transfers'),
  bank('BEGIN', 'CREATE TABLE audit (note TEXT)', "INSERT INTO audit VALUES ('x')", 'COMMIT', 'SELECT * FROM audit'),
  bank('BEGIN', 'CREATE TABLE audit (note TEXT)', "INSERT INTO audit VALUES ('x')", 'ROLLBACK', "SELECT COUNT(*) FROM accounts"),
  bank('BEGIN', 'UPDATE accounts SET balance = balance * 2', 'SELECT SUM(balance) FROM accounts', 'ROLLBACK', 'SELECT SUM(balance) FROM accounts'),
  // Views.
  company('CREATE VIEW dept_pay AS SELECT department_id, SUM(salary) AS total FROM employees GROUP BY department_id', 'SELECT * FROM dept_pay'),
  company('CREATE VIEW v (who, pay) AS SELECT name, salary FROM employees WHERE salary > 6000', 'SELECT who FROM v ORDER BY pay'),
  company('CREATE VIEW v AS SELECT name, department_id FROM employees', 'SELECT d.name, COUNT(*) FROM departments d JOIN v ON v.department_id = d.id GROUP BY d.name'),
  company('CREATE VIEW a AS SELECT id, salary FROM employees', 'CREATE VIEW b AS SELECT id FROM a WHERE salary > 5000', 'SELECT COUNT(*) FROM b'),
  company('CREATE VIEW v AS SELECT name FROM employees', "INSERT INTO employees (name, salary) VALUES ('Tam', 1000)", 'SELECT COUNT(*) FROM v'),
  company('CREATE VIEW v AS SELECT name FROM employees', 'DROP VIEW v', 'CREATE VIEW v AS SELECT id FROM departments', 'SELECT * FROM v'),
  company('BEGIN', 'CREATE VIEW v AS SELECT name FROM employees', 'ROLLBACK', 'CREATE VIEW v AS SELECT id FROM departments', 'SELECT * FROM v'),
  company('CREATE VIEW IF NOT EXISTS v AS SELECT 1 AS x', 'CREATE VIEW IF NOT EXISTS v AS SELECT 2 AS x', 'SELECT * FROM v'),
  company('DROP VIEW IF EXISTS missing', 'SELECT COUNT(*) FROM employees'),
  // Indexes: results don't change, writes keep working.
  company('CREATE INDEX idx_salary ON employees(salary)', 'SELECT name FROM employees WHERE salary > 5000'),
  company('CREATE INDEX idx_salary ON employees(salary)', 'UPDATE employees SET salary = 9999 WHERE id = 4', 'SELECT name FROM employees WHERE salary >= 9000'),
  company('CREATE INDEX i ON employees(department_id, salary)', "INSERT INTO employees (name, department_id, salary) VALUES ('Tam', 2, 6000)", 'SELECT name FROM employees WHERE department_id = 2 AND salary > 5000'),
  company('CREATE UNIQUE INDEX i ON employees(name)', "INSERT INTO employees (name, salary) VALUES ('Tam', 1)", 'SELECT COUNT(*) FROM employees'),
  company('BEGIN', 'CREATE UNIQUE INDEX i ON employees(name)', "INSERT INTO employees (name, salary) VALUES ('Lan', 1)", "UPDATE employees SET name = 'Lan' WHERE id = 2", "INSERT INTO employees (name, salary) VALUES ('Tam', 1)", 'COMMIT', 'SELECT COUNT(*) FROM employees'),
  company('CREATE INDEX i ON employees(salary)', 'DROP INDEX i', 'CREATE INDEX i ON employees(hired)', "SELECT name FROM employees WHERE hired > '2021-01-01'"),
  company('BEGIN', 'CREATE INDEX i ON employees(salary)', 'ROLLBACK', 'CREATE INDEX i ON employees(name)', "SELECT id FROM employees WHERE name = 'Bao'"),
  company('CREATE TABLE t (x INTEGER)', 'CREATE INDEX i ON t(x)', 'DROP TABLE t', 'CREATE TABLE t (y TEXT)', 'CREATE INDEX i ON t(y)', 'SELECT COUNT(*) FROM t'),
  company('CREATE INDEX i ON employees(department_id)', "SELECT e.name FROM departments d JOIN employees e ON e.department_id = d.id WHERE d.name = 'Sales'"),
  school('CREATE INDEX idx_year ON students(year)', 'SELECT name FROM students WHERE year IN (1, 3)'),
];
