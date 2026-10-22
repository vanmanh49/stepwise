import { describe, expect, it } from 'vitest';
import { finalRecords } from '../records.testutil';
import { simulate } from '../sim';
import { transactionalOutboxScenario, transactionalOutboxSteps } from './transactional-outbox';

const values = (approach: string, fault: string, orders = '3') => ({ approach, fault, orders });
const run = (v: Record<string, string>) => {
  const read = transactionalOutboxScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const delivered = (v: Record<string, string>) => run(v).deliveries.flatMap((d) => (d.status === 'ok' ? [d.request] : []));

describe('Transactional Outbox', () => {
  it('saves #2 but never publishes it when orders crashes between the two writes', () => {
    const v = values('save-then-publish', 'crash');
    const result = run(v);
    expect(finalRecords(result, 'orders-db')).toHaveProperty(['order #2'], 'placed');
    expect(delivered(v)).toEqual(['#1', '#3']);
    expect(transactionalOutboxSteps(v).at(-1)!.variables).toMatchObject({ saved: 3, published: 2 });
  });

  it('publishes ghost orders when it publishes first and the db is down', () => {
    const v = values('publish-then-save', 'db-down');
    expect(delivered(v)).toEqual(['#1', '#2', '#3']);
    const saved = finalRecords(run(v), 'orders-db');
    expect(saved).not.toHaveProperty(['order #2']);
    expect(saved).not.toHaveProperty(['order #3']);
  });

  it('still publishes #2 through the outbox after the crash', () => {
    const v = values('outbox', 'crash');
    const result = run(v);
    expect(delivered(v)).toEqual(['#1', '#2', '#3']);
    expect(Object.keys(finalRecords(result, 'orders-db')).toSorted()).toEqual(['order #1', 'order #2', 'order #3']);
    expect(result.requests[1]).toMatchObject({ status: 'failed', reason: 'orders-1 crashed' });
  });

  it('saves and publishes every order with no fault, leaving the outbox empty', () => {
    const v = values('outbox', 'none');
    expect(delivered(v)).toEqual(['#1', '#2', '#3']);
    expect(Object.keys(finalRecords(run(v), 'orders-db')).some((k) => k.startsWith('outbox/'))).toBe(false);
    expect(transactionalOutboxSteps(v).at(-1)!.variables).toMatchObject({ saved: 3, published: 3 });
  });

  it('refuses 6 orders', () => {
    expect(transactionalOutboxSteps(values('outbox', 'none', '6'))[0]!.why).toBe('Orders must be a whole number from 1 to 5.');
  });
});
