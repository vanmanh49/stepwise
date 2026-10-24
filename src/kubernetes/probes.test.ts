import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf, serviceOf } from './fixtures.testutil';
import type { Fault, Frame, Pod, Scenario } from './model';
import { simulate } from './sim';

const probe = { periodS: 2, failureThreshold: 3 };
type Probes = NonNullable<Pod['probes']>;
const scenario = (probes: Probes | undefined, faults: Fault[], extra: Partial<Scenario> = {}): Scenario => {
  const d = deploymentOf('web', 1);
  return {
    nodes: nodesOf(1),
    actions: [{ at: 0, kind: 'apply', object: { ...d, template: { ...d.template, ...(probes && { probes }) } } }],
    faults,
    until: 80,
    runToEnd: true,
    ...extra,
  };
};
const of = (frames: Frame[], kind: string) => frames.filter((f) => f.event.kind === kind);
const final = (s: Scenario) => simulate(s).final!.pods[0]!;

describe('probes', () => {
  it('keeps phase 1 timing without probes: ready 2 s after start', () => {
    const { frames } = simulate(scenario(undefined, []));
    expect(of(frames, 'ready')[0]!.event.t).toBe(of(frames, 'start')[0]!.event.t + 2);
  });

  it('restarts a slow starter forever with only a liveness probe', () => {
    const pod = final(scenario({ liveness: probe }, [{ kind: 'slow-start', prefix: 'web', seconds: 20 }]));
    expect(pod.restarts).toBeGreaterThanOrEqual(2);
    expect(pod.lastTermination).toBe('Liveness');
  });

  it('lets a slow starter finish starting when a startup probe guards it', () => {
    const s = scenario({ startup: { periodS: 2, failureThreshold: 15 }, liveness: probe }, [{ kind: 'slow-start', prefix: 'web', seconds: 20 }]);
    const { frames, final: end } = simulate(s);
    expect(end!.pods[0]).toMatchObject({ restarts: 0, ready: true });
    const start = of(frames, 'start')[0]!.event.t;
    const ok = of(frames, 'probe-ok')[0]!;
    expect(ok.event.t).toBeGreaterThanOrEqual(start + 20);
    // No liveness failure before the startup probe succeeds.
    expect(of(frames, 'probe-fail').filter((f) => f.event.text.includes('Liveness')).every((f) => f.event.t > ok.event.t)).toBe(true);
    expect(of(frames, 'ready')[0]!.event.t).toBe(ok.event.t);
  });

  it('restarts a hung container after 3 failed liveness probes, and the restart cures it', () => {
    const { frames, final: end } = simulate(scenario({ liveness: probe }, [{ kind: 'hang', prefix: 'web', at: 40 }]));
    const fails = of(frames, 'probe-fail');
    expect(fails).toHaveLength(3);
    expect(fails.every((f) => f.event.t >= 40 && f.event.t <= 46)).toBe(true);
    expect(of(frames, 'exit').at(-1)!.event.text).toMatch(/Liveness probe failed 3 times/);
    expect(end!.pods[0]).toMatchObject({ restarts: 1, ready: true, lastTermination: 'Liveness' });
  });

  it('only takes a hung pod out of traffic with a readiness probe, never restarting it', () => {
    const { frames, final: end } = simulate(scenario({ readiness: probe }, [{ kind: 'hang', prefix: 'web', at: 40 }]));
    expect(end!.pods[0]).toMatchObject({ restarts: 0, ready: false, phase: 'Running' });
    expect(of(frames, 'not-ready')).toHaveLength(1);
    // Readiness gates "ready" from the start: not before the first successful probe.
    expect(of(frames, 'ready')[0]!.event.t).toBeGreaterThan(of(frames, 'start')[0]!.event.t);
  });

  it('fails requests sent to a hung pod that nothing took out of traffic', () => {
    const s = scenario(undefined, [{ kind: 'hang', prefix: 'web', at: 20 }]);
    s.actions.push({ at: 0, kind: 'apply', object: serviceOf('web') }, { at: 15, kind: 'request', id: '#1', service: 'web' }, { at: 25, kind: 'request', id: '#2', service: 'web' });
    expect(simulate(s).final!.requests.map((r) => r.status)).toEqual(['ok', 'failed']);
  });

  it('ignores probe timers of a pod that was deleted', () => {
    const s = scenario({ liveness: probe }, [{ kind: 'hang', prefix: 'web', at: 40 }]);
    const d = deploymentOf('web', 1);
    s.actions = [{ at: 0, kind: 'apply', object: { ...d, replicas: 1, template: { ...d.template, probes: { liveness: probe } } } }, { at: 41, kind: 'scale', target: 'web', replicas: 0 }];
    const { frames } = simulate(s);
    expect(of(frames, 'probe-fail').filter((f) => f.event.t > 42)).toEqual([]);
  });
});
