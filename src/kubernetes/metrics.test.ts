import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf } from './fixtures.testutil';
import type { Deployment, Frame, Pod, Resources, Scenario } from './model';
import { simulate } from './sim';

const withResources = (d: Deployment, resources: Resources): Deployment => ({ ...d, template: { ...d.template, resources } });
const of = (frames: Frame[], kind: string) => frames.filter((f) => f.event.kind === kind);
const loaded = (resources: Resources, extra: Partial<Scenario> = {}): Scenario => ({
  nodes: nodesOf(2),
  actions: [{ at: 0, kind: 'apply', object: withResources(deploymentOf('web', 2), resources) }],
  faults: [],
  load: { target: 'web', points: [[0, 100]], cpuPerRequest: 5 },
  until: 40,
  runToEnd: true,
  ...extra,
});

describe('metrics', () => {
  it('splits the traffic evenly over the ready pods', () => {
    const { frames, final } = simulate(loaded({ cpu: { request: 500 } }));
    const last = of(frames, 'metrics').at(-1)!;
    expect(last.state.pods.map((p) => p.cpuUsage)).toEqual([250, 250]);
    expect(last.event.text).toBe('metrics: web has 2 ready pods at 50% of their CPU request, taking 100 req/s');
    expect(last.state.load).toMatchObject({ rps: 100 });
    expect(final!.load!.points).toEqual(Array.from({ length: 8 }, () => 100));
  });

  it('throttles CPU at the limit instead of killing the pod', () => {
    const { frames } = simulate(loaded({ cpu: { request: 100, limit: 200 } }));
    const last = frames.at(-1)!.state;
    expect(last.pods.map((p) => [p.cpuUsage, p.throttled])).toEqual([
      [200, true],
      [200, true],
    ]);
    expect(of(frames, 'throttle')).toHaveLength(2);
    expect(of(frames, 'exit')).toEqual([]);
  });

  it('OOMKills a container whose memory passes its limit, then restarts it', () => {
    const { frames } = simulate(loaded({ memory: { request: 64, limit: 128 } }, { faults: [{ kind: 'leak', prefix: 'web', miPerS: 10 }], until: 60 }));
    const oom = of(frames, 'oom-kill');
    expect(oom.length).toBeGreaterThanOrEqual(2);
    expect(oom[0]!.event.text).toMatch(/is OOMKilled: it used \d+ MiB, over its 128 MiB limit \(exit code 137\)/);
    expect(oom[0]!.state.pods.find((p) => p.name === oom[0]!.event.subjects[0])).toMatchObject({ lastTermination: 'OOMKilled', phase: 'CrashLoopBackOff' });
    expect(of(frames, 'restart').length).toBeGreaterThan(0);
  });

  it('evicts the pod furthest over its memory request when a node runs out of memory, not the BestEffort one', () => {
    const bare = (name: string, resources?: Resources): Pod => ({ kind: 'Pod', name, labels: { app: name }, phase: 'Pending', ready: false, restarts: 0, image: 'app:v1', cpu: 0, restartPolicy: 'Always', createdAt: 0, ...(resources && { resources }) });
    const { frames } = simulate({
      nodes: [{ name: 'node-1', cpu: 4, memory: 256 }],
      actions: [
        { at: 0, kind: 'apply', object: bare('be') },
        { at: 0, kind: 'apply', object: bare('bu', { memory: { request: 64 } }) },
        { at: 0, kind: 'apply', object: bare('gu', { cpu: { request: 100, limit: 100 }, memory: { request: 64, limit: 64 } }) },
      ],
      faults: [{ kind: 'leak', prefix: 'bu', miPerS: 20 }],
      until: 60,
      runToEnd: true,
    });
    // be is 64 MiB over its (zero) request; the leaking bu is further over, so it goes and the pressure ends.
    expect(of(frames, 'evict').map((f) => f.event.subjects[0])).toEqual(['bu']);
    expect(frames.at(-1)!.state.pods.map((p) => p.name)).toEqual(['be', 'gu']);
  });

  it('adds no metrics to a run without load or leaks', () => {
    const { frames } = simulate({ nodes: nodesOf(1), actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 1) }], faults: [] });
    expect(of(frames, 'metrics')).toEqual([]);
    expect(frames.at(-1)!.state.pods[0]!.cpuUsage).toBeUndefined();
  });
});
