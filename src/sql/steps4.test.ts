import { describe, expect, it } from 'vitest';
import type { Step, TableView } from '../types/visualization';
import { datasets, type Dataset } from './datasets';
import { scriptSteps } from './scriptSteps';

function steps(sql: string, db: Dataset = datasets.company): Step[] {
  const result = scriptSteps(db, sql);
  if (!result.ok) throw new Error(result.error.message);
  const lines = sql.split('\n').length;
  for (const step of result.steps) {
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
  expect(result.steps.length).toBeLessThanOrEqual(400);
  return result.steps;
}

const titles = (s: Step[]) => s.map((step) => step.title);
const find = (s: Step[], title: string) => {
  const step = s.find((x) => x.title === title);
  if (!step) throw new Error(`no step "${title}" in:\n${titles(s).join('\n')}`);
  return step;
};

describe('index steps', () => {
  const sql = 'CREATE INDEX idx_salary ON employees(salary);\nSELECT name FROM employees\nWHERE salary > 5000';

  it('shows the index being built, then the search from the root to the rows', () => {
    const s = steps(sql);
    const order = [
      'CREATE INDEX idx_salary: a B-tree of 12 salary values',
      'FROM employees: 12 rows, read through idx_salary',
      'Search idx_salary for salary > 5000',
      'Level 2: follow the branch towards salary > 5000',
      'Level 3: follow the branch towards salary > 5000',
      'Scan the leaves: 6 matches',
      'Fetch 6 rows by rowid',
      'Examined 6 of 12 rows; a full scan reads 12.',
    ];
    const at = order.map((t) => titles(s).indexOf(t));
    expect(at.every((i) => i >= 0), titles(s).join('\n')).toBe(true);
    expect(at.toSorted((a, b) => a - b)).toEqual(at);
    // WHERE then checks only the 6 rows the index found.
    expect(titles(s).filter((t) => t.startsWith('Row ')).length).toBe(6);
  });

  it('draws the tree with the search path and the matches', () => {
    const s = steps(sql);
    const built = (find(s, 'CREATE INDEX idx_salary: a B-tree of 12 salary values').view as TableView).index!;
    expect(built.label).toBe('idx_salary on employees(salary)');
    expect(built.nodes.filter((n) => n.leaf).flatMap((n) => n.keys)).toHaveLength(12);
    const root = (find(s, 'Search idx_salary for salary > 5000').view as TableView).index!;
    expect(root.nodes.find((n) => n.id === root.root)!.role).toBe('active');
    const leaves = (find(s, 'Scan the leaves: 6 matches').view as TableView).index!;
    expect(leaves.nodes.reduce((n, node) => n + node.matched.length, 0)).toBe(6);
    const fetched = find(s, 'Fetch 6 rows by rowid').view as TableView;
    expect(fetched.tables[0]!.rows.filter((r) => r.role === 'found')).toHaveLength(6);
    // Labelled as the table read, not by what later clauses do to it.
    expect(fetched.tables[0]!.label).toBe('employees');
    expect((find(s, 'Search idx_salary for salary > 5000').view as TableView).tables[0]!.label).toBe('employees');
  });

  it('summarises a join’s searches as one step per outer row', () => {
    const s = steps("CREATE INDEX idx_dept ON employees(department_id);\nSELECT e.name FROM departments d JOIN employees e ON e.department_id = d.id");
    expect(titles(s).filter((t) => t.startsWith('e: search idx_dept'))).toEqual([
      'e: search idx_dept for department_id = 1 → 1 row',
      'e: search idx_dept for department_id = 2 → 6 rows',
      'e: search idx_dept for department_id = 3 → 4 rows',
      'e: search idx_dept for department_id = 4 → 0 rows',
    ]);
  });
});

describe('EXPLAIN QUERY PLAN steps', () => {
  it('walks through each line of the plan, then shows it', () => {
    const s = steps('CREATE INDEX idx_salary ON employees(salary);\nEXPLAIN QUERY PLAN\nSELECT name FROM employees WHERE salary > 5000 ORDER BY name');
    expect(titles(s)).toContain('Plan line 1: SEARCH employees USING INDEX idx_salary (salary>?)');
    expect(titles(s)).toContain('Plan line 2: USE TEMP B-TREE FOR ORDER BY');
    const step = find(s, 'Plan line 1: SEARCH employees USING INDEX idx_salary (salary>?)');
    expect(step.why).toContain('index');
  });
});

describe('view steps', () => {
  it('shows a view being stored and then read', () => {
    const s = steps('CREATE VIEW dept_pay AS SELECT department_id, SUM(salary) AS total FROM employees GROUP BY department_id;\nSELECT * FROM dept_pay');
    expect(titles(s)).toContain('CREATE VIEW dept_pay');
    const read = find(s, 'VIEW dept_pay: 4 rows');
    expect((read.view as TableView).tables[0]!.rows).toHaveLength(4);
  });
});

describe('transaction steps', () => {
  const debit = 'UPDATE accounts SET balance = balance - 100 WHERE id = 1';
  const credit = 'UPDATE accounts SET balance = balance + 100 WHERE id = 2';
  const bank = datasets.bank;

  it('marks changes as pending until COMMIT keeps them', () => {
    const s = steps(`BEGIN;\n${debit};\n${credit};\nCOMMIT`, bank);
    for (const t of ['BEGIN: changes are now pending', 'Pending: 1 change since BEGIN, not saved until COMMIT', 'Pending: 2 changes since BEGIN, not saved until COMMIT', 'COMMIT: 2 changes kept']) {
      expect(titles(s)).toContain(t);
    }
    const pending = find(s, 'Pending: 2 changes since BEGIN, not saved until COMMIT').view as TableView;
    expect(pending.tables[0]!.rows.filter((r) => r.note === 'pending' && r.role === 'frontier')).toHaveLength(2);
  });

  it('shows ROLLBACK, savepoints and the end of the script undoing changes', () => {
    expect(titles(steps(`BEGIN;\n${debit};\n${credit};\nROLLBACK`, bank))).toContain('ROLLBACK: 2 changes undone');
    const saved = titles(steps(`BEGIN;\n${debit};\nSAVEPOINT half;\n${credit};\nROLLBACK TO half;\nCOMMIT`, bank));
    expect(saved).toContain('SAVEPOINT half: a point to roll back to');
    expect(saved).toContain('ROLLBACK TO half: 1 change undone');
    expect(saved).toContain('COMMIT: 1 change kept');
    expect(titles(steps(`BEGIN;\n${debit}`, bank))).toContain('The script ended inside a transaction, so its changes are undone.');
  });

  it('explains that a failure inside a transaction undoes only that statement', () => {
    const s = steps(`BEGIN;\n${debit};\nUPDATE accounts SET balance = -1 WHERE id = 2;\nCOMMIT`, bank);
    expect(find(s, 'The statement is undone').why).toContain('the transaction is still open');
    expect(titles(s)).toContain('COMMIT: 1 change kept');
    const error = steps(`BEGIN;\nBEGIN;\nCOMMIT`, bank);
    expect(titles(error)).toContain('Error: A transaction is already open.');
  });
});

describe('two-session steps', () => {
  const script = (level: string) => `A: SET TRANSACTION ISOLATION LEVEL ${level};
A: BEGIN;
A: SELECT balance FROM accounts WHERE id = 1;
B: UPDATE accounts SET balance = 400 WHERE id = 1;
A: SELECT balance FROM accounts WHERE id = 1;
A: COMMIT`;

  it('steps through each session’s statements with what each one sees', () => {
    const s = steps(script('READ COMMITTED'), datasets.bank);
    expect(s[0]!.title).toBe('Two sessions, A and B');
    expect(s[0]!.view.kind).toBe('sessions');
    expect(titles(s)).toContain('A: SELECT balance FROM accounts WHERE id = 1 → 500');
    expect(titles(s)).toContain('B: UPDATE accounts SET balance = 400 WHERE id = 1');
    expect(titles(s)).toContain('A: SELECT balance FROM accounts WHERE id = 1 → 400 — non-repeatable read');
    const view = find(s, 'B: UPDATE accounts SET balance = 400 WHERE id = 1').view;
    if (view.kind !== 'sessions') throw new Error('sessions view expected');
    expect(view.rows.map((r) => r.status)).toEqual(['ran', 'ran', 'ran', 'ran', 'next', 'next']);
    expect(view.rows[3]!.active).toBe(true);
    expect(view.tables.map((t) => t.label)).toEqual(['A sees accounts', 'B sees accounts']);
  });

  it('shows a statement waiting for a lock and going on later', () => {
    const t = titles(steps(script('REPEATABLE READ'), datasets.bank));
    expect(t).toContain('B waits: UPDATE accounts SET balance = 400 WHERE id = 1 needs a lock A holds');
    expect(t).toContain('B goes on: UPDATE accounts SET balance = 400 WHERE id = 1');
    expect(t.indexOf('B goes on: UPDATE accounts SET balance = 400 WHERE id = 1')).toBeGreaterThan(t.indexOf('A: COMMIT'));
  });
});

describe('search conditions', () => {
  it('quote text values', () => {
    expect(titles(steps("CREATE INDEX idx_name ON employees(name);\nSELECT * FROM employees WHERE name = 'Khoa'"))).toContain("Search idx_name for name = 'Khoa'");
  });
});
