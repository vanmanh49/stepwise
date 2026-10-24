import { podName } from '../names';
import type { Pod } from '../model';
import type { Change, Reconcile } from './types';

/** Which surplus pod goes first: unscheduled, then not ready, then the newest; ties to the lowest name. */
function deletionOrder(a: Pod, b: Pod): number {
  const rank = (p: Pod) => (!p.node ? 0 : !p.ready ? 1 : 2);
  return rank(a) - rank(b) || b.createdAt - a.createdAt || (a.name < b.name ? -1 : 1);
}

export const reconcileReplicaSets: Reconcile = (ctx) => {
  // Every deletion goes before any creation, so the pod count never passes what the sets ask for in total.
  const deletes: Change[] = [];
  const creates: Change[] = [];
  const notes: Change[] = [];
  const pods = ctx.store.list('Pod');
  for (const rs of ctx.store.list('ReplicaSet')) {
    const mine = pods.filter((p) => p.owner === rs.name && (p.ownerKind ?? 'ReplicaSet') === 'ReplicaSet');
    const seen = `ReplicaSet ${rs.name} sees ${mine.length} of ${rs.replicas} pods`;
    if (mine.length < rs.replicas) {
      const taken = new Set<string>();
      for (let i = mine.length; i < rs.replicas; i++) {
        const name = podName(ctx, rs.name, taken);
        const pod: Pod = { ...structuredClone(rs.template), kind: 'Pod', name, owner: rs.name, phase: 'Pending', ready: false, restarts: 0, createdAt: ctx.now };
        creates.push({ write: { op: 'create', object: pod }, event: { kind: 'create-pod', by: 'controllers', subjects: [name, rs.name], text: `${seen} and creates ${name}` } });
      }
    } else if (mine.length > rs.replicas) {
      for (const pod of mine.toSorted(deletionOrder).slice(0, mine.length - rs.replicas)) {
        deletes.push({ write: { op: 'delete', object: pod }, event: { kind: 'delete-pod', by: 'controllers', subjects: [pod.name, rs.name], text: `${seen} and deletes ${pod.name}` } });
      }
    } else {
      notes.push({ event: { kind: 'reconcile', by: 'controllers', subjects: [rs.name], text: `${seen}: nothing to do` } });
    }
  }
  return [...deletes, ...creates, ...notes];
};
