import type { Pod, PersistentVolumeClaim, StatefulSet } from '../model';
import type { Change, Ctx, Reconcile } from './types';

/** The label Kubernetes puts on each pod to say which template revision it runs. */
export const REVISION = 'controller-revision-hash';

const ordinal = (set: StatefulSet, pod: Pod) => Number(pod.name.slice(set.name.length + 1));
const up = (p: Pod) => p.phase === 'Running' && p.ready;
const claimName = (claim: string, set: string, i: number) => `${claim}-${set}-${i}`;

function newPod(ctx: Ctx, set: StatefulSet, i: number): Pod {
  const name = `${set.name}-${i}`;
  const t = structuredClone(set.template);
  const volumes = [...(t.volumes ?? []), ...(set.claims ?? []).map((c) => ({ name: c.name, claim: claimName(c.name, set.name, i) }))];
  return { ...t, ...(volumes.length > 0 && { volumes }), labels: { ...t.labels, [REVISION]: String(set.revision) }, kind: 'Pod', name, owner: set.name, ownerKind: 'StatefulSet', phase: 'Pending', ready: false, restarts: 0, createdAt: ctx.now };
}

/**
 * Pods with stable names (db-0, db-1, …), each with its own claims. OrderedReady changes one pod at a time, creating
 * upwards only once every lower pod is ready and removing from the top; Parallel creates and removes all at once.
 * Updates replace one pod at a time from the highest ordinal down.
 */
export const reconcileStatefulSets: Reconcile = (ctx) => {
  const changes: Change[] = [];
  const pods = ctx.store.list('Pod');
  for (const set of ctx.store.list('StatefulSet')) {
    const mine = pods.filter((p) => p.owner === set.name && p.ownerKind === 'StatefulSet').toSorted((a, b) => ordinal(set, a) - ordinal(set, b));
    const ordered = set.podManagementPolicy === 'OrderedReady';
    const by = (pod: string) => ({ by: 'controllers' as const, subjects: [pod, set.name] });
    const before = changes.length;

    // Scale down from the top: OrderedReady removes one pod, and only while every pod below it is ready.
    const extra = mine.filter((p) => ordinal(set, p) >= set.replicas).toReversed();
    for (const pod of ordered ? extra.slice(0, 1) : extra) {
      if (ordered && mine.some((p) => ordinal(set, p) < ordinal(set, pod) && !up(p))) break;
      changes.push({ write: { op: 'delete', object: pod }, event: { kind: 'delete-pod', ...by(pod.name), text: `StatefulSet ${set.name} wants ${set.replicas}, so it deletes ${pod.name}, the highest ordinal` } });
      if (set.whenScaled === 'Delete') {
        for (const c of set.claims ?? []) {
          const pvc = ctx.store.get('PersistentVolumeClaim', claimName(c.name, set.name, ordinal(set, pod)));
          if (pvc) changes.push({ write: { op: 'delete', object: pvc }, event: { kind: 'reclaim', ...by(pod.name), subjects: [pvc.name, set.name], text: `whenScaled is Delete, so PVC ${pvc.name} goes with ${pod.name}` } });
        }
      }
    }
    if (changes.length > before) continue;

    // Create missing ordinals, with their claims; OrderedReady waits for every lower pod to be ready.
    for (let i = 0; i < set.replicas; i++) {
      const pod = mine.find((p) => ordinal(set, p) === i);
      if (pod) {
        if (ordered && !up(pod)) break;
        continue;
      }
      for (const c of set.claims ?? []) {
        const name = claimName(c.name, set.name, i);
        if (ctx.store.get('PersistentVolumeClaim', name)) continue;
        const pvc: PersistentVolumeClaim = { kind: 'PersistentVolumeClaim', name, requestGi: c.requestGi, accessMode: 'ReadWriteOnce', storageClass: c.storageClass, phase: 'Pending', owner: set.name };
        changes.push({ write: { op: 'create', object: pvc }, event: { kind: 'create-claim', ...by(name), text: `StatefulSet ${set.name} creates PVC ${name} for ${set.name}-${i}` } });
      }
      const created = newPod(ctx, set, i);
      changes.push({ write: { op: 'create', object: created }, event: { kind: 'create-pod', ...by(created.name), text: `StatefulSet ${set.name} has ${mine.length} of ${set.replicas} pods and creates ${created.name}` } });
      if (ordered) break;
    }
    if (changes.length > before) continue;

    // Rolling update: once all pods are ready, replace the highest outdated one.
    if (mine.length === set.replicas && mine.every(up)) {
      const outdated = mine.toReversed().find((p) => p.labels[REVISION] !== String(set.revision));
      if (outdated) changes.push({ write: { op: 'delete', object: outdated }, event: { kind: 'delete-pod', ...by(outdated.name), text: `StatefulSet ${set.name} updates from the top: it replaces ${outdated.name} with one running ${set.template.image}` } });
    }
  }
  return changes;
};
