import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { desiredStateControllersScenario, desiredStateControllersSteps } from './desired-state-controllers';

const one = { desired: '3', deleted: '1', outage: 'off' };
const run = (values: Partial<typeof one>) => {
  const read = desiredStateControllersScenario({ ...one, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).frames;
};
const creates = (frames: Frame[], after: number) => frames.filter((f) => f.event.kind === 'create-pod' && f.event.t > after);

describe('Desired State & Controllers', () => {
  it('replaces one deleted pod one watch later', () => {
    const frames = run({});
    expect(creates(frames, 10).map((f) => f.event.t)).toEqual([16]);
    expect(frames.at(-1)!.state.pods.filter((p) => p.ready)).toHaveLength(3);
  });

  it('repairs everything at once when the controller comes back from an outage', () => {
    const frames = run({ deleted: '3', outage: 'on' });
    expect(frames.filter((f) => f.event.kind === 'delete-pod' || f.event.kind === 'action').some((f) => f.event.t === 15)).toBe(true);
    expect(creates(frames, 10).map((f) => f.event.t)).toEqual([40, 40, 40]);
    expect(frames.find((f) => f.event.t === 39)?.state.pods.length ?? 0).toBe(0);
    expect(desiredStateControllersSteps({ ...one, deleted: '3', outage: 'on' }).filter((s) => s.title.includes('creates 3 pods'))).toHaveLength(2);
    const titles = desiredStateControllersSteps({ ...one, deleted: '3', outage: 'on' }).map((s) => s.title);
    expect(titles.some((t) => /^kubectl deletes 3 pods: web-\w{3}, web-\w{3}, web-\w{3}$/.test(t))).toBe(true);
    expect(titles).toContain('The controller manager is back');
  });

  it('does nothing when the desired state already matches, and says so', () => {
    const frames = run({ deleted: '0' });
    expect(creates(frames, 3)).toEqual([]);
    expect(frames.some((f) => f.event.text === 'ReplicaSet web sees 3 of 3 pods: nothing to do')).toBe(true);
    expect(desiredStateControllersSteps({ ...one, deleted: '0' }).some((s) => s.title === 'ReplicaSet web sees 3 of 3 pods: nothing to do')).toBe(true);
  });

  it('deletes no more pods than exist', () => {
    const frames = run({ desired: '1', deleted: '3' });
    expect(frames.filter((f) => f.event.kind === 'action' && f.event.text.startsWith('kubectl deletes'))).toHaveLength(1);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ desired: '0' }, { desired: '6' }, { deleted: '4' }, { deleted: '-1' }, { outage: 'maybe' }]) {
      const steps = desiredStateControllersSteps({ ...one, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this loop");
    }
  });
});
