import type { Pod } from '../model';
import type { Change, Reconcile } from './types';

/** Pods that no longer use their node's CPU. */
const finished = (p: Pod) => p.phase === 'Completed' || p.phase === 'Failed';

/** Phase 1 rule: a Ready node with room for the pod's CPU request, the most free CPU first, ties to the lowest name. */
export const schedule: Reconcile = (ctx) => {
  const changes: Change[] = [];
  const nodes = ctx.store.list('Node');
  const pods = ctx.store.list('Pod');
  const free = new Map(nodes.map((n) => [n.name, n.cpu - pods.filter((p) => p.node === n.name && !finished(p)).reduce((sum, p) => sum + p.cpu, 0)]));
  const unbound = pods.filter((p) => !p.node && !finished(p)).toSorted((a, b) => a.createdAt - b.createdAt || (a.name < b.name ? -1 : 1));
  for (const pod of unbound) {
    const ready = nodes.filter((n) => n.ready);
    const fits = ready.filter((n) => free.get(n.name)! >= pod.cpu);
    const best = fits.toSorted((a, b) => free.get(b.name)! - free.get(a.name)! || (a.name < b.name ? -1 : 1))[0];
    if (best) {
      const left = free.get(best.name)!;
      free.set(best.name, left - pod.cpu);
      const { reason: _, ...bound } = pod;
      changes.push({
        write: { op: 'update', object: { ...bound, node: best.name } },
        event: { kind: 'bind', by: 'scheduler', node: best.name, subjects: [pod.name, best.name], text: `scheduler binds ${pod.name} to ${best.name} (${left} of ${best.cpu} CPU free)` },
      });
      continue;
    }
    const reason = ready.length === 0 ? `0/${nodes.length} nodes are Ready` : `0/${nodes.length} nodes have ${pod.cpu} CPU free`;
    if (pod.reason === reason) continue;
    changes.push({
      write: { op: 'update', object: { ...pod, reason } },
      event: { kind: 'unschedulable', by: 'scheduler', subjects: [pod.name], text: `scheduler can't place ${pod.name}: ${reason}`, reason },
    });
  }
  return changes;
};
