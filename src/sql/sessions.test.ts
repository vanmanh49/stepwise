import { describe, expect, it } from 'vitest';
import type { IsolationLevel } from './ast';
import { checkExercise } from './check';
import { datasets, findTable } from './datasets';
import { runScript, type ScriptResult } from './script';
import type { SessionEvent } from './sessions';
import type { WriteEvent } from './write';

const bank = datasets.bank;

function run(sql: string) {
  const events: WriteEvent[] = [];
  const result = runScript(bank, sql, (e) => events.push(e));
  const sessionEvents = events.filter((e): e is SessionEvent => e.kind === 'session');
  return { result, events: sessionEvents };
}

/** "index status anomaly" per event, e.g. "4 ran dirty read". */
const trail = (events: SessionEvent[]) => events.map((e) => [e.index, e.status, e.anomaly].filter((x) => x !== undefined).join(' '));
const anomalies = (events: SessionEvent[]) => events.flatMap((e) => (e.anomaly ? [e.anomaly] : []));
const rowsOf = (events: SessionEvent[], index: number) => events.filter((e) => e.index === index && e.result).at(-1)?.result?.rows;
const balance = (result: ScriptResult, id: number) => findTable(result.db, 'accounts')!.rows.find((r) => r[0] === id)![2];

const LEVELS: IsolationLevel[] = ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'];

const dirtyRead = (level: IsolationLevel) => `B: BEGIN;
B: UPDATE accounts SET balance = 0 WHERE id = 1;
A: SET TRANSACTION ISOLATION LEVEL ${level};
A: BEGIN;
A: SELECT balance FROM accounts WHERE id = 1;
B: ROLLBACK;
A: COMMIT`;

const nonRepeatable = (level: IsolationLevel) => `A: SET TRANSACTION ISOLATION LEVEL ${level};
A: BEGIN;
A: SELECT balance FROM accounts WHERE id = 1;
B: UPDATE accounts SET balance = 400 WHERE id = 1;
A: SELECT balance FROM accounts WHERE id = 1;
A: COMMIT`;

const phantom = (level: IsolationLevel) => `A: SET TRANSACTION ISOLATION LEVEL ${level};
A: BEGIN;
A: SELECT owner FROM accounts WHERE balance > 100;
B: INSERT INTO accounts (owner, balance) VALUES ('Em', 700);
A: SELECT owner FROM accounts WHERE balance > 100;
A: COMMIT`;

const lostUpdate = (level: IsolationLevel) => `A: SET TRANSACTION ISOLATION LEVEL ${level};
B: SET TRANSACTION ISOLATION LEVEL ${level};
A: BEGIN;
B: BEGIN;
A: SELECT balance FROM accounts WHERE id = 1;
B: SELECT balance FROM accounts WHERE id = 1;
A: UPDATE accounts SET balance = 600 WHERE id = 1;
A: COMMIT;
B: UPDATE accounts SET balance = 450 WHERE id = 1;
B: COMMIT`;

describe('dirty read', () => {
  it('happens under READ UNCOMMITTED', () => {
    const { result, events } = run(dirtyRead('READ UNCOMMITTED'));
    expect(result.ok).toBe(true);
    expect(rowsOf(events, 4)).toEqual([[0]]);
    expect(anomalies(events)).toEqual(['dirty read']);
  });

  it.each(LEVELS.slice(1))('makes the reader wait under %s', (level) => {
    const { events } = run(dirtyRead(level));
    expect(trail(events)).toEqual(['0 ran', '1 ran', '2 ran', '3 ran', '4 waiting', '5 ran', '4 resumed', '6 ran']);
    expect(rowsOf(events, 4)).toEqual([[500]]);
    expect(anomalies(events)).toEqual([]);
  });
});

describe('non-repeatable read', () => {
  it.each(LEVELS.slice(0, 2))('happens under %s', (level) => {
    const { events } = run(nonRepeatable(level));
    expect(rowsOf(events, 4)).toEqual([[400]]);
    expect(anomalies(events)).toEqual(['non-repeatable read']);
  });

  it.each(LEVELS.slice(2))('makes the writer wait under %s', (level) => {
    const { result, events } = run(nonRepeatable(level));
    expect(trail(events)).toEqual(['0 ran', '1 ran', '2 ran', '3 waiting', '4 ran', '5 ran', '3 resumed']);
    expect(rowsOf(events, 4)).toEqual([[500]]);
    expect(balance(result, 1)).toBe(400);
  });
});

