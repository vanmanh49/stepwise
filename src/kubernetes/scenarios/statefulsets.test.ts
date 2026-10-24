import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { statefulsetsScenario, statefulsetsSteps } from './statefulsets';

const ordered = { policy: 'OrderedReady', replicas: '3', event: 'none', stuck: 'off' };
const run = (values: Partial<typeof ordered>) => {
  const read = statefulsetsScenario({ ...ordered, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const t = (frames: Frame[], kind: string, pod: string) => frames.find((f) => f.event.kind === kind && f.event.subjects[0] === pod)?.event.t;
const at = (frames: Frame[], s: number) => frames.filter((f) => f.event.t <= s).at(-1)!.state;
const pv = (state: Frame['state'], claim: string) => state.volumes.find((v) => v.claim === claim)!;

describe('StatefulSets', () => {
  it('starts db-0, then db-1, then db-2, each once the one before is ready', () => {
    const { frames } = run({});
    expect(t(frames, 'create-pod', 'db-1')!).toBeGreaterThan(t(frames, 'ready', 'db-0')!);
    expect(t(frames, 'create-pod', 'db-2')!).toBeGreaterThan(t(frames, 'ready', 'db-1')!);
  });

  it('starts every pod at once with Parallel', () => {
    const { frames } = run({ policy: 'Parallel' });
    expect(new Set(['db-0', 'db-1', 'db-2'].map((p) => t(frames, 'create-pod', p))).size).toBe(1);
  });

  it('brings a deleted db-1 back with the same name and its data', () => {
    const { frames, final } = run({ event: 'delete db-1' });
    const before = pv(at(frames, 79), 'data-db-1');
    expect(final!.pods.map((p) => p.name)).toEqual(['db-0', 'db-1', 'db-2']);
    expect(pv(final!, 'data-db-1').name).toBe(before.name);
    expect(pv(final!, 'data-db-1').records).toBeGreaterThan(before.records);
  });

  it('scales down from the top and keeps the claims for scale-up', () => {
    const { frames, final } = run({ event: 'scale to 1 and back' });
    expect(frames.filter((f) => f.event.kind === 'delete-pod').map((f) => f.event.subjects[0])).toEqual(['db-2', 'db-1']);
    expect(at(frames, 119).claims).toHaveLength(3);
    expect(pv(final!, 'data-db-2').records).toBeGreaterThan(pv(at(frames, 119), 'data-db-2').records);
  });

  it('rolls a new image out from the highest ordinal down', () => {
    const { frames, final } = run({ event: 'set image v2' });
    expect(frames.filter((f) => f.event.kind === 'delete-pod').map((f) => f.event.subjects[0])).toEqual(['db-2', 'db-1', 'db-0']);
    expect(final!.pods.every((p) => p.image === 'postgres:16')).toBe(true);
  });

  it('never starts db-2 while db-1 is not ready', () => {
    expect(run({ stuck: 'on' }).final!.pods.map((p) => p.name)).toEqual(['db-0', 'db-1']);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ replicas: '0' }, { replicas: '6' }, { policy: 'Random' }, { event: 'later' }]) {
      const steps = statefulsetsSteps({ ...ordered, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't run this StatefulSet");
    }
  });
});
