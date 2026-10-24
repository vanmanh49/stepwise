import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { clusterAutoscalerScenario, clusterAutoscalerSteps } from './cluster-autoscaler';

const up = { replicas: '10', max: '4', back: 'off' };
const run = (values: Partial<typeof up>) => {
  const read = clusterAutoscalerScenario({ ...up, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};

describe('Cluster Autoscaler lesson', () => {
  it('adds pool nodes for the Pending pods, and every pod runs', () => {
    const { frames, final } = run({});
    expect(frames.filter((f) => f.event.kind === 'node-add' && f.event.text.includes('adds')).map((f) => f.event.subjects[0])).toEqual(['pool-2', 'pool-3']);
    expect(final!.pods.filter((p) => p.ready)).toHaveLength(10);
  });

  it('stops at the pool maximum and leaves the rest Pending', () => {
    const { frames, final } = run({ max: '2' });
    expect(final!.nodes).toHaveLength(2);
    expect(final!.pods.filter((p) => !p.node)).toHaveLength(2);
    expect(frames.some((f) => f.event.text.includes('max node group size reached (2)'))).toBe(true);
  });

  it('removes idle nodes after the scale back, never below one', () => {
    const { frames, final } = run({ back: 'on' });
    const removed = frames.filter((f) => f.event.kind === 'node-remove' && f.event.text.includes('is empty'));
    expect(removed.length).toBe(2);
    expect(removed[0]!.event.t).toBeGreaterThanOrEqual(80 + 60);
    expect(final!.nodes).toHaveLength(1);
  });

  it('sums up pods the scheduler can\'t place in one short step', () => {
    const titles = clusterAutoscalerSteps(up).map((s) => s.title);
    expect(titles).toContain("scheduler can't place 6 pods: 0/1 nodes are available: 1 Insufficient cpu");
  });

  it('adds nothing when the pool can already hold the pods', () => {
    expect(run({ replicas: '3' }).frames.filter((f) => f.event.kind === 'node-add')).toEqual([]);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ replicas: '1' }, { replicas: '15' }, { max: '1' }, { max: '5' }, { back: 'x' }]) {
      const steps = clusterAutoscalerSteps({ ...up, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this node pool");
    }
  });
});
