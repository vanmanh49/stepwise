import type { Env } from '../env';
import { PROVISION_S, type PersistentVolume, type Pod } from '../model';
import type { Store } from '../store';

const finished = (p: Pod) => p.phase === 'Completed' || p.phase === 'Failed';

/** The PersistentVolumeClaims a pod mounts. */
export const claimsOf = (pod: Pod) => (pod.volumes ?? []).flatMap((v) => ('claim' in v ? [v.claim] : []));

/** Pods still using a claim: anything not finished, wherever it is in its life. */
export const usersOf = (pods: Pod[], claim: string) => pods.filter((p) => !finished(p) && claimsOf(p).includes(claim));

const by = { by: 'controllers' as const };
const smallestFirst = (a: PersistentVolume, b: PersistentVolume) => a.capacityGi - b.capacityGi || (a.name < b.name ? -1 : 1);

/**
 * The PV controller, level-triggered: finishes deletions of claims no pod uses any more, reclaims volumes whose claim
 * is gone, binds each Pending claim to the smallest free volume that fits, or asks its StorageClass for a new one.
 */
export function reconcileVolumes(env: Env, provisioning: Set<string>) {
  const { store } = env;
  const pods = store.list('Pod');
  for (const pvc of store.list('PersistentVolumeClaim')) {
    if (!pvc.deleting || usersOf(pods, pvc.name).length > 0) continue;
    env.apply({ write: { op: 'delete', object: pvc }, event: { kind: 'reclaim', ...by, subjects: [pvc.name], text: `No pod uses PVC ${pvc.name} any more, so its deletion goes through` } });
  }
  const claims = store.list('PersistentVolumeClaim');
  for (const v of store.list('PersistentVolume')) {
    if (v.phase !== 'Bound' || claims.some((c) => c.name === v.claim)) continue;
    if (v.reclaimPolicy === 'Delete') {
      env.apply({ write: { op: 'delete', object: v }, event: { kind: 'reclaim', ...by, subjects: [v.name], text: `PVC ${v.claim} is gone and ${v.name}'s reclaimPolicy is Delete: the volume and its ${v.records} records are deleted` } });
    } else {
      const { claim: _claim, ...rest } = v;
      env.apply({ write: { op: 'update', object: { ...rest, phase: 'Released' } }, event: { kind: 'reclaim', ...by, subjects: [v.name], text: `PVC ${v.claim} is gone and ${v.name}'s reclaimPolicy is Retain: the volume is Released and keeps its ${v.records} records` } });
    }
  }
  const free = store.list('PersistentVolume').filter((v) => v.phase === 'Available' && !v.claim);
  for (const pvc of claims) {
    if (pvc.phase !== 'Pending' || pvc.deleting) continue;
    const fit = free.filter((v) => v.storageClass === pvc.storageClass && v.accessMode === pvc.accessMode && v.capacityGi >= pvc.requestGi).toSorted(smallestFirst)[0];
    if (fit) {
      free.splice(free.indexOf(fit), 1);
      // The volume half of the bind is written quietly; the claim's write is the step, and its snapshot shows both.
      store.write({ op: 'update', object: { ...fit, phase: 'Bound', claim: pvc.name } });
      env.apply({ write: { op: 'update', object: { ...pvc, phase: 'Bound', volume: fit.name } }, event: { kind: 'bind-volume', ...by, subjects: [pvc.name, fit.name], text: `PVC ${pvc.name} (${pvc.requestGi}Gi ${pvc.accessMode}) is bound to ${fit.name} (${fit.capacityGi}Gi), the smallest volume that fits` } });
      continue;
    }
    const cls = pvc.storageClass ? store.get('StorageClass', pvc.storageClass) : undefined;
    if (cls) {
      if (provisioning.has(pvc.name)) continue;
      provisioning.add(pvc.name);
      env.later(PROVISION_S, { kind: 'provision', claim: pvc.name });
      env.apply({ event: { kind: 'bind-volume', ...by, subjects: [pvc.name], text: `No volume fits PVC ${pvc.name}, so it waits for StorageClass ${cls.name} to provision one` } });
      continue;
    }
    const why = pvc.storageClass ? `storageclass.storage.k8s.io "${pvc.storageClass}" not found` : 'no persistent volumes available for this claim and no storage class is set';
    env.apply({ event: { kind: 'bind-volume', ...by, subjects: [pvc.name], text: `PVC ${pvc.name} is Pending: ${why}`, reason: why } });
  }
}

/** The provisioner's answer: a new volume sized to the claim, bound to it. */
export function provision(env: Env, claim: string, provisioning: Set<string>) {
  provisioning.delete(claim);
  const pvc = env.store.get('PersistentVolumeClaim', claim);
  const cls = pvc?.storageClass ? env.store.get('StorageClass', pvc.storageClass) : undefined;
  if (!pvc || pvc.phase !== 'Pending' || !cls) return;
  const name = `pvc-${claim}`;
  if (!env.store.write({ op: 'create', object: { kind: 'PersistentVolume', name, capacityGi: pvc.requestGi, accessMode: pvc.accessMode, storageClass: cls.name, reclaimPolicy: cls.reclaimPolicy, phase: 'Bound', claim, records: 0 } }).ok) return;
  env.apply({ write: { op: 'update', object: { ...pvc, phase: 'Bound', volume: name } }, event: { kind: 'provision', ...by, subjects: [claim, name], text: `StorageClass ${cls.name} creates ${name} (${pvc.requestGi}Gi ${pvc.accessMode}, reclaimPolicy ${cls.reclaimPolicy}) and PVC ${claim} is bound to it` } });
}

/** Whether a pod's volumes can be attached to its node: a ReadWriteOnce volume serves one node at a time. */
export function attachFor(store: Store, pod: Pod): { ok: true; volumes: PersistentVolume[] } | { ok: false; reason: string } {
  const pods = store.list('Pod');
  const volumes: PersistentVolume[] = [];
  for (const claim of claimsOf(pod)) {
    const pvc = store.get('PersistentVolumeClaim', claim);
    const pv = pvc?.volume ? store.get('PersistentVolume', pvc.volume) : undefined;
    if (!pv) return { ok: false, reason: `PVC ${claim} is not bound to a volume` };
    if (pv.accessMode === 'ReadWriteOnce' && pv.attachedTo && pv.attachedTo !== pod.node) {
      const users = usersOf(pods, claim).filter((p) => p.name !== pod.name && p.node === pv.attachedTo);
      if (users.length > 0) return { ok: false, reason: `Multi-Attach error for volume "${pv.name}": Volume is already used by pod(s) ${users.map((p) => p.name).join(', ')}` };
    }
    volumes.push(pv);
  }
  return { ok: true, volumes };
}

/** Volumes stay attached while a pod on their node still uses them. */
export function detachIdle(env: Env) {
  const pods = env.store.list('Pod');
  for (const pv of env.store.list('PersistentVolume')) {
    if (!pv.attachedTo) continue;
    if (pv.claim && usersOf(pods, pv.claim).some((p) => p.node === pv.attachedTo)) continue;
    const { attachedTo, ...rest } = pv;
    env.apply({ write: { op: 'update', object: rest }, event: { kind: 'attach', by: 'kubelet', node: attachedTo, subjects: [pv.name], text: `${pv.name} is detached from ${attachedTo}: no pod there uses it` } });
  }
}
