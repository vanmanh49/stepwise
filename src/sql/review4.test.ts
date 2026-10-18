import { describe, expect, it } from 'vitest';
import { checkExercise } from './check';
import { datasets, findTable } from './datasets';
import { runScript } from './script';
import { scriptSteps } from './scriptSteps';

const bank = datasets.bank;
const accounts = (sql: string) => {
  const result = runScript(bank, sql);
  if (!result.ok) throw new Error(result.error.message);
  return findTable(result.db, 'accounts')!.rows;
};

describe('inserts in a sessions script', () => {
  it('keeps every row one session inserts across transactions', () => {
    const rows = accounts("A: INSERT INTO accounts (owner, balance) VALUES ('E', 1);\nA: INSERT INTO accounts (owner, balance) VALUES ('F', 2);\nB: SELECT 1");
    expect(rows.map((r) => [r[0], r[1]]).slice(-2)).toEqual([[5, 'E'], [6, 'F']]);
  });

  it('never lets both sessions commit the same INTEGER PRIMARY KEY', () => {
    const rows = accounts(
      "A: BEGIN;\nB: BEGIN;\nA: INSERT INTO accounts (owner, balance) VALUES ('E', 1);\nB: INSERT INTO accounts (owner, balance) VALUES ('F', 2);\nA: COMMIT;\nB: COMMIT",
    );
    const ids = rows.map((r) => r[0]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.map((r) => r[1])).toEqual(expect.arrayContaining(['E', 'F']));
  });
});

describe('a script that ends inside a transaction', () => {
  it('shows the rollback even when its last statement is a SELECT', () => {
    const result = scriptSteps(bank, 'BEGIN;\nDELETE FROM transfers;\nSELECT COUNT(*) FROM transfers;');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.steps.map((s) => s.title)).toContain('The script ended inside a transaction, so its changes are undone.');
  });
});

describe('exercise checks', () => {
  const readTwice = (level: string) =>
    `A: SET TRANSACTION ISOLATION LEVEL ${level};\nA: BEGIN;\nA: SELECT balance FROM accounts WHERE id = 1;\nB: UPDATE accounts SET balance = 400 WHERE id = 1;\nA: SELECT balance FROM accounts WHERE id = 1;\nA: COMMIT;`;
  const exercise = { solution: readTwice('REPEATABLE READ'), orderMatters: false };

  it('judge a two-session answer by everything it read and the data it left, not just its last SELECT', () => {
    expect(checkExercise(bank, readTwice('SERIALIZABLE'), exercise)).toEqual({ status: 'correct' });
    expect(checkExercise(bank, 'SELECT balance FROM accounts WHERE id = 1', exercise).status).not.toBe('correct');
    const withoutUpdate = readTwice('READ COMMITTED').replace('B: UPDATE accounts SET balance = 400 WHERE id = 1;\n', '');
    expect(checkExercise(bank, withoutUpdate, exercise).status).not.toBe('correct');
  });

  it('accept a covering index where a plain one was asked for, but not the other way round', () => {
    const company = datasets.company;
    const hired = { solution: 'CREATE INDEX idx_hired ON employees(hired);', orderMatters: false, probes: ["EXPLAIN QUERY PLAN SELECT name FROM employees WHERE hired > '2020-01-01'"] };
    expect(checkExercise(company, 'CREATE INDEX h ON employees(hired, name);', hired)).toEqual({ status: 'correct' });
    const covering = { solution: 'CREATE INDEX i ON employees(department_id, salary);', orderMatters: false, probes: ['EXPLAIN QUERY PLAN SELECT department_id, salary FROM employees WHERE department_id = 2'] };
    expect(checkExercise(company, 'CREATE INDEX i ON employees(department_id, salary, name);', covering)).toEqual({ status: 'correct' });
    expect(checkExercise(company, 'CREATE INDEX i ON employees(department_id);', covering).status).toBe('probe');
  });
});
