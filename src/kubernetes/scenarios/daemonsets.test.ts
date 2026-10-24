import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { daemonsetsScenario, daemonsetsSteps } from './daemonsets';

const base = { toleration: 'off', nodeSelector: 'none', join: 'off', drain: 'off', update: 'off' };
const run = (values: Partial<typeof base>) => {
  const read = daemonsetsScenario({ ...base, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const agents = (state: Frame['state']) => state.pods.filter((p) => p.ownerKind === 'DaemonSet');
const nodesOf = (state: Frame['state']) => agents(state).map((p) => p.node).toSorted();

describe('DaemonSets', () => {
  it('runs one agent per node, skipping the tainted node', () => {
    expect(nodesOf(run({}).final!)).toEqual(['node-1', 'node-2']);
  });

  it('runs on the tainted node too with a toleration', () => {
    expect(nodesOf(run({ toleration: 'on' }).final!)).toEqual(['node-1', 'node-2', 'node-3']);
  });

  it('gives a node that joins its own agent', () => {
    const { frames, final } = run({ join: 'on' });
    expect(nodesOf(final!)).toEqual(['node-1', 'node-2', 'node-4']);
    expect(frames.find((f) => f.event.kind === 'create-pod' && f.event.t > 30)!.event.t).toBe(31);
  });

  it('only uses nodes matching the nodeSelector', () => {
    expect(nodesOf(run({ nodeSelector: 'disk=ssd' }).final!)).toEqual(['node-1']);
    expect(nodesOf(run({ nodeSelector: 'disk=ssd', toleration: 'on' }).final!)).toEqual(['node-1', 'node-3']);
  });

  it('leaves the agent in place when node-1 is drained, while the web pods move', () => {
    const { final } = run({ drain: 'on' });
    expect(nodesOf(final!)).toContain('node-1');
    expect(final!.pods.filter((p) => p.ownerKind !== 'DaemonSet' && p.node === 'node-1')).toEqual([]);
  });

  it('updates one node at a time', () => {
    const { frames, final } = run({ update: 'on' });
    for (const f of frames.filter((x) => x.event.t >= 70)) expect(agents(f.state).filter((p) => p.ready).length).toBeGreaterThanOrEqual(1);
    expect(agents(final!).map((p) => p.image)).toEqual(['log-agent:v2', 'log-agent:v2']);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ toleration: 'yes' }, { nodeSelector: 'zone=a' }, { update: 'v3' }]) {
      const steps = daemonsetsSteps({ ...base, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this DaemonSet");
    }
  });
});
