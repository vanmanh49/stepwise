import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf } from '../fixtures.testutil';
import type { Action, Database, Frame } from '../model';
import { simulate } from '../sim';

const database = (spec: Partial<Database['spec']> = {}): Database => ({ kind: 'Database', name: 'db', spec: { replicas: 3, version: 15, backup: true, ...spec } });
const run = (actions: Action[] = [], crd = true) =>
  simulate({
    nodes: nodesOf(3),
    actions: [
      { at: 0, kind: 'apply', object: { kind: 'StorageClass', name: 'standard', reclaimPolicy: 'Delete' } },
      ...(crd ? [{ at: 0, kind: 'apply' as const, object: { kind: 'CustomResourceDefinition' as const, name: 'databases.example.com', group: 'example.com', resource: 'Database' as const } }] : []),
      { at: 0, kind: 'apply', object: deploymentOf('db-operator', 1) },
      { at: 1, kind: 'apply', object: database() },
      ...actions,
    ],
    faults: [],
    until: 200,
    runToEnd: true,
  });
const dbPods = (f: Frame['state']) => f.pods.filter((p) => p.ownerKind === 'StatefulSet');

describe('Database operator', () => {
  it('refuses a Database before its CRD is installed, so nothing is built', () => {
    const { frames, final } = run([], false);
    expect(frames.some((f) => f.event.kind === 'refuse-write' && f.event.reason!.startsWith('no matches for kind "Database"'))).toBe(true);
    expect(final!.statefulSets).toEqual([]);
  });

  it('builds a Secret, a Service and a StatefulSet, and reports Ready', () => {
    const { frames, final } = run();
    expect(final!.secrets.map((s) => s.name)).toEqual(['db-credentials']);
    expect(final!.services.map((s) => s.name)).toEqual(['db']);
    expect(final!.statefulSets[0]).toMatchObject({ name: 'db', replicas: 3, serviceName: 'db' });
    expect(dbPods(final!).map((p) => [p.name, p.image])).toEqual([
      ['db-0', 'postgres:15'],
      ['db-1', 'postgres:15'],
      ['db-2', 'postgres:15'],
    ]);
    const phases = frames.map((f) => f.state.databases[0]?.status?.phase).filter(Boolean);
    expect(phases[0]).toBe('Creating');
    expect(final!.databases[0]!.status).toMatchObject({ phase: 'Ready', version: 15 });
  });

  it('puts a hand-scaled StatefulSet back to the spec', () => {
    const { frames, final } = run([{ at: 70, kind: 'scale', target: 'db', replicas: 1 }]);
    expect(frames.some((f) => f.event.by === 'operator' && f.event.text.includes('sets it back to 3'))).toBe(true);
    expect(final!.statefulSets[0]!.replicas).toBe(3);
  });

  it('backs up before an upgrade, and upgrades only once the backup is Complete', () => {
    const { frames, final } = run([{ at: 70, kind: 'apply', object: database({ version: 16 }) }]);
    const backedUp = frames.find((f) => f.state.jobs.some((j) => j.name === 'db-backup-16' && j.status.condition === 'Complete'))!.event.t;
    const firstNew = frames.find((f) => dbPods(f.state).some((p) => p.image === 'postgres:16'))!.event.t;
    expect(firstNew).toBeGreaterThan(backedUp);
    expect(frames.some((f) => f.state.databases[0]?.status?.phase === 'BackingUp')).toBe(true);
    expect(dbPods(final!).map((p) => p.image)).toEqual(['postgres:16', 'postgres:16', 'postgres:16']);
    expect(final!.databases[0]!.status).toMatchObject({ phase: 'Ready', version: 16 });
  });

  it('upgrades at once without a backup', () => {
    const { frames } = run([{ at: 70, kind: 'apply', object: database({ version: 16, backup: false }) }]);
    expect(frames.flatMap((f) => f.state.jobs)).toEqual([]);
    expect(frames.find((f) => f.state.statefulSets[0]?.template.image === 'postgres:16')!.event.t).toBeLessThanOrEqual(72);
  });

  it('changes nothing while the operator is down, then catches up in one pass', () => {
    const { frames, final } = run([
      { at: 60, kind: 'scale', target: 'db-operator', replicas: 0 },
      { at: 70, kind: 'apply', object: database({ replicas: 5 }) },
      { at: 100, kind: 'scale', target: 'db-operator', replicas: 1 },
    ]);
    const resized = frames.find((f) => f.state.statefulSets[0]?.replicas === 5)!.event.t;
    expect(resized).toBeGreaterThan(100);
    expect(final!.statefulSets[0]!.replicas).toBe(5);
  });
});
