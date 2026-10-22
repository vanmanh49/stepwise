import { describe, expect, it } from 'vitest';
import { finalRecords } from '../records.testutil';
import { simulate } from '../sim';
import { sagaScenario, sagaSteps } from './saga';

const values = (saga: string, fails: string, orders = '3') => ({ saga, fails, orders });
const run = (v: Record<string, string>) => {
  const read = sagaScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const compensated = (v: Record<string, string>) => run(v).trace.flatMap((e) => (e.kind === 'compensate' ? [e.target] : []));

describe('Saga', () => {
  it('confirms and charges every order when all is in stock', () => {
    const result = run(values('off', 'none'));
    expect(result.requests.every((r) => r.status === 'ok')).toBe(true);
    expect(finalRecords(result, 'orders-db')).toEqual({ 'order #1': 'confirmed', 'order #2': 'confirmed', 'order #3': 'confirmed' });
    expect(finalRecords(result, 'payments-db')).toEqual({ 'charge #1': 'charged', 'charge #2': 'charged', 'charge #3': 'charged' });
  });

  it('leaves order #2 pending and charged without a saga', () => {
    const result = run(values('off', 'inventory'));
    expect(result.requests[1]).toMatchObject({ status: 'failed', reason: 'out of stock' });
    expect(finalRecords(result, 'orders-db')['order #2']).toBe('pending');
    expect(finalRecords(result, 'payments-db')['charge #2']).toBe('charged');
    expect(sagaSteps(values('off', 'inventory')).at(-1)!.variables).toMatchObject({ 'inconsistent orders': 1 });
  });

  it('refunds and cancels, newest step first, with a saga', () => {
    const v = values('on', 'inventory');
    expect(compensated(v)).toEqual(['payments', 'orders-db']);
    const result = run(v);
    expect(finalRecords(result, 'orders-db')['order #2']).toBe('cancelled');
    expect(finalRecords(result, 'payments-db')['charge #2']).toBe('refunded');
    expect(sagaSteps(v).at(-1)!.variables).toMatchObject({ 'inconsistent orders': 0 });
  });

  it('only cancels the order when the card is declined', () => {
    const v = values('on', 'payment');
    expect(compensated(v)).toEqual(['orders-db']);
    const result = run(v);
    expect(result.requests[1]).toMatchObject({ status: 'failed', reason: 'card declined' });
    expect(finalRecords(result, 'payments-db')).not.toHaveProperty(['charge #2']);
  });

  it('narrates the undo steps', () => {
    const titles = sagaSteps(values('on', 'inventory')).map((s) => s.title);
    expect(titles).toContain('orders undoes payments for #2: /refund');
    expect(titles).toContain('orders undoes orders-db for #2');
  });

  it('refuses 0 orders', () => {
    expect(sagaSteps(values('on', 'none', '0'))[0]!.why).toBe('Orders must be a whole number from 1 to 4.');
  });
});