describe('phantom', () => {
  it.each(LEVELS.slice(0, 3))('happens under %s', (level) => {
    const { events } = run(phantom(level));
    expect(rowsOf(events, 4)).toHaveLength(4);
    expect(anomalies(events)).toEqual(['phantom']);
  });

  it('makes the inserter wait under SERIALIZABLE', () => {
    const { events } = run(phantom('SERIALIZABLE'));
    expect(trail(events)).toEqual(['0 ran', '1 ran', '2 ran', '3 waiting', '4 ran', '5 ran', '3 resumed']);
    expect(rowsOf(events, 4)).toHaveLength(3);
  });
});

describe('lost update', () => {
  it.each(LEVELS.slice(0, 2))('happens under %s', (level) => {
    const { result, events } = run(lostUpdate(level));
    expect(anomalies(events)).toEqual(['lost update']);
    expect(balance(result, 1)).toBe(450);
  });

  it.each(LEVELS.slice(2))('ends in a deadlock under %s, rolling B back', (level) => {
    const { result, events } = run(lostUpdate(level));
    expect(trail(events)).toEqual(['0 ran', '1 ran', '2 ran', '3 ran', '4 ran', '5 ran', '6 waiting', '8 error', '6 resumed', '7 ran', '9 skipped']);
    expect(events.find((e) => e.status === 'error')!.message).toBe('Deadlock: B was rolled back so A can continue.');
    expect(balance(result, 1)).toBe(600);
  });
});

describe('sessions scripts', () => {
  it('runs statements outside BEGIN as their own transactions', () => {
    const { result, events } = run('A: UPDATE accounts SET balance = 1 WHERE id = 1;\nB: SELECT balance FROM accounts WHERE id = 1');
    expect(rowsOf(events, 1)).toEqual([[1]]);
    expect(balance(result, 1)).toBe(1);
  });

  it('undoes only a statement that breaks a rule', () => {
    const { result, events } = run('A: BEGIN;\nA: UPDATE accounts SET balance = 1 WHERE id = 1;\nA: UPDATE accounts SET balance = -1 WHERE id = 2;\nA: COMMIT');
    expect(events[2]!.status).toBe('error');
    expect(events[2]!.message).toContain('CHECK');
    expect([balance(result, 1), balance(result, 2)]).toEqual([1, 300]);
  });

  it('marks statements still waiting at the end and rolls back open transactions', () => {
    const { result, events } = run('A: BEGIN;\nA: UPDATE accounts SET balance = 1 WHERE id = 1;\nB: UPDATE accounts SET balance = 2 WHERE id = 1;\nB: SELECT 1');
    expect(trail(events)).toEqual(['0 ran', '1 ran', '2 waiting', '2 still waiting', '3 still waiting']);
    expect(balance(result, 1)).toBe(500);
  });

  it('shows what each session sees', () => {
    const { events } = run('A: BEGIN;\nA: UPDATE accounts SET balance = 1 WHERE id = 1');
    const seen = events.at(-1)!.seenBy;
    expect(seen.A[0]!.rows[0]!.values[2]).toBe(1);
    expect(seen.B[0]!.rows[0]!.values[2]).toBe(500);
  });

  it('refuses other statements, more than 40 statements and SET inside a transaction', () => {
    const fail = (sql: string) => {
      const { result } = run(sql);
      if (result.ok) throw new Error('expected a failure');
      return result.error.message;
    };
    expect(fail('A: CREATE TABLE t (x INTEGER);\nB: SELECT 1')).toBe('Only SELECT, INSERT, UPDATE, DELETE and transaction statements can run in a session.');
    expect(fail(Array.from({ length: 41 }, (_, i) => `${i % 2 ? 'B' : 'A'}: SELECT 1`).join(';\n'))).toBe('Two-session scripts are limited to 40 statements.');
    const { events } = run('A: BEGIN;\nA: SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\nA: COMMIT');
    expect(events[1]!.message).toBe('Set the isolation level before BEGIN.');
  });

  it('checks an exercise by the last SELECT that ran', () => {
    const exercise = { solution: nonRepeatable('REPEATABLE READ'), orderMatters: false };
    expect(checkExercise(bank, nonRepeatable('SERIALIZABLE'), exercise)).toEqual({ status: 'correct' });
    expect(checkExercise(bank, nonRepeatable('READ COMMITTED'), exercise).status).toBe('rows');
  });
});
