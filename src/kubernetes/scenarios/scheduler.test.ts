import { describe, expect, it } from 'vitest';
import type { ClusterView } from '../../types/visualization';
import { simulate } from '../sim';
import { schedulerScenario, schedulerSteps } from './scheduler';

const spread = { strategy: 'LeastAllocated', cpu: '1', cordon: 'off' };
const placed = (values: Partial<typeof spread>) => {
  const read = schedulerScenario({ ...spread, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).frames.find((f) => f.event.kind === 'bind' || f.event.kind === 'unschedulable')!.event;
};

describe('The Scheduler', () => {
  it('spreads with LeastAllocated: the node with the most room left after placing', () => {
    expect(placed({}).node).toBe('node-2');
  });

  it('bin-packs with MostAllocated: the fullest node that still fits', () => {
    expect(placed({ strategy: 'MostAllocated' }).node).toBe('node-1');
  });

  it('rules out nodes too small for a bigger pod', () => {
    expect(placed({ cpu: '3' }).breakdown!.rows.find((r) => r.node === 'node-1')!.filtered).toBe('Insufficient cpu');
    expect(placed({ cpu: '3' }).node).toBe('node-2');
  });

  it('leaves the pod Pending with the grouped reason when nothing fits', () => {
    expect(placed({ cpu: '4', cordon: 'on' }).reason).toBe('0/3 nodes are available: 1 node(s) were unschedulable, 2 Insufficient cpu');
  });

  it('shows the scoring table on the deciding step', () => {
    const step = schedulerSteps(spread).find((s) => s.title.startsWith('scheduler binds'))!;
    expect((step.view as ClusterView).scoring!.rows.map((r) => r.node)).toEqual(['node-1', 'node-2', 'node-3']);
    // Before metrics run, the memory bar shows what pods request, as the CPU bar does.
    expect((step.view as ClusterView).nodes.find((n) => n.name === 'node-2')!.memory).toEqual({ used: 1024, capacity: 4096 });
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ cpu: '0' }, { cpu: '5' }, { strategy: 'Random' }, { cordon: 'x' }]) {
      const steps = schedulerSteps({ ...spread, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't schedule this pod");
    }
  });
});
