import type { ClusterView, Role } from '../types/visualization';
import type { Frame, Pod } from './model';

type Plane = ClusterView['controlPlane'][number];

const PLANE: { id: Plane['id']; label: string }[] = [
  { id: 'api-server', label: 'API server' },
  { id: 'etcd', label: 'etcd' },
  { id: 'scheduler', label: 'scheduler' },
  { id: 'controllers', label: 'controller manager' },
];

const finished = (p: Pod) => p.phase === 'Completed' || p.phase === 'Failed';

function podRole(pod: Pod, touched: Set<string>): Role {
  if (touched.has(pod.name)) return 'active';
  if (pod.phase === 'Completed') return 'sorted';
  if (pod.phase === 'Running' && pod.ready) return 'found';
  if (pod.phase === 'Pending' || pod.phase === 'ContainerCreating' || pod.phase === 'Running') return 'frontier';
  return 'discarded';
}

const restarts = (pod: Pod) => (pod.restarts > 0 ? { badge: `↻ ${pod.restarts}` } : {});

export function emptyClusterView(): ClusterView {
  return { kind: 'cluster', controlPlane: [], nodes: [], pending: [], objects: [], log: [] };
}

/** The cluster after a frame's event, with what that event (and any events merged with it) touched highlighted. */
export function clusterView({ event, state }: Frame, log: string[], merged: Frame[] = []): ClusterView {
  const touched = new Set([event, ...merged.map((f) => f.event)].flatMap((e) => e.subjects));
  const kubeletNodes = new Set([event, ...merged.map((f) => f.event)].flatMap((e) => (e.by === 'kubelet' && e.node ? [e.node] : [])));
  const lit: Plane['id'] | undefined =
    event.kind === 'refuse-write' ? 'etcd' : event.by === 'kubectl' || event.by === 'api-server' ? 'api-server' : event.by === 'scheduler' || event.by === 'controllers' || event.by === 'etcd' ? event.by : undefined;
  const controlPlane = PLANE.map(({ id, label }): Plane =>
    state.down.includes(id) ? { id, label, role: 'discarded', badge: 'down' } : { id, label, role: id === lit ? 'active' : 'default' },
  );
  const nodes = state.nodes.map((node) => {
    const mine = state.pods.filter((p) => p.node === node.name);
    const role: Role = kubeletNodes.has(node.name) ? 'active' : node.ready ? 'default' : 'discarded';
    return {
      name: node.name,
      ready: node.ready,
      ...(state.offline.includes(node.name) && { offline: true }),
      role,
      cpu: { used: mine.filter((p) => !finished(p)).reduce((sum, p) => sum + p.cpu, 0), capacity: node.cpu },
      pods: mine.map((p) => ({ name: p.name, phase: p.phase, ready: p.ready, role: podRole(p, touched), ...restarts(p) })),
    };
  });
  const pending = state.pods.filter((p) => !p.node).map((p) => ({ name: p.name, role: podRole(p, touched), ...(p.reason && { reason: p.reason }) }));

  const podsOf = (owners: Set<string>) => state.pods.filter((p) => p.owner && owners.has(p.owner));
  const row = (kind: string, name: string, desired: number, pods: Pod[], note?: string) => ({
    kind,
    name,
    desired,
    current: pods.length,
    ready: pods.filter((p) => p.ready).length,
    ...(note && { note }),
    role: (desired !== pods.length ? 'active' : 'default') as Role,
  });
  const objects: ClusterView['objects'] = [
    ...state.deployments.map((d) => row('Deployment', d.name, d.replicas, podsOf(new Set(state.replicaSets.filter((rs) => rs.owner === d.name).map((rs) => rs.name))), d.template.image)),
    ...state.replicaSets.map((rs) => row('ReplicaSet', rs.name, rs.replicas, podsOf(new Set([rs.name])), rs.template.image)),
    ...state.services.map((s) => {
      const count = state.endpoints.find((e) => e.name === s.name)?.pods.length ?? 0;
      return { kind: 'Service', name: s.name, note: `${count} endpoint${count === 1 ? '' : 's'}`, role: (touched.has(s.name) ? 'active' : 'default') as Role };
    }),
  ];
  const requests = state.requests.map((r) => ({ id: r.id, label: `to ${r.service}`, status: r.status, ...(r.pod && { endpoint: r.pod }), ...(r.reason && { reason: r.reason }) }));
  return { kind: 'cluster', controlPlane, nodes, pending, objects, ...(requests.length > 0 && { requests }), log };
}
