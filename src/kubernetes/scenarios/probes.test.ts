import { describe, expect, it } from 'vitest';
import type { SimResult } from '../model';
import { simulate } from '../sim';
import { probesScenario, probesSteps } from './probes';

const none = { liveness: 'off', readiness: 'off', startup: 'off', slowStart: 'off', hang: 'on' };
const run = (values: Partial<typeof none>) => {
  const read = probesScenario({ ...none, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const after = (r: SimResult, t: number) => r.final!.requests.filter((q) => Number(q.id.slice(1)) * 2 + 8 > t);
const restarts = (r: SimResult) => r.final!.pods.reduce((s, p) => s + p.restarts, 0);

describe('Probes', () => {
  it('keeps sending traffic to hung pods when nothing probes them', () => {
    const r = run({});
    expect(after(r, 42).every((q) => q.status === 'failed' && q.reason!.includes("doesn't answer"))).toBe(true);
    expect(restarts(r)).toBe(0);
  });

  it('restarts hung pods with a liveness probe, and traffic recovers', () => {
    const r = run({ liveness: 'on' });
    expect(restarts(r)).toBe(2);
    expect(r.final!.pods.every((p) => p.lastTermination === 'Liveness')).toBe(true);
    expect(r.final!.requests.at(-1)!.status).toBe('ok');
  });

  it('kills a slow starter over and over with liveness alone', () => {
    const r = run({ liveness: 'on', slowStart: 'on', hang: 'off' });
    expect(restarts(r)).toBeGreaterThanOrEqual(4);
    expect(r.final!.requests.filter((q) => q.status === 'ok')).toEqual([]);
  });

  it('lets a slow starter finish when a startup probe guards it', () => {
    const r = run({ liveness: 'on', startup: 'on', slowStart: 'on', hang: 'off' });
    expect(restarts(r)).toBe(0);
    expect(after(r, 30).every((q) => q.status === 'ok')).toBe(true);
  });

  it('keeps unready pods out of traffic with a readiness probe', () => {
    const r = run({ readiness: 'on', slowStart: 'on', hang: 'off' });
    // Before the app answers, the Service has no endpoints instead of a pod that times out.
    expect(r.final!.requests.filter((q) => q.status === 'failed').every((q) => q.reason!.startsWith('no endpoints'))).toBe(true);
  });

  it('refuses out-of-range values', () => {
    const steps = probesSteps({ ...none, startup: 'maybe' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.title).toBe("Can't run these probes");
  });
});
