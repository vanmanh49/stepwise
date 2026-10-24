import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf, pod, serviceOf } from './fixtures.testutil';
import type { Action, NetworkPolicy, Selector } from './model';
import { checkTraffic } from './network';
import { simulate } from './sim';

const app = (name: string): Selector => [{ key: 'app', op: '=', values: [name] }];
const denyAll: NetworkPolicy = { kind: 'NetworkPolicy', name: 'default-deny', podSelector: [], policyTypes: ['Ingress'] };
const allowFrontend: NetworkPolicy = { kind: 'NetworkPolicy', name: 'api-from-frontend', podSelector: app('api'), policyTypes: ['Ingress'], ingress: [{ from: [app('frontend')] }] };
const allowDebug: NetworkPolicy = { kind: 'NetworkPolicy', name: 'api-from-debug', podSelector: app('api'), policyTypes: ['Ingress'], ingress: [{ from: [app('debug')] }] };
const egressDeny = (dns: boolean): NetworkPolicy => ({ kind: 'NetworkPolicy', name: 'frontend-egress', podSelector: app('frontend'), policyTypes: ['Egress'], egress: dns ? [{ to: [], dns: true }] : [] });

const frontend = pod('frontend-abc', { labels: { app: 'frontend' } });
const debug = pod('debug-abc', { labels: { app: 'debug' } });
const api = pod('api-abc', { labels: { app: 'api' } });

describe('checkTraffic', () => {
  it('allows everything when no policy selects either pod', () => {
    expect(checkTraffic([], frontend, api).ok).toBe(true);
  });

  it('blocks all ingress with a default deny', () => {
    expect(checkTraffic([denyAll], frontend, api)).toEqual({ ok: false, stage: 'ingress', policies: ['default-deny'] });
  });

  it('allows only the pods a rule names, and adds rules up across policies', () => {
    expect(checkTraffic([denyAll, allowFrontend], frontend, api).ok).toBe(true);
    expect(checkTraffic([denyAll, allowFrontend], debug, api).ok).toBe(false);
    expect(checkTraffic([denyAll, allowFrontend, allowDebug], debug, api).ok).toBe(true);
  });

  it('treats an empty from selector as every pod', () => {
    const anyone: NetworkPolicy = { ...allowFrontend, name: 'anyone', ingress: [{ from: [[]] }] };
    expect(checkTraffic([anyone], debug, api).ok).toBe(true);
  });

  it('fails at DNS when egress is isolated and no rule allows lookups', () => {
    expect(checkTraffic([egressDeny(false)], frontend, api)).toEqual({ ok: false, stage: 'dns', policies: ['frontend-egress'] });
    expect(checkTraffic([egressDeny(true)], frontend, api)).toEqual({ ok: false, stage: 'egress', policies: ['frontend-egress'] });
  });
});

describe('Requests between pods', () => {
  const run = (policies: NetworkPolicy[], requests: Action[]) =>
    simulate({
      nodes: nodesOf(2),
      actions: [
        ...['frontend', 'debug', 'api'].map((name): Action => ({ at: 0, kind: 'apply', object: deploymentOf(name, 1) })),
        { at: 0, kind: 'apply', object: serviceOf('api') },
        ...policies.map((object): Action => ({ at: 0, kind: 'apply', object })),
        ...requests,
      ],
      faults: [],
    });

  it('drops traffic a policy denies: the client sees a timeout, and the step names the policy', () => {
    const { frames, final } = run([denyAll, allowFrontend], [
      { at: 20, kind: 'request', id: '#1', service: 'api', from: 'frontend' },
      { at: 21, kind: 'request', id: '#2', service: 'api', from: 'debug' },
    ]);
    expect(final!.requests.map((r) => [r.from, r.status])).toEqual([
      ['frontend', 'ok'],
      ['debug', 'failed'],
    ]);
    expect(final!.requests[1]!.reason).toBe('connection timed out');
    const drop = frames.find((f) => f.event.kind === 'policy-drop')!;
    expect(drop.event.text).toContain('default-deny');
    expect(drop.event.rules!.rows.some((r) => r.mark === 'deny')).toBe(true);
  });

  it('fails at DNS lookup when the source cannot reach DNS', () => {
    const { final } = run([egressDeny(false)], [{ at: 20, kind: 'request', id: '#1', service: 'api', from: 'frontend' }]);
    expect(final!.requests[0]).toMatchObject({ status: 'failed', reason: 'DNS lookup for api timed out' });
  });

  it('fails cleanly when there is no running source pod', () => {
    const { final } = run([], [{ at: 20, kind: 'request', id: '#1', service: 'api', from: 'nobody' }]);
    expect(final!.requests[0]).toMatchObject({ status: 'failed', reason: 'no running pod starting with nobody to send from' });
  });
});
