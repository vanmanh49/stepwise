import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { affinityScenario, affinitySteps } from './affinity';

const ssd = { node: 'required ssd', anti: 'none', replicas: '3' };
const final = (values: Partial<typeof ssd>) => {
  const read = affinityScenario({ ...ssd, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).final!;
};
const nodesUsed = (values: Partial<typeof ssd>) => final(values).pods.map((p) => p.node ?? 'pending').toSorted();

describe('Affinity', () => {
  it('only uses ssd nodes with required node affinity', () => {
    expect(nodesUsed({}).every((n) => n === 'node-1' || n === 'node-3')).toBe(true);
  });

  it('falls back to hdd nodes with preferred affinity once the ssd nodes are full', () => {
    const used = nodesUsed({ node: 'preferred ssd', replicas: '6' });
    expect(used.filter((n) => n === 'node-1' || n === 'node-3')).toHaveLength(4);
    expect(used.filter((n) => n === 'node-2' || n === 'node-4')).toHaveLength(2);
  });

  it('spreads one pod per node with required anti-affinity', () => {
    expect(nodesUsed({ node: 'none', anti: 'required', replicas: '4' })).toEqual(['node-1', 'node-2', 'node-3', 'node-4']);
  });

  it('leaves extra replicas Pending when required anti-affinity has no node left', () => {
    const state = final({ node: 'none', anti: 'required', replicas: '6' });
    const waiting = state.pods.filter((p) => !p.node);
    expect(waiting).toHaveLength(2);
    expect(waiting[0]!.reason).toBe("0/4 nodes are available: 4 node(s) didn't match pod anti-affinity rules");
  });

  it('lets preferred anti-affinity double up when it must', () => {
    expect(nodesUsed({ node: 'none', anti: 'preferred', replicas: '6' }).filter((n) => n === 'pending')).toEqual([]);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ replicas: '1' }, { replicas: '7' }, { node: 'gpu' }, { anti: 'maybe' }]) {
      const steps = affinitySteps({ ...ssd, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't place these pods");
    }
  });
});
