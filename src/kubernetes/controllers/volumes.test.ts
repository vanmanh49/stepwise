import { describe, expect, it } from 'vitest';
import { deploymentOf, nodesOf } from '../fixtures.testutil';
import { PROVISION_S, type Action, type Frame, type PersistentVolume, type PersistentVolumeClaim, type Scenario, type Volume } from '../model';
import { simulate } from '../sim';

const pv = (name: string, capacityGi: number, extra: Partial<PersistentVolume> = {}): PersistentVolume => ({ kind: 'PersistentVolume', name, capacityGi, accessMode: 'ReadWriteOnce', reclaimPolicy: 'Retain', phase: 'Available', records: 0, ...extra });
const claim = (extra: Partial<PersistentVolumeClaim> = {}): PersistentVolumeClaim => ({ kind: 'PersistentVolumeClaim', name: 'data', requestGi: 1, accessMode: 'ReadWriteOnce', phase: 'Pending', ...extra });
const standard = { kind: 'StorageClass' as const, name: 'standard', reclaimPolicy: 'Delete' as const };

function db(replicas = 1, volume: Volume = { name: 'data', claim: 'data' }) {
  const d = deploymentOf('db', replicas);
  d.template.volumes = [volume];
  return d;
}

const scenario = (objects: Action[], more: Action[] = [], replicas = 1): Scenario => ({
  nodes: nodesOf(2),
  actions: [...objects, { at: 0, kind: 'apply', object: db(replicas) }, ...more],
  faults: [],
  until: 120,
  runToEnd: true,
});
const apply = (...objects: Extract<Action, { kind: 'apply' }>['object'][]): Action[] => objects.map((object) => ({ at: 0, kind: 'apply', object }));
const at = (frames: Frame[], t: number) => frames.filter((f) => f.event.t <= t).at(-1)!.state;

describe('PersistentVolume binding', () => {
  it('binds the smallest volume with the same class and access mode', () => {
    const { final } = simulate(scenario(apply(pv('pv-big', 10), pv('pv-small', 2), pv('pv-rwx', 1, { accessMode: 'ReadWriteMany' }), pv('pv-fast', 1, { storageClass: 'fast' }), claim())));
    expect(final!.claims[0]).toMatchObject({ phase: 'Bound', volume: 'pv-small' });
    expect(final!.volumes.find((v) => v.name === 'pv-small')).toMatchObject({ phase: 'Bound', claim: 'data' });
    expect(final!.pods[0]!.phase).toBe('Running');
  });

  it('leaves the claim and its pod Pending when nothing fits and no class is set', () => {
    const { frames, final } = simulate(scenario(apply(claim())));
    expect(final!.claims[0]!.phase).toBe('Pending');
    expect(frames.some((f) => f.event.text.includes('no persistent volumes available for this claim and no storage class is set'))).toBe(true);
    expect(final!.pods[0]!.node).toBeUndefined();
    expect(final!.pods[0]!.reason).toContain('pod has unbound immediate PersistentVolumeClaims');
  });

  it('provisions a volume from the StorageClass after a short delay', () => {
    const { frames, final } = simulate(scenario(apply(standard, claim({ storageClass: 'standard' }))));
    const provision = frames.find((f) => f.event.kind === 'provision')!;
    expect(provision.event.t).toBe(1 + PROVISION_S);
    expect(final!.volumes[0]).toMatchObject({ name: 'pvc-data', phase: 'Bound', claim: 'data', reclaimPolicy: 'Delete' });
    expect(final!.pods[0]!.phase).toBe('Running');
  });
});

