import { readChoice, type Read } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Action, PersistentVolumeClaim, Scenario } from '../model';
import { deployment, scenarioSteps } from './shared';

export const volumesPvPvcCode = `// PV controller: find each Pending claim a volume
const pv = smallest(freeVolumes, fits(claim))   // class, access mode, size
if (pv) bind(claim, pv)
else if (claim.storageClass) provision(claim)   // a new volume, made to fit
else wait(claim)                                // Pending: the pod can't be scheduled

// kubelet, before the container starts
attach(pv, node)       // ReadWriteOnce: one node at a time (Multi-Attach error)
// the app writes 1 record per second: to the PV, or to an emptyDir inside the pod

// the claim is deleted
if (pv.reclaimPolicy === 'Delete') deleteVolume(pv) // the data is gone
else pv.phase = 'Released'                          // kept for someone to recover`;

export const VOLUME = ['PVC', 'emptyDir'];
export const PROVISIONING = ['static PV', 'StorageClass', 'none'];
export const RECLAIM = ['Retain', 'Delete'];
export const REPLICAS = ['1', '2'];
export const AT_60 = ['nothing', 'scale to 0, delete PVC'];

export function volumesPvPvcScenario(values: Record<string, string>): Read<Scenario> {
  const volume = readChoice(values, 'volume', 'Volume', VOLUME);
  if (!volume.ok) return volume;
  const provisioning = readChoice(values, 'provisioning', 'Provisioning', PROVISIONING);
  if (!provisioning.ok) return provisioning;
  const reclaim = readChoice(values, 'reclaim', 'reclaimPolicy', RECLAIM);
  if (!reclaim.ok) return reclaim;
  const replicas = readChoice(values, 'replicas', 'Replicas', REPLICAS);
  if (!replicas.ok) return replicas;
  const at60 = readChoice(values, 'at60', 'At 60 s', AT_60);
  if (!at60.ok) return at60;
  const policy = reclaim.value as 'Retain' | 'Delete';
  const claimed = volume.value === 'PVC';
  const db = deployment('db', Number(replicas.value));
  db.template.volumes = [claimed ? { name: 'data', claim: 'data' } : { name: 'scratch', emptyDir: true }];
  const claim: PersistentVolumeClaim = { kind: 'PersistentVolumeClaim', name: 'data', requestGi: 1, accessMode: 'ReadWriteOnce', phase: 'Pending', ...(provisioning.value === 'StorageClass' && { storageClass: 'standard' }) };
  const storage: Action[] = !claimed
    ? []
    : [
        ...(provisioning.value === 'static PV' ? [{ at: 0, kind: 'apply' as const, object: { kind: 'PersistentVolume' as const, name: 'pv-1', capacityGi: 2, accessMode: 'ReadWriteOnce' as const, reclaimPolicy: policy, phase: 'Available' as const, records: 0 } }] : []),
        ...(provisioning.value === 'StorageClass' ? [{ at: 0, kind: 'apply' as const, object: { kind: 'StorageClass' as const, name: 'standard', reclaimPolicy: policy } }] : []),
        { at: 0, kind: 'apply', object: claim },
      ];
  const actions: Action[] = [
    ...storage,
    { at: 0, kind: 'apply', object: db },
    { at: 40, kind: 'delete-pods', owner: 'db', count: 1 },
    ...(at60.value === 'nothing' ? [] : [{ at: 60, kind: 'scale' as const, target: 'db', replicas: 0 }, ...(claimed ? [{ at: 62, kind: 'delete' as const, object: { kind: 'PersistentVolumeClaim' as const, name: 'data' } }] : [])]),
  ];
  return { ok: true, value: { nodes: [{ name: 'node-1', cpu: 4 }, { name: 'node-2', cpu: 4 }], actions, faults: [], until: 90, runToEnd: true } };
}

export function volumesPvPvcSteps(values: Record<string, string>): Step[] {
  return scenarioSteps(volumesPvPvcScenario(values), "Can't set up this storage", {
    code: volumesPvPvcCode,
    focus: 'db',
    lines: { 'bind-volume': 'bind(claim, pv)', provision: 'provision(claim)', attach: 'attach(pv, node)', 'attach-fail': 'attach(pv, node)', unschedulable: 'wait(claim)', records: 'the app writes', reclaim: "pv.reclaimPolicy === 'Delete'" },
    explain: (event) => {
      if (event.kind === 'bind-volume' && event.text.includes('waits for StorageClass')) return { line: 'provision(claim)', why: 'No existing volume fits, but the claim names a StorageClass. Its provisioner creates a volume made to measure, as cloud disks are created on demand.' };
      if (event.kind === 'bind-volume' && event.reason) return { line: 'wait(claim)', why: 'Nothing fits this claim and it names no StorageClass, so it stays Pending. Its pod can\'t be scheduled until a matching PersistentVolume appears.' };
      if (event.kind === 'reclaim' && event.text.includes('Retain')) return { line: "pv.phase = 'Released'", why: 'Retain keeps the volume and its data after the claim is gone. It is Released, not Available: an admin must clean it up or recover the data before anyone can claim it again.' };
      if (event.kind === 'action' && event.text.includes('deletes pod')) return { why: 'The pod is deleted and its ReplicaSet makes a new one. What survives depends on where the data was: a PVC outlives any pod, an emptyDir lives and dies with its pod.' };
      return undefined;
    },
  });
}
