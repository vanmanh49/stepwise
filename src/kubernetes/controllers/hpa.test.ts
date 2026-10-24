import { describe, expect, it } from 'vitest';
import { ctxFor, deploymentOf, nodesOf, pod, replicaSet, storeWith } from '../fixtures.testutil';
import type { HorizontalPodAutoscaler, Pod, Scenario } from '../model';
import { simulate } from '../sim';
import { reconcileHpas, type HpaHistory } from './hpa';

const hpa: HorizontalPodAutoscaler = { kind: 'HorizontalPodAutoscaler', name: 'web', target: 'web', min: 2, max: 8, targetCpuPercent: 50 };
const serving = (name: string, cpuUsage: number, extra: Partial<Pod> = {}) => pod(name, { owner: 'web-aa', node: 'node-1', resources: { cpu: { request: 100 } }, cpuUsage, ...extra });
const store = (replicas: number, usages: number[], extra: Partial<Pod> = {}) =>
  storeWith(deploymentOf('web', replicas), replicaSet('web-aa', replicas, { owner: 'web' }), hpa, ...usages.map((u, i) => serving(`web-aa-${i}`, u, extra)));
const run = (s: ReturnType<typeof store>, history: HpaHistory = new Map(), now = 100) => reconcileHpas({ ...ctxFor(s, now) }, history);

describe('Horizontal Pod Autoscaler', () => {
  it('scales by ceil(ready pods × usage ÷ target)', () => {
    const [change] = run(store(2, [100, 100]));
    expect(change!.write!.object).toMatchObject({ kind: 'Deployment', name: 'web', replicas: 4 });
    expect(change!.event).toMatchObject({ kind: 'hpa', by: 'controllers', text: 'HPA web: CPU 100% of request vs target 50% → 4 replicas (from 2)' });
  });

  it('holds within the 10% tolerance', () => {
    expect(run(store(2, [54, 54]))).toEqual([]);
  });

  it('clamps to max and min', () => {
    const [up] = run(store(2, [500, 500]));
    expect(up!.write!.object).toMatchObject({ replicas: 8 });
    expect(up!.event.text).toBe('HPA web: CPU 500% of request vs target 50% → 8 replicas (from 2), capped at max 8');
    const [down] = run(store(4, [0, 0, 0, 0]), new Map(), 100);
    expect(down!.write!.object).toMatchObject({ replicas: 2 });
  });

  it('waits out the 30 s stabilisation window before scaling down', () => {
    const history: HpaHistory = new Map([['web', [{ t: 80, desired: 4 }]]]);
    expect(run(store(4, [25, 25, 25, 25]), history)).toEqual([]);
    const later: HpaHistory = new Map([['web', [{ t: 60, desired: 4 }]]]);
    expect(run(store(4, [25, 25, 25, 25]), later)[0]!.write!.object).toMatchObject({ replicas: 2 });
  });

  it('reports a missing CPU request once and never scales', () => {
    const s = store(2, [100, 100], { resources: {} });
    const [change] = run(s);
    expect(change!.write!.object).toMatchObject({ kind: 'HorizontalPodAutoscaler', note: 'missing request for cpu' });
    s.write(change!.write!);
    expect(run(s)).toEqual([]);
  });

  it('scales a loaded Deployment up and back down in a simulation', () => {
    const d = deploymentOf('web', 2);
    const scenario: Scenario = {
      nodes: nodesOf(3),
      actions: [
        { at: 0, kind: 'apply', object: { ...d, template: { ...d.template, cpu: 0.1, resources: { cpu: { request: 100 } } } } },
        { at: 0, kind: 'apply', object: hpa },
      ],
      faults: [],
      load: { target: 'web', points: [[0, 10], [20, 10], [21, 40], [60, 40], [61, 10]], cpuPerRequest: 10 },
      until: 150,
      runToEnd: true,
    };
    const { frames, final } = simulate(scenario);
    const replicas = frames.filter((f) => f.event.kind === 'hpa').map((f) => f.state.deployments[0]!.replicas);
    expect(Math.max(...replicas)).toBe(8);
    expect(final!.deployments[0]!.replicas).toBe(2);
    const firstDown = frames.find((f) => f.event.kind === 'hpa' && f.event.text.includes('(from 8)'))!;
    // The last high recommendation is the 60 s sync; scale-down waits 30 s from it.
    expect(firstDown.event.t).toBeGreaterThanOrEqual(60 + 30);
  });
});
