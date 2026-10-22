import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { timeoutsScenario, timeoutsSteps } from './timeouts';

const values = (inventory: number, apiTimeout: number, clientTimeout: number, requests = 2) => ({
  inventory: String(inventory),
  apiTimeout: String(apiTimeout),
  clientTimeout: String(clientTimeout),
  requests: String(requests),
});
const run = (v: Record<string, string>) => {
  const read = timeoutsScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};

describe('Timeouts', () => {
  it('waits the whole time without timeouts', () => {
    expect(run(values(600, 0, 0)).requests.map((r) => [r.status, r.ms])).toEqual([
      ['ok', 630],
      ['ok', 630],
    ]);
  });

  it('fails fast with an API timeout, and inventory answers too late', () => {
    const result = run(values(600, 200, 0));
    expect(result.requests[0]).toMatchObject({ status: 'failed', ms: 220, reason: 'inventory timed out after 200 ms' });
    expect(result.trace.find((e) => e.kind === 'late')).toMatchObject({ t: 625 });
  });

  it('fails a healthy service when the timeout is too short', () => {
    const result = run(values(20, 25, 0));
    expect(result.requests.every((r) => r.status === 'failed')).toBe(true);
    expect(result.trace.filter((e) => e.kind === 'handle' && e.node === 'inventory')).toHaveLength(2);
  });

  it('leaves the api waiting for nothing when the client gives up first', () => {
    const result = run(values(600, 400, 150));
    expect(result.requests[0]).toMatchObject({ status: 'failed', ms: 150 });
    const timeouts = result.trace.filter((e) => e.kind === 'timeout' && e.request === '#1');
    expect(timeouts.map((e) => [e.t, e.kind === 'timeout' && e.caller])).toEqual([
      [150, 'client'],
      [415, 'api-1'],
    ]);
    expect(result.trace.some((e) => e.kind === 'late' && e.message.from === 'api-1' && e.message.request === '#1')).toBe(true);
  });

  it('refuses an inventory time of 0', () => {
    expect(timeoutsSteps(values(0, 0, 0))[0]!.why).toBe('Inventory time must be a whole number from 10 to 1000.');
  });
});
