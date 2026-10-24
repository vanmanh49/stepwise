import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { taintsTolerationsScenario, taintsTolerationsSteps } from './taints-tolerations';

const skipped = { toleration: 'off', effect: 'NoSchedule', seconds: 'none' };
const run = (values: Partial<typeof skipped>) => {
  const read = taintsTolerationsScenario({ ...skipped, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const onNode3 = (f: Frame) => f.state.pods.filter((p) => p.node === 'node-3');
const evicts = (frames: Frame[]) => frames.filter((f) => f.event.kind === 'evict');

describe('Taints & Tolerations', () => {
  it('never places a pod on the tainted node without a toleration', () => {
    const { frames } = run({});
    expect(frames.every((f) => onNode3(f).length === 0)).toBe(true);
    const bind = frames.find((f) => f.event.kind === 'bind')!;
    expect(bind.event.breakdown!.rows.find((r) => r.node === 'node-3')!.filtered).toBe('node(s) had untolerated taint {gpu: true}');
  });

  it('lets a tolerating pod use the tainted node, without forcing it there', () => {
    const { final } = run({ toleration: 'on' });
    expect(final!.pods.filter((p) => p.node === 'node-3')).toHaveLength(1);
    expect(final!.pods.filter((p) => p.node !== 'node-3')).toHaveLength(2);
  });

  it('evicts the untolerated pod when a NoExecute taint appears, and replaces it elsewhere', () => {
    const { frames, final } = run({ effect: 'NoExecute' });
    expect(evicts(frames).map((f) => f.event.t)).toEqual([20]);
    expect(final!.pods.filter((p) => p.node === 'node-3')).toEqual([]);
    expect(final!.pods.filter((p) => p.ready)).toHaveLength(3);
  });

  it('delays the eviction by tolerationSeconds', () => {
    expect(evicts(run({ effect: 'NoExecute', toleration: 'on', seconds: '10' }).frames)[0]!.event.t).toBe(30);
  });

  it('evicts a pod placed on the node after the taint once its tolerationSeconds pass', () => {
    const { frames, cutOff, endedAt } = run({ effect: 'NoExecute', toleration: 'on', seconds: '10' });
    const late = frames.filter((f) => f.event.kind === 'bind' && f.event.node === 'node-3' && f.event.t > 20);
    expect(late.length).toBeGreaterThan(0);
    for (const bind of late) {
      const pod = bind.event.subjects[0]!;
      const evicted = evicts(frames).find((f) => f.event.subjects[0] === pod && f.event.t > bind.event.t);
      if (cutOff && endedAt < bind.event.t + 10) continue;
      expect(evicted?.event.t).toBe(bind.event.t + 10);
    }
  });

  it('keeps a pod that tolerates NoExecute with no time limit', () => {
    const { frames, final } = run({ effect: 'NoExecute', toleration: 'on' });
    expect(evicts(frames)).toEqual([]);
    expect(final!.pods.filter((p) => p.node === 'node-3')).toHaveLength(1);
  });

  it('refuses out-of-range values', () => {
    const steps = taintsTolerationsSteps({ ...skipped, effect: 'NoWay' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.title).toBe("Can't apply this taint");
  });
});
