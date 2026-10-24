import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { drainingPdbScenario, drainingPdbSteps } from './draining-pdb';

const noPdb = { pdb: 'none', uncordon: 'off' };
const run = (values: Partial<typeof noPdb>) => {
  const read = drainingPdbScenario({ ...noPdb, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const ready = (f: Frame) => f.state.pods.filter((p) => p.ready).length;
const afterDrain = (frames: Frame[]) => frames.filter((f) => f.event.t >= 21);
const evicts = (frames: Frame[]) => frames.filter((f) => f.event.kind === 'evict');

describe('Draining & PodDisruptionBudgets', () => {
  it('starts with two pods on node-1', () => {
    expect(run({}).frames.filter((f) => f.event.t < 21).at(-1)!.state.pods.filter((p) => p.node === 'node-1')).toHaveLength(2);
  });

  it('evicts both pods at once without a PDB, so ready pods drop to 2', () => {
    const { frames, final } = run({});
    expect(evicts(frames).map((f) => f.event.t)).toEqual([21, 21]);
    expect(Math.min(...afterDrain(frames).map(ready))).toBe(2);
    expect(final!.pods.every((p) => p.node !== 'node-1' && p.ready)).toBe(true);
  });

  it.each(['minAvailable 3', 'maxUnavailable 1'])('never drops below 3 ready with %s', (pdb) => {
    const { frames } = run({ pdb });
    expect(afterDrain(frames).every((f) => ready(f) >= 3)).toBe(true);
    const [first, second] = evicts(frames).map((f) => f.event.t);
    expect(first).toBe(21);
    expect(second).toBeGreaterThan(21);
    expect(frames.filter((f) => f.event.kind === 'evict-refused')).toHaveLength(1);
  });

  it('blocks the drain forever with minAvailable 4', () => {
    const result = run({ pdb: 'minAvailable 4' });
    expect(evicts(result.frames)).toEqual([]);
    expect(result.cutOff).toBe(true);
    expect(drainingPdbSteps({ ...noPdb, pdb: 'minAvailable 4' }).at(-1)!.title).toMatch(/^After 90 s: /);
  });

  it('uncordons the node, but pods don\'t move back by themselves', () => {
    const { final } = run({ uncordon: 'on' });
    expect(final!.nodes.find((n) => n.name === 'node-1')!.unschedulable).toBe(false);
    expect(final!.pods.filter((p) => p.node === 'node-1')).toEqual([]);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ pdb: 'minAvailable 9' }, { uncordon: 'later' }]) {
      const steps = drainingPdbSteps({ ...noPdb, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't drain this node");
    }
  });
});
