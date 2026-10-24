import { podName } from '../names';
import { nodeLabels, tolerates, type DaemonSet, type NodeObj, type Pod, type Taint, type Toleration } from '../model';
import { REVISION } from './statefulset';
import type { Change, Reconcile } from './types';

const HOSTNAME = 'kubernetes.io/hostname';

/** The tolerations the DaemonSet controller adds to every pod it makes, as Kubernetes does. */
export const DAEMON_TOLERATIONS: Toleration[] = [
  { key: 'node.kubernetes.io/unschedulable', operator: 'Exists', effect: 'NoSchedule' },
  { key: 'node.kubernetes.io/not-ready', operator: 'Exists', effect: 'NoExecute' },
  { key: 'node.kubernetes.io/unreachable', operator: 'Exists', effect: 'NoExecute' },
];

/** Whether a DaemonSet belongs on a node: it matches the nodeSelector and tolerates every taint that would repel it. */
export function daemonEligible(ds: DaemonSet, node: NodeObj): boolean {
  const labels = nodeLabels(node);
  if (Object.entries(ds.nodeSelector ?? {}).some(([k, v]) => labels[k] !== v)) return false;
  return (node.taints ?? []).every((t: Taint) => t.effect === 'PreferNoSchedule' || tolerates(ds.template.tolerations, t));
}

/** The node a daemon pod is pinned to by its node affinity. */
const targetOf = (pod: Pod) => pod.affinity?.node?.required?.find((r) => r.key === HOSTNAME)?.values[0];
const up = (p: Pod) => p.phase === 'Running' && p.ready;

/**
 * One pod per eligible node. New pods are pinned to their node with node affinity and placed by the scheduler.
 * A pod on a node that stops being eligible goes. Updates replace one pod at a time, in node name order.
 */
export const reconcileDaemonSets: Reconcile = (ctx) => {
  const changes: Change[] = [];
  const nodes = ctx.store.list('Node');
  const pods = ctx.store.list('Pod');
  for (const ds of ctx.store.list('DaemonSet')) {
    const mine = pods.filter((p) => p.owner === ds.name && p.ownerKind === 'DaemonSet');
    const by = (pod: string, node?: string) => ({ by: 'controllers' as const, subjects: [pod, ds.name], ...(node && { node }) });
    const before = changes.length;
    const taken = new Set<string>();
    for (const pod of mine) {
      const node = nodes.find((n) => n.name === targetOf(pod));
      if (node && daemonEligible(ds, node)) continue;
      changes.push({ write: { op: 'delete', object: pod }, event: { kind: 'delete-pod', ...by(pod.name, node?.name), text: `DaemonSet ${ds.name} no longer belongs on ${targetOf(pod)}, so it deletes ${pod.name}` } });
    }
    for (const node of nodes) {
      // Only Ready nodes get a new pod; one already on a NotReady node stays, as it tolerates not-ready.
      if (!node.ready || node.booting || !daemonEligible(ds, node) || mine.some((p) => targetOf(p) === node.name)) continue;
      const t = structuredClone(ds.template);
      const name = podName(ctx, ds.name, taken);
      const pod: Pod = {
        ...t,
        labels: { ...t.labels, [REVISION]: String(ds.revision) },
        tolerations: [...(t.tolerations ?? []), ...DAEMON_TOLERATIONS],
        affinity: { ...t.affinity, node: { required: [{ key: HOSTNAME, op: '=', values: [node.name] }] } },
        kind: 'Pod',
        name,
        owner: ds.name,
        ownerKind: 'DaemonSet',
        phase: 'Pending',
        ready: false,
        restarts: 0,
        createdAt: ctx.now,
      };
      changes.push({ write: { op: 'create', object: pod }, event: { kind: 'create-pod', ...by(name, node.name), text: `DaemonSet ${ds.name} has no pod on ${node.name} and creates ${name} for it` } });
    }
    if (changes.length > before) continue;
    // Rolling update, maxUnavailable 1: replace the next outdated pod once every pod is ready.
    if (!mine.every(up)) continue;
    const outdated = mine.toSorted((a, b) => (targetOf(a)! < targetOf(b)! ? -1 : 1)).find((p) => p.labels[REVISION] !== String(ds.revision));
    if (outdated) changes.push({ write: { op: 'delete', object: outdated }, event: { kind: 'delete-pod', ...by(outdated.name, outdated.node), text: `DaemonSet ${ds.name} updates one node at a time: it replaces ${outdated.name} on ${targetOf(outdated)}` } });
  }
  return changes;
};
