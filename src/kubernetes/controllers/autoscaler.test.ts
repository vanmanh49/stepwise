import { describe, expect, it } from 'vitest';
import { deploymentOf } from '../fixtures.testutil';
import type { Frame, Scenario } from '../model';
import { simulate } from '../sim';

const pool = (max = 4) => ({ cpu: 4, memory: 8192, min: 1, max });
const scenario = (replicas: number, extra: Partial<Scenario> = {}): Scenario => ({
  nodes: [],
  actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', replicas) }],
  faults: [],
  pool: pool(),
  until: 150,
  runToEnd: true,
  ...extra,
});
const of = (frames: Frame[], kind: string) => frames.filter((f) => f.event.kind === kind);

describe('Cluster Autoscaler', () => {
  it('starts the pool at its minimum size', () => {
    expect(simulate(scenario(1)).final!.nodes.map((n) => [n.name, n.pool])).toEqual([['pool-1', true]]);
  });

  it('adds nodes one per scan until the Pending pods fit, and they boot before taking pods', () => {
    const { frames, final } = simulate(scenario(10));
    const adds = of(frames, 'node-add').filter((f) => f.event.text.includes('adds'));
    expect(adds.map((f) => f.event.subjects[0])).toEqual(['pool-2', 'pool-3']);
    expect(adds[1]!.event.t - adds[0]!.event.t).toBeGreaterThanOrEqual(5);
    const booted = of(frames, 'node-add').find((f) => f.event.text.startsWith('pool-2 has booted'))!;
    expect(booted.event.t).toBe(adds[0]!.event.t + 20);
    expect(of(frames, 'bind').filter((f) => f.event.node === 'pool-2').every((f) => f.event.t >= booted.event.t)).toBe(true);
    expect(final!.nodes).toHaveLength(3);
    expect(final!.pods.filter((p) => p.ready)).toHaveLength(10);
  });

  it('stops at the pool maximum and says so once', () => {
    const { frames, final } = simulate(scenario(10, { pool: pool(2) }));
    expect(final!.nodes).toHaveLength(2);
    expect(final!.pods.filter((p) => !p.node)).toHaveLength(2);
    expect(frames.filter((f) => f.event.text.includes('max node group size reached'))).toHaveLength(1);
  });

  it('adds no node for a pod too big for any pool node', () => {
    const d = deploymentOf('big', 1);
    const { frames } = simulate({ ...scenario(0), actions: [{ at: 0, kind: 'apply', object: { ...d, template: { ...d.template, cpu: 6 } } }] });
    expect(of(frames, 'node-add')).toEqual([]);
  });

  it('removes idle nodes after 60 s, draining them first, but never below the minimum', () => {
    const { frames, final } = simulate(scenario(10, { actions: [{ at: 0, kind: 'apply', object: deploymentOf('web', 10) }, { at: 80, kind: 'scale', target: 'web', replicas: 2 }], until: 320 }));
    const removals = of(frames, 'node-remove').filter((f) => f.event.text.includes('is empty'));
    expect(removals.length).toBe(2);
    expect(removals[0]!.event.t).toBeGreaterThanOrEqual(80 + 60);
    expect(final!.nodes).toHaveLength(1);
    expect(final!.pods.filter((p) => p.ready)).toHaveLength(2);
  });
});
