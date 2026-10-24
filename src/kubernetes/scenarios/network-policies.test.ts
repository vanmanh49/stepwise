import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { networkPoliciesScenario, networkPoliciesSteps } from './network-policies';

const base = { policies: 'none', egress: 'off', dns: 'off' };
/** Each kind of request's outcomes: ok, or the reason it failed. */
const outcomes = (values: Partial<typeof base>) => {
  const read = networkPoliciesScenario({ ...base, ...values });
  if (!read.ok) throw new Error(read.why);
  const seen: Record<string, Set<string>> = {};
  for (const r of simulate(read.value).final!.requests) (seen[`${r.from} → ${r.service}`] ??= new Set()).add(r.status === 'ok' ? 'ok' : r.reason!);
  return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v].join(' / ')]));
};
const TIMEOUT = 'connection timed out';

describe('Network Policies', () => {
  it('lets all traffic through with no policies', () => {
    expect(outcomes({})).toEqual({ 'frontend → api': 'ok', 'debug → api': 'ok', 'api → db': 'ok' });
  });

  it('blocks everything with a default deny', () => {
    expect(outcomes({ policies: 'default deny' })).toEqual({ 'frontend → api': TIMEOUT, 'debug → api': TIMEOUT, 'api → db': TIMEOUT });
  });

  it('lets only frontend reach api once that is allowed', () => {
    expect(outcomes({ policies: 'deny + allow frontend→api' })).toEqual({ 'frontend → api': 'ok', 'debug → api': TIMEOUT, 'api → db': TIMEOUT });
  });

  it('opens api to db as well with the second rule', () => {
    expect(outcomes({ policies: 'deny + allow frontend→api, api→db' })).toEqual({ 'frontend → api': 'ok', 'debug → api': TIMEOUT, 'api → db': 'ok' });
  });

  it('breaks frontend at DNS when its egress is locked down without a DNS rule', () => {
    expect(outcomes({ policies: 'deny + allow frontend→api, api→db', egress: 'on' })['frontend → api']).toBe('DNS lookup for api timed out');
  });

  it('works again once DNS is allowed', () => {
    expect(outcomes({ policies: 'deny + allow frontend→api, api→db', egress: 'on', dns: 'on' })['frontend → api']).toBe('ok');
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ policies: 'allow all' }, { egress: 'yes' }, { dns: 'udp' }]) {
      const steps = networkPoliciesSteps({ ...base, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't apply these policies");
    }
  });
});
