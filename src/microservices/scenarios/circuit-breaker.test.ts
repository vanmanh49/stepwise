import { describe, expect, it } from 'vitest';
import type { ServicesView } from '../../types/visualization';
import { simulate } from '../sim';
import { circuitBreakerScenario, circuitBreakerSteps } from './circuit-breaker';

const base = { breaker: 'off', threshold: '3', openMs: '150', recovers: '300', requests: '12' };
const run = (v: Record<string, string>) => {
  const read = circuitBreakerScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const pick = (ids: number[], requests: ReturnType<typeof run>['requests']) => ids.map((i) => requests[i - 1]!);

describe('Circuit Breaker', () => {
  it('makes every call during the outage wait out the timeout without a breaker', () => {
    const { requests } = run(base);
    for (const r of pick([2, 3, 4, 5, 6, 7], requests)) expect(r).toMatchObject({ status: 'failed', reason: 'payments timed out after 100 ms' });
    expect(pick([2, 3, 4, 5, 6, 7], requests).every((r) => r.ms >= 120)).toBe(true);
    expect(requests[7]!.status).toBe('ok');
  });

  it('opens after 3 timeouts, fails fast, then closes after a good trial', () => {
    const { requests, trace } = run({ ...base, breaker: 'on' });
    expect(pick([2, 3, 4], requests).every((r) => r.reason === 'payments timed out after 100 ms')).toBe(true);
    expect(trace.find((e) => e.kind === 'breaker' && e.state === 'open')).toMatchObject({ t: 235 });
    for (const r of pick([7, 8, 9, 10], requests)) expect(r).toMatchObject({ status: 'failed', reason: 'circuit open', ms: 20 });
    expect(trace.filter((e) => e.kind === 'arrive' && e.message.to === 'payments-1' && e.t > 235 && e.t < 385)).toEqual([]);
    expect(requests[10]!.status).toBe('ok');
    expect(trace.filter((e) => e.kind === 'breaker').at(-1)).toMatchObject({ state: 'closed' });
  });

  it('opens again when the trial fails because payments stays down', () => {
    const { requests, trace } = run({ ...base, breaker: 'on', recovers: '2000' });
    expect(requests[10]!.reason).toBe('payments timed out after 100 ms');
    const states = trace.flatMap((e) => (e.kind === 'breaker' && e.state !== 'closed' ? [e.state] : []));
    expect(states).toEqual(['open', 'half-open', 'open']);
    expect(requests[11]!.reason).toBe('circuit open');
  });

  it('shows the failure count on api', () => {
    const badges = circuitBreakerSteps({ ...base, breaker: 'on' }).map((s) => (s.view as ServicesView).nodes.find((n) => n.id === 'api')!.badge);
    expect(badges).toContain('breaker closed 2/3');
  });

  it('refuses a threshold of 0', () => {
    expect(circuitBreakerSteps({ ...base, threshold: '0' })[0]!.why).toBe('Threshold must be a whole number from 1 to 5.');
  });
});
