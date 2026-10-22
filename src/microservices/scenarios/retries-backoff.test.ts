import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { retriesBackoffScenario, retriesBackoffSteps, retryArrivals } from './retries-backoff';
import { busiest, callsTo } from './shared';

const values = (retries: number, backoff: string, jitter = 'off') => ({ retries: String(retries), backoff, jitter, outage: '200', requests: '6' });
const run = (v: Record<string, string>) => {
  const read = retriesBackoffScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};

describe('Retries with Backoff & Jitter', () => {
  it('fails every request without retries', () => {
    const result = run(values(0, 'none'));
    expect(result.requests.every((r) => r.status === 'failed')).toBe(true);
    expect(callsTo(result.trace, 'api')).toHaveLength(6);
  });

  it('hammers the service with immediate retries, all inside the outage', () => {
    const result = run(values(3, 'none'));
    const calls = callsTo(result.trace, 'api');
    expect(result.requests.every((r) => r.status === 'failed')).toBe(true);
    expect(calls).toHaveLength(24);
    expect(calls.every((t) => t < 200)).toBe(true);
  });

  it('still lands inside the outage with fixed backoff', () => {
    const result = run(values(3, 'fixed'));
    expect(result.requests.every((r) => r.status === 'failed')).toBe(true);
    expect(Math.max(...callsTo(result.trace, 'api'))).toBe(185);
  });

  it('waits out the outage with exponential backoff, all at the same moment', () => {
    const result = run(values(3, 'exponential'));
    expect(result.requests.map((r) => [r.status, r.ms])).toEqual(Array.from({ length: 6 }, () => ['ok', 400]));
    expect(busiest(retryArrivals(result.trace))).toBe(6);
  });

  it('spreads the retries with jitter, and repeats exactly', () => {
    const result = run(values(3, 'exponential', 'on'));
    expect(result.requests.every((r) => r.status === 'ok')).toBe(true);
    expect(busiest(retryArrivals(result.trace))).toBeLessThan(6);
    expect(retriesBackoffSteps(values(3, 'exponential', 'on'))).toEqual(retriesBackoffSteps(values(3, 'exponential', 'on')));
  });

  it('counts calls and the busiest 10 ms as step variables', () => {
    const last = retriesBackoffSteps(values(3, 'none')).at(-1)!;
    expect(last.variables).toMatchObject({ 'calls to api': 24, 'busiest 10 ms of retries': 6 });
  });

  it('refuses 5 retries', () => {
    expect(retriesBackoffSteps(values(5, 'none'))[0]!.why).toBe('Retries must be a whole number from 0 to 4.');
  });
});
