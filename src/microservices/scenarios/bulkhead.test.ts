import { describe, expect, it } from 'vitest';
import type { ServicesView } from '../../types/visualization';
import { simulate } from '../sim';
import { bulkheadScenario, bulkheadSteps } from './bulkhead';

const values = (pools: string, recs: string, requests = '10') => ({ pools, recs, requests });
const run = (v: Record<string, string>) => {
  const read = bulkheadScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests;
};
const checkouts = (rs: ReturnType<typeof run>) => rs.filter((r) => r.label === 'POST /checkout');
const recs = (rs: ReturnType<typeof run>) => rs.filter((r) => r.label === 'GET /recs');
const apiBadges = (v: Record<string, string>) => bulkheadSteps(v).map((s) => (s.view as ServicesView).nodes.find((n) => n.id === 'api')!.badge);

describe('Bulkhead', () => {
  it('lets slow recommendations use up a shared pool, so checkouts fail too', () => {
    expect(checkouts(run(values('shared', 'slow'))).some((r) => r.reason === 'bulkhead full')).toBe(true);
  });

  it('keeps checkout working with separate pools', () => {
    const requests = run(values('separate', 'slow'));
    expect(checkouts(requests).every((r) => r.status === 'ok')).toBe(true);
    expect(recs(requests).some((r) => r.reason === 'bulkhead full')).toBe(true);
  });

  it('fails nothing at normal speed', () => {
    for (const pools of ['shared', 'separate']) expect(run(values(pools, 'normal')).every((r) => r.status === 'ok')).toBe(true);
  });

  it('shows the pools on api', () => {
    expect(apiBadges(values('shared', 'slow'))).toContain('pool 4/4');
    expect(apiBadges(values('separate', 'slow'))).toContain('recs 2/2, checkout 0/2');
  });

  it('refuses a single request', () => {
    expect(bulkheadSteps(values('shared', 'slow', '1'))[0]!.why).toBe('Requests must be a whole number from 2 to 12.');
  });
});
