import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { replicaSetsScenario, replicaSetsSteps } from './replicasets';

const up = { replicas: '3', scaleTo: '5', nodeDown: 'off' };
const run = (values: Partial<typeof up>) => {
  const read = replicaSetsScenario({ ...up, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).frames;
};
const of = (frames: Frame[], kind: string, after = 0) => frames.filter((f) => f.event.kind === kind && f.event.t >= after);

describe('ReplicaSets', () => {
  it('creates exactly the 2 extra pods when scaled from 3 to 5', () => {
    const frames = run({});
    expect(of(frames, 'create-pod', 20)).toHaveLength(2);
    expect(frames.at(-1)!.state.pods.filter((p) => p.ready)).toHaveLength(5);
  });

  it('deletes 3 pods when scaled from 5 to 2, in the stated order', () => {
    const frames = run({ replicas: '5', scaleTo: '2' });
    const before = frames.find((f) => f.event.t === 20)!.state.pods.map((p) => p.name).toSorted();
    const deleted = of(frames, 'delete-pod', 20).map((f) => f.event.subjects[0]);
    // Same age and all ready, so the lowest names go first.
    expect(deleted).toEqual(before.slice(0, 3));
    expect(frames.at(-1)!.state.pods).toHaveLength(2);
  });

  it('moves the pods of a node that dies', () => {
    const frames = run({ nodeDown: 'on' });
    const onNode2 = frames.filter((f) => f.event.t < 20).at(-1)!.state.pods.filter((p) => p.node === 'node-2').length;
    expect(onNode2).toBeGreaterThan(0);
    // The last heartbeat is at 10 s (the 20 s one never happens), so NotReady at the 35 s check.
    expect(of(frames, 'node-not-ready')[0]!.event.t).toBe(35);
    expect(of(frames, 'lost').every((f) => f.event.t === 35)).toBe(true);
    const evictions = frames.filter((f) => f.event.kind === 'delete-pod' && f.event.text.startsWith('node lifecycle'));
    expect(evictions.map((f) => f.event.t)).toEqual(Array.from({ length: onNode2 }, () => 45));
    const last = frames.at(-1)!.state;
    expect(last.pods).toHaveLength(3);
    expect(last.pods.every((p) => p.ready && p.node !== 'node-2')).toBe(true);
    // No scaling when the node dies.
    expect(frames.some((f) => f.event.text.startsWith('kubectl scales'))).toBe(false);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ replicas: '0' }, { replicas: '7' }, { scaleTo: '-1' }, { scaleTo: '7' }, { nodeDown: 'x' }]) {
      const steps = replicaSetsSteps({ ...up, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this ReplicaSet");
    }
  });
});

describe('ReplicaSets lesson wording', () => {
  it('says Lost is this lesson’s name, not a status kubectl shows', async () => {
    const lesson = (await import('../../lessons/kubernetes/replicasets')).default;
    expect(lesson.concept.join(' ')).toContain('kubectl shows them as Unknown');
  });
});
