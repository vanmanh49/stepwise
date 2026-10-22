import { describe, expect, it } from 'vitest';
import type { TraceEvent } from '../model';
import { simulate } from '../sim';
import { idempotencyScenario, idempotencySteps } from './idempotency';

const values = (delivery: string, lost: string, keys: string) => ({ delivery, lost, keys, payments: '3' });
const run = (v: Record<string, string>) => {
  const read = idempotencyScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const charges = (trace: TraceEvent[], request?: string) =>
  trace.filter((e) => e.kind === 'arrive' && e.message.kind === 'query' && e.message.to === 'ledger' && (!request || e.message.request === request)).length;

describe('Idempotency & Delivery Guarantees', () => {
  it('fails #2 at most once, though the customer was charged', () => {
    const { requests, trace } = run(values('at-most-once', 'on', 'off'));
    expect(requests[1]).toMatchObject({ status: 'failed', reason: 'payments timed out after 60 ms' });
    expect(charges(trace, '#2')).toBe(1);
  });

  it('charges #2 twice at least once without a key', () => {
    const { requests, trace } = run(values('at-least-once', 'on', 'off'));
    expect(requests[1]).toMatchObject({ status: 'ok', attempts: 2 });
    expect(charges(trace, '#2')).toBe(2);
  });

  it('charges #2 once with an idempotency key', () => {
    const { requests, trace } = run(values('at-least-once', 'on', 'on'));
    expect(requests[1]!.status).toBe('ok');
    expect(charges(trace, '#2')).toBe(1);
    expect(trace.some((e) => e.kind === 'duplicate' && e.status === 'replayed')).toBe(true);
  });

  it('charges each payment once when nothing is lost', () => {
    expect(charges(run(values('at-least-once', 'off', 'off')).trace)).toBe(3);
  });

  it('counts charges as a step variable', () => {
    expect(idempotencySteps(values('at-least-once', 'on', 'off')).at(-1)!.variables).toMatchObject({ charges: 4 });
  });

  it('refuses 6 payments', () => {
    expect(idempotencySteps({ ...values('at-most-once', 'on', 'off'), payments: '6' })[0]!.why).toBe('Payments must be a whole number from 1 to 5.');
  });
});
