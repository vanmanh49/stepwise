import { describe, expect, it } from 'vitest';
import { datasets, findTable, type Dataset } from './datasets';
import { runScript, type ScriptResult } from './script';
import type { WriteEvent } from './write';

const bank = datasets.bank;

function run(sql: string, db: Dataset = bank): { result: ScriptResult; events: WriteEvent[] } {
  const events: WriteEvent[] = [];
  return { result: runScript(db, sql, (e) => events.push(e)), events };
}

function ok(sql: string, db?: Dataset) {
  const { result, events } = run(sql, db);
  if (!result.ok) throw new Error(result.error.message);
  return { result, events };
}

const error = (sql: string) => {
  const { result } = run(sql);
  if (result.ok) throw new Error(`expected a failure: ${sql}`);
  return result.error.message;
};

const balances = (result: ScriptResult) => findTable(result.db, 'accounts')!.rows.map((r) => r[2]);
const transactions = (events: WriteEvent[]) =>
  events.flatMap((e) => (e.kind === 'transaction' ? [[e.action, e.name, e.changes]] : []));

const transfer = 'UPDATE accounts SET balance = balance - 100 WHERE id = 1;\nUPDATE accounts SET balance = balance + 100 WHERE id = 2';

describe('BEGIN, COMMIT and ROLLBACK', () => {
  it('keeps the changes of a committed transaction', () => {
    const { result, events } = ok(`BEGIN;\n${transfer};\nCOMMIT`);
    expect(balances(result)).toEqual([400, 400, 0, 1200]);
    expect(transactions(events)).toEqual([
      ['begin', undefined, 0],
      ['commit', undefined, 2],
    ]);
  });

  it('undoes everything since BEGIN on ROLLBACK, including new tables, indexes and views', () => {
    const { result, events } = ok(`BEGIN;\n${transfer};\nCREATE TABLE t (x INTEGER);\nCREATE INDEX i ON t(x);\nCREATE VIEW v AS SELECT * FROM t;\nROLLBACK`);
    expect(balances(result)).toEqual([500, 300, 0, 1200]);
    expect(findTable(result.db, 't')).toBeUndefined();
    expect(result.db.indexes ?? []).toEqual([]);
    expect(result.db.views ?? []).toEqual([]);
    expect(transactions(events).at(-1)).toEqual(['rollback', undefined, 2]);
  });

  it('accepts END as COMMIT and reports misplaced statements', () => {
    expect(balances(ok(`BEGIN TRANSACTION;\n${transfer};\nEND`).result)).toEqual([400, 400, 0, 1200]);
    expect(error('COMMIT')).toBe('There is no open transaction to commit.');
    expect(error('ROLLBACK')).toBe('There is no open transaction to roll back.');
  });

  it('keeps the transaction open when BEGIN is repeated inside it', () => {
    const { result } = run(`BEGIN;\n${transfer};\nBEGIN;\nCOMMIT`);
    expect(result.ok).toBe(true);
    expect(result.statements[3]!.error?.message).toBe('A transaction is already open.');
    expect(balances(result)).toEqual([400, 400, 0, 1200]);
  });
});

describe('a failure inside a transaction', () => {
  it('undoes only the failing statement; the transaction and the script go on', () => {
    const { result } = ok('BEGIN;\nUPDATE accounts SET balance = balance + 50 WHERE id = 3;\nUPDATE accounts SET balance = balance - 999 WHERE id = 2;\nCOMMIT');
    expect(result.statements.map((s) => s.error?.message ?? 'ok')).toEqual(['ok', 'ok', expect.stringContaining('CHECK'), 'ok']);
    expect(balances(result)).toEqual([500, 300, 50, 1200]);
  });

  it('still stops the script outside a transaction', () => {
    const { result } = run('UPDATE accounts SET balance = -1 WHERE id = 1;\nUPDATE accounts SET balance = 0 WHERE id = 2');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failedIndex).toBe(0);
    expect(balances(result)).toEqual([500, 300, 0, 1200]);
  });
});

describe('savepoints', () => {
  it('rolls back to a savepoint and keeps the work before it', () => {
    const { result, events } = ok(`BEGIN;\n${transfer};\nSAVEPOINT half;\nUPDATE accounts SET balance = 0 WHERE id = 4;\nROLLBACK TO half;\nCOMMIT`);
    expect(balances(result)).toEqual([400, 400, 0, 1200]);
    expect(transactions(events)).toEqual([
      ['begin', undefined, 0],
      ['savepoint', 'half', 0],
      ['rollback-to', 'half', 1],
      ['commit', undefined, 2],
    ]);
  });

  it('nests savepoints and releases them', () => {
    const { result } = ok('BEGIN;\nSAVEPOINT a;\nUPDATE accounts SET balance = 1 WHERE id = 1;\nSAVEPOINT b;\nUPDATE accounts SET balance = 2 WHERE id = 2;\nRELEASE b;\nROLLBACK TO a;\nCOMMIT');
    expect(balances(result)).toEqual([500, 300, 0, 1200]);
  });

  it('starts a transaction with SAVEPOINT outside BEGIN; releasing it commits', () => {
    const { result, events } = ok('SAVEPOINT s;\nUPDATE accounts SET balance = 0 WHERE id = 1;\nRELEASE SAVEPOINT s');
    expect(balances(result)).toEqual([0, 300, 0, 1200]);
    expect(transactions(events).at(-1)).toEqual(['release', 's', 1]);
    expect(error('BEGIN;\nROLLBACK TO nowhere;\nCOMMIT;\nCOMMIT')).toBe('There is no open transaction to commit.');
    expect(ok('BEGIN;\nROLLBACK TO nowhere;\nCOMMIT').result.statements[1]!.error?.message).toBe('No savepoint called `nowhere`.');
  });
});

describe('the end of the script', () => {
  it('rolls back a transaction still open', () => {
    const { result, events } = ok(`BEGIN;\n${transfer}`);
    expect(balances(result)).toEqual([500, 300, 0, 1200]);
    expect(transactions(events).at(-1)).toEqual(['auto-rollback', undefined, 2]);
  });
});

describe('SET TRANSACTION', () => {
  it('only works in a two-session script', () => {
    expect(error('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')).toBe('SET TRANSACTION only works in a two-session script (A: … B: …).');
  });
});
