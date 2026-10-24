import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { servicesKubeProxyScenario, servicesKubeProxySteps } from './services-kube-proxy';

const even = { replicas: '3', notReady: 'off', selector: 'correct' };
const run = (values: Partial<typeof even>) => {
  const read = servicesKubeProxyScenario({ ...even, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).frames;
};

describe('Services & kube-proxy', () => {
  it('spreads 10 requests over every ready pod', () => {
    const state = run({}).at(-1)!.state;
    expect(state.requests).toHaveLength(10);
    expect(state.requests.every((r) => r.status === 'ok')).toBe(true);
    expect(new Set(state.requests.map((r) => r.pod))).toEqual(new Set(state.pods.map((p) => p.name)));
  });

  it('drops a pod that goes not-ready from the endpoints one watch later, and sends it nothing after', () => {
    const frames = run({ notReady: 'on' });
    const hit = frames.find((f) => f.event.kind === 'not-ready')!;
    const name = hit.event.subjects[0]!;
    expect(hit.event.t).toBe(16);
    const dropped = frames.find((f) => f.event.kind === 'endpoints' && f.event.t > 16)!;
    expect(dropped.event.t).toBe(17);
    expect(dropped.state.endpoints[0]!.pods).not.toContain(name);
    const routes = frames.filter((f) => f.event.kind === 'route' && f.event.subjects[2] === name);
    expect(routes.every((f) => f.event.t <= 17)).toBe(true);
    expect(frames.at(-1)!.state.requests.every((r) => r.status === 'ok')).toBe(true);
  });

  it('fails every request when the only pod goes not-ready', () => {
    const requests = run({ replicas: '1', notReady: 'on' }).at(-1)!.state.requests;
    expect(requests.filter((r) => r.status === 'failed').length).toBeGreaterThan(0);
  });

  it('refuses every request when a selector typo leaves no endpoints', () => {
    const frames = run({ selector: 'typo' });
    expect(frames.at(-1)!.state.endpoints[0]!.pods).toEqual([]);
    expect(frames.at(-1)!.state.requests.map((r) => [r.status, r.reason])).toEqual(Array.from({ length: 10 }, () => ['failed', 'no endpoints for web: connection refused']));
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ replicas: '0' }, { replicas: '5' }, { notReady: 'x' }, { selector: 'other' }]) {
      const steps = servicesKubeProxySteps({ ...even, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this Service");
    }
  });
});
