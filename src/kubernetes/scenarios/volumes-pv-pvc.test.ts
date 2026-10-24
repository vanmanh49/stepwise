import { describe, expect, it } from 'vitest';
import type { Frame } from '../model';
import { simulate } from '../sim';
import { volumesPvPvcScenario, volumesPvPvcSteps } from './volumes-pv-pvc';

const pvc = { volume: 'PVC', provisioning: 'static PV', reclaim: 'Retain', replicas: '1', at60: 'nothing' };
const run = (values: Partial<typeof pvc>) => {
  const read = volumesPvPvcScenario({ ...pvc, ...values });
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value);
};
const at = (frames: Frame[], t: number) => frames.filter((f) => f.event.t <= t).at(-1)!.state;

describe('Volumes, PV & PVC', () => {
  it('loses the data on an emptyDir when the pod is replaced', () => {
    const { frames } = run({ volume: 'emptyDir' });
    const old = at(frames, 39).pods[0]!;
    expect(old.records).toBeGreaterThan(0);
    const fresh = frames.find((f) => f.event.kind === 'start' && f.event.t > 40)!.state.pods.find((p) => p.name !== old.name)!;
    expect(fresh.records ?? 0).toBe(0);
  });

  it('keeps the data on a PVC when the pod is replaced', () => {
    const { frames, final } = run({});
    const before = at(frames, 39).volumes[0]!.records;
    expect(before).toBeGreaterThan(0);
    expect(final!.pods[0]!.name).not.toBe(at(frames, 39).pods[0]!.name);
    expect(final!.volumes[0]!.records).toBeGreaterThan(before);
  });

  it('leaves the claim and the pod Pending with no PV and no StorageClass', () => {
    const { final } = run({ provisioning: 'none' });
    expect(final!.claims[0]!.phase).toBe('Pending');
    expect(final!.pods.every((p) => !p.node)).toBe(true);
  });

  it('provisions a volume from the StorageClass', () => {
    const { frames, final } = run({ provisioning: 'StorageClass' });
    expect(frames.some((f) => f.event.kind === 'provision')).toBe(true);
    expect(final!.volumes[0]!.name).toBe('pvc-data');
  });

  it('deletes or keeps the volume when the claim goes, by reclaimPolicy', () => {
    expect(run({ at60: 'scale to 0, delete PVC', reclaim: 'Delete' }).final!.volumes).toEqual([]);
    const kept = run({ at60: 'scale to 0, delete PVC' }).final!.volumes[0]!;
    expect(kept.phase).toBe('Released');
    expect(kept.records).toBeGreaterThan(0);
  });

  it('holds a second replica on another node with a Multi-Attach error', () => {
    const { frames } = run({ replicas: '2' });
    expect(frames.some((f) => f.event.kind === 'attach-fail' && f.event.reason!.startsWith('Multi-Attach error'))).toBe(true);
    const views = volumesPvPvcSteps({ ...pvc, replicas: '2' }).map((s) => s.view as import('../../types/visualization').ClusterView);
    expect(views.some((v) => v.nodes.some((n) => n.pods.some((p) => p.note?.startsWith('Multi-Attach error'))))).toBe(true);
  });

  it('refuses out-of-range values', () => {
    for (const bad of [{ volume: 'nfs' }, { replicas: '3' }, { reclaim: 'Recycle' }]) {
      const steps = volumesPvPvcSteps({ ...pvc, ...bad });
      expect(steps).toHaveLength(1);
      expect(steps[0]!.title).toBe("Can't set up this storage");
    }
  });
});
