import { describe, expect, it } from 'vitest';
import { nodesOf, serviceOf, template } from '../fixtures.testutil';
import type { Action, Fault, Frame, StatefulSet } from '../model';
import { simulate } from '../sim';

const set = (extra: Partial<StatefulSet> = {}): StatefulSet => ({
  kind: 'StatefulSet',
  name: 'db',
  replicas: 3,
  selector: [{ key: 'app', op: '=', values: ['db'] }],
  template: template('db', 'postgres:15'),
  serviceName: 'db',
  podManagementPolicy: 'OrderedReady',
  claims: [{ name: 'data', requestGi: 1, storageClass: 'standard' }],
  whenScaled: 'Retain',
  revision: 1,
  history: [],
  ...extra,
});

const run = (extra: Partial<StatefulSet> = {}, actions: Action[] = [], faults: Fault[] = []) =>
  simulate({
    nodes: nodesOf(3),
    actions: [
      { at: 0, kind: 'apply', object: { kind: 'StorageClass', name: 'standard', reclaimPolicy: 'Delete' } },
      { at: 0, kind: 'apply', object: serviceOf('db') },
      { at: 0, kind: 'apply', object: set(extra) },
      ...actions,
    ],
    faults,
    until: 150,
    runToEnd: true,
  });
const first = (frames: Frame[], kind: string, subject: string) => frames.find((f) => f.event.kind === kind && f.event.subjects[0] === subject)!.event.t;
const at = (frames: Frame[], t: number) => frames.filter((f) => f.event.t <= t).at(-1)!.state;
const pvOf = (state: Frame['state'], claim: string) => state.volumes.find((v) => v.claim === claim);

describe('StatefulSet controller', () => {
  it('creates pods in order, each after the one before is ready', () => {
    const { frames, final } = run();
    expect(final!.pods.map((p) => p.name)).toEqual(['db-0', 'db-1', 'db-2']);
    expect(first(frames, 'create-pod', 'db-1')).toBeGreaterThan(first(frames, 'ready', 'db-0'));
    expect(first(frames, 'create-pod', 'db-2')).toBeGreaterThan(first(frames, 'ready', 'db-1'));
    expect(final!.claims.map((c) => [c.name, c.phase])).toEqual([
      ['data-db-0', 'Bound'],
      ['data-db-1', 'Bound'],
      ['data-db-2', 'Bound'],
    ]);
  });

  it('creates every pod at once with Parallel', () => {
    const { frames } = run({ podManagementPolicy: 'Parallel' });
    const creates = frames.filter((f) => f.event.kind === 'create-pod').map((f) => f.event.t);
    expect(creates).toHaveLength(3);
    expect(new Set(creates).size).toBe(1);
  });

  it('scales down from the top one pod at a time and keeps the claims for scale-up', () => {
    const { frames, final } = run({}, [
      { at: 60, kind: 'scale', target: 'db', replicas: 1 },
      { at: 100, kind: 'scale', target: 'db', replicas: 3 },
    ]);
    const deletes = frames.filter((f) => f.event.kind === 'delete-pod');
    expect(deletes.map((f) => f.event.subjects[0])).toEqual(['db-2', 'db-1']);
    expect(deletes[1]!.event.t).toBeGreaterThan(deletes[0]!.event.t);
    expect(at(frames, 99).claims.map((c) => c.name)).toEqual(['data-db-0', 'data-db-1', 'data-db-2']);
    const kept = pvOf(at(frames, 99), 'data-db-2')!.records;
    expect(kept).toBeGreaterThan(0);
    expect(pvOf(final!, 'data-db-2')!.records).toBeGreaterThan(kept);
  });

  it('deletes scaled-down claims with whenScaled Delete', () => {
    const { final } = run({ whenScaled: 'Delete' }, [{ at: 40, kind: 'scale', target: 'db', replicas: 1 }]);
    expect(final!.claims.map((c) => c.name)).toEqual(['data-db-0']);
  });

  it('brings a deleted pod back with the same name and claim', () => {
    const { frames, final } = run({}, [{ at: 40, kind: 'delete', object: { kind: 'Pod', name: 'db-1' } }]);
    const before = pvOf(at(frames, 39), 'data-db-1')!;
    expect(final!.pods.map((p) => p.name)).toEqual(['db-0', 'db-1', 'db-2']);
    expect(final!.pods[1]!.createdAt).toBeGreaterThanOrEqual(40);
    expect(pvOf(final!, 'data-db-1')!.name).toBe(before.name);
    expect(pvOf(final!, 'data-db-1')!.records).toBeGreaterThan(before.records);
  });

  it('rolls a new image out from the highest ordinal down', () => {
    const { frames, final } = run({}, [{ at: 40, kind: 'set-image', target: 'db', image: 'postgres:16' }]);
    expect(frames.filter((f) => f.event.kind === 'delete-pod').map((f) => f.event.subjects[0])).toEqual(['db-2', 'db-1', 'db-0']);
    expect(final!.pods.map((p) => p.image)).toEqual(['postgres:16', 'postgres:16', 'postgres:16']);
  });

  it('never creates db-2 while db-1 is not ready, and the run still ends', () => {
    const result = run({}, [], [{ kind: 'crash', prefix: 'db-1', afterS: 1, exitCode: 1 }]);
    expect(result.final!.pods.map((p) => p.name)).toEqual(['db-0', 'db-1']);
    expect(result.endedAt).toBe(150);
  });
});
