import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { clusterArchitectureScenario, clusterArchitectureSteps } from './cluster-architecture';

const happy = { nodes: '3', replicas: '2', fault: 'none' };
const run = (values: Partial<typeof happy>) => {
  const read = clusterArchitectureScenario({ ...happy, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).frames;
};

describe('Cluster Architecture', () => {
  it('ends with every replica Running and ready', () => {
    const frames = run({ replicas: '3' });
    expect(frames.at(-1)!.state.pods.map((p) => [p.phase, p.ready])).toEqual(Array.from({ length: 3 }, () => ['Running', true]));
    expect(frames.map((f) => f.event.by)).toEqual(expect.arrayContaining(['kubectl', 'controllers', 'scheduler', 'kubelet']));
  });

  it('keeps pods Pending while the scheduler is down, then binds them all at 30 s', () => {
    const frames = run({ fault: 'scheduler-down' });
    const binds = frames.filter((f) => f.event.kind === 'bind');
    expect(binds.map((f) => f.event.t)).toEqual([30, 30]);
    expect(frames.find((f) => f.event.t === 29)?.state.pods.every((p) => !p.node) ?? true).toBe(true);
    expect(frames.some((f) => f.event.t < 30 && f.state.pods.length === 2)).toBe(true);
  });

  it('refuses the apply while etcd is down, and nothing ever exists', () => {
    const frames = run({ fault: 'etcd-down' });
    expect(frames.filter((f) => f.event.kind === 'refuse-write')).toHaveLength(1);
    expect(frames.every((f) => f.state.pods.length === 0 && f.state.deployments.length === 0)).toBe(true);
  });

  it('puts pods on as many nodes as it can', () => {
    const pods = run({ nodes: '3', replicas: '3' }).at(-1)!.state.pods;
    expect(new Set(pods.map((p) => p.node)).size).toBe(3);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ nodes: '0' }, { nodes: '4' }, { replicas: '0' }, { replicas: '4' }, { fault: 'kaboom' }]) {
      const steps = clusterArchitectureSteps({ ...happy, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this cluster");
    }
  });
});