describe('Data on volumes', () => {
  it("keeps a PVC's records when the pod is replaced", () => {
    const { frames, final } = simulate(scenario(apply(pv('pv-1', 1), claim()), [{ at: 40, kind: 'delete-pods', owner: at(simulate(scenario(apply(pv('pv-1', 1), claim()))).frames, 10).replicaSets[0]!.name, count: 1 }]));
    const before = at(frames, 39).volumes[0]!.records;
    expect(before).toBeGreaterThan(0);
    expect(final!.volumes[0]!.records).toBeGreaterThan(before);
  });

  it("loses an emptyDir's records with its pod", () => {
    const base = scenario([], [], 1);
    (base.actions[0] as Extract<Action, { kind: 'apply' }>).object = db(1, { name: 'scratch', emptyDir: true });
    const rs = at(simulate(base).frames, 10).replicaSets[0]!.name;
    const { frames } = simulate({ ...base, actions: [...base.actions, { at: 40, kind: 'delete-pods', owner: rs, count: 1 }] });
    const old = at(frames, 39).pods[0]!;
    expect(old.records).toBeGreaterThan(0);
    const replacement = frames.find((f) => f.event.kind === 'start' && f.event.t > 40)!.state.pods.find((p) => p.name !== old.name)!;
    expect(replacement.records ?? 0).toBe(0);
  });
});

describe('Reclaiming volumes', () => {
  const released = (policy: 'Delete' | 'Retain') =>
    simulate(scenario(apply(pv('pv-1', 1, { reclaimPolicy: policy }), claim()), [{ at: 40, kind: 'scale', target: 'db', replicas: 0 }, { at: 50, kind: 'delete', object: { kind: 'PersistentVolumeClaim', name: 'data' } }]));

  it('deletes the volume and its data with reclaimPolicy Delete', () => {
    const { final, frames } = released('Delete');
    expect(final!.volumes).toEqual([]);
    expect(frames.some((f) => f.event.kind === 'reclaim')).toBe(true);
  });

  it('keeps the volume Released, data and all, with reclaimPolicy Retain', () => {
    const { final } = released('Retain');
    expect(final!.volumes[0]).toMatchObject({ phase: 'Released' });
    expect(final!.volumes[0]!.records).toBeGreaterThan(0);
  });

  it('only marks a claim a running pod still uses, and deletes it once the pod is gone', () => {
    const { frames, final } = simulate(scenario(apply(pv('pv-1', 1), claim()), [{ at: 30, kind: 'delete', object: { kind: 'PersistentVolumeClaim', name: 'data' } }, { at: 60, kind: 'scale', target: 'db', replicas: 0 }]));
    const during = at(frames, 45);
    expect(during.claims[0]).toMatchObject({ deleting: true, phase: 'Bound' });
    expect(during.volumes[0]!.records).toBeGreaterThan(0);
    expect(final!.claims).toEqual([]);
    expect(final!.volumes[0]!.phase).toBe('Released');
  });
});

describe('Attaching ReadWriteOnce volumes', () => {
  it('holds a second pod on another node with a Multi-Attach error, retrying quietly', () => {
    const { frames } = simulate(scenario(apply(pv('pv-1', 1), claim()), [], 2));
    const fails = frames.filter((f) => f.event.kind === 'attach-fail');
    expect(fails).toHaveLength(1);
    const stuck = fails[0]!.state.pods.find((p) => p.name === fails[0]!.event.subjects[0])!;
    expect(stuck.phase).toBe('ContainerCreating');
    expect(stuck.reason).toMatch(/^Multi-Attach error for volume "pv-1": Volume is already used by pod\(s\) db-/);
    expect(frames.at(-1)!.state.pods.filter((p) => p.phase === 'Running')).toHaveLength(1);
  });

  it('forgets a waiting pod once it is deleted', () => {
    const { frames } = simulate(scenario(apply(pv('pv-1', 1), claim()), [{ at: 30, kind: 'scale', target: 'db', replicas: 1 }], 2));
    const stuck = frames.find((f) => f.event.kind === 'attach-fail')!.event.subjects[0]!;
    const deleted = frames.findIndex((f) => f.event.kind === 'delete-pod' && f.event.subjects[0] === stuck);
    expect(deleted).toBeGreaterThan(-1);
    expect(frames.slice(deleted + 1).some((f) => f.event.subjects.includes(stuck))).toBe(false);
  });
});
