import type { ClusterView, Role } from '../types/visualization';
import { allowedDisruptions } from './evict';
import { daemonEligible } from './controllers/daemonset';
import { cpuRequestM, memoryRequestMi, NODE_MEMORY_MI, qosOf, type Frame, type Pod, type Snapshot } from './model';
import { formatSelector } from './selector';

type Plane = ClusterView['controlPlane'][number];

const PLANE: { id: Plane['id']; label: string }[] = [
  { id: 'api-server', label: 'API server' },
  { id: 'etcd', label: 'etcd' },
  { id: 'scheduler', label: 'scheduler' },
  { id: 'controllers', label: 'controller manager' },
];

/** Requests listed in the view; older ones fold into counts so the table stays short. */
const REQUEST_ROWS = 10;

const finished = (p: Pod) => p.phase === 'Completed' || p.phase === 'Failed';

function podRole(pod: Pod, touched: Set<string>): Role {
  if (touched.has(pod.name)) return 'active';
  if (pod.phase === 'Completed') return 'sorted';
  if (pod.phase === 'Running' && pod.ready) return 'found';
  if (pod.phase === 'Pending' || pod.phase === 'ContainerCreating' || pod.phase === 'Running') return 'frontier';
  return 'discarded';
}

const restarts = (pod: Pod) => (pod.restarts > 0 ? { badge: `↻ ${pod.restarts}` } : {});

const NOTE: Record<NonNullable<Pod['lastTermination']>, string> = { OOMKilled: 'OOMKilled', Liveness: 'Liveness probe failed', Startup: 'Startup probe failed', Evicted: 'Evicted', Error: 'Error' };

const format = (data: Record<string, string>) =>
  Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
const MODE = { ReadWriteOnce: 'RWO', ReadWriteMany: 'RWX' } as const;
const RULE_ROLE = { match: 'found', deny: 'discarded' } as const;

/** What phase 3 adds to a pod chip: the data it writes and the config it reads, and a StatefulSet pod's DNS name. */
function podStorage(pod: Pod, state: Snapshot) {
  const mounts = [
    ...(pod.volumes ?? []).flatMap((v) => {
      if ('emptyDir' in v) return [`emptyDir · ${pod.records ?? 0} records`];
      if (!('claim' in v)) return [];
      const pvc = state.claims.find((c) => c.name === v.claim);
      const pv = pvc?.volume ? state.volumes.find((x) => x.name === pvc.volume) : undefined;
      return [pv ? `${v.claim} · ${pv.records} records` : `${v.claim} · not bound`];
    }),
    ...(pod.config && Object.keys(pod.config).length > 0 ? [`config: ${format(pod.config)}`] : []),
  ];
  const set = pod.ownerKind === 'StatefulSet' ? state.statefulSets.find((s) => s.name === pod.owner) : undefined;
  return { ...(mounts.length > 0 && { mounts }), ...(set && { dns: `${pod.name}.${set.serviceName}` }) };
}

/** Rows for the phase 3 kinds: storage, config, workloads that aren't Deployments, routing and the custom resource. */
function phase3Rows(state: Snapshot, touched: Set<string>, row: (kind: string, name: string, desired: number, pods: Pod[], note?: string) => ClusterView['objects'][number]): ClusterView['objects'] {
  const plain = (kind: string, name: string, note: string) => ({ kind, name, note, role: (touched.has(name) ? 'active' : 'default') as Role });
  const ownedBy = (kind: Pod['ownerKind'], name: string) => state.pods.filter((p) => p.owner === name && p.ownerKind === kind);
  return [
    ...state.statefulSets.map((s) => row('StatefulSet', s.name, s.replicas, ownedBy('StatefulSet', s.name), s.template.image)),
    ...state.daemonSets.map((d) => row('DaemonSet', d.name, state.nodes.filter((n) => daemonEligible(d, n)).length, ownedBy('DaemonSet', d.name), d.template.image)),
    ...state.jobs.map((j) => {
      const pods = ownedBy('Job', j.name);
      const status = j.status.condition ? (j.status.reason ? `${j.status.condition}: ${j.status.reason}` : j.status.condition) : `${j.status.failed} failed`;
      return { kind: 'Job', name: j.name, desired: j.completions, current: pods.filter((p) => p.phase !== 'Completed' && p.phase !== 'Failed').length, ready: pods.filter((p) => p.phase === 'Completed').length, note: status, role: (touched.has(j.name) || !j.status.condition ? 'active' : 'default') as Role };
    }),
    ...state.cronJobs.map((c) => plain('CronJob', c.name, `${c.schedule}, ${c.concurrencyPolicy}${c.lastScheduled ? `, last ${c.lastScheduled / 60} min` : ''}`)),
    ...state.configMaps.map((c) => plain('ConfigMap', c.name, format(c.data))),
    ...state.secrets.map((s) => plain('Secret', s.name, `${Object.entries(s.data).map(([k, v]) => `${k}: ${btoa(v)}`).join(', ')} (base64, not encrypted)`)),
    ...state.storageClasses.map((c) => plain('StorageClass', c.name, `reclaimPolicy ${c.reclaimPolicy}`)),
    ...state.claims.map((c) =>
      plain('PersistentVolumeClaim', c.name, `${c.phase === 'Bound' ? `Bound to ${c.volume}` : 'Pending'}, ${c.requestGi}Gi ${MODE[c.accessMode]}${c.deleting ? ', Terminating (still in use)' : ''}`),
    ),
    ...state.volumes.map((v) =>
      plain('PersistentVolume', v.name, `${v.phase === 'Bound' ? `Bound to ${v.claim}` : v.phase}, ${v.capacityGi}Gi ${MODE[v.accessMode]}, ${v.records} records${v.attachedTo ? `, attached to ${v.attachedTo}` : ''}`),
    ),
    ...state.ingresses.map((i) => {
      const paths = i.rules.reduce((s, r) => s + r.paths.length, 0);
      return plain('Ingress', i.name, state.ingressController ? `${paths} path${paths === 1 ? '' : 's'}${i.defaultBackend ? `, default ${i.defaultBackend}` : ''}` : 'no address: no ingress controller');
    }),
    ...state.networkPolicies.map((p) => plain('NetworkPolicy', p.name, `selects ${p.podSelector.length === 0 ? 'all pods' : formatSelector(p.podSelector)}, ${p.policyTypes.join(' + ')}`)),
    ...state.crds.map((c) => plain('CustomResourceDefinition', c.name, `adds kind ${c.resource}`)),
    ...state.databases.map((d) => {
      const ready = state.pods.filter((p) => p.owner === d.name && p.ownerKind === 'StatefulSet' && p.phase === 'Running' && p.ready).length;
      return { kind: 'Database', name: d.name, desired: d.spec.replicas, ready, note: `${d.status?.phase ?? 'new'}, v${d.status?.version ?? d.spec.version}`, role: (touched.has(d.name) ? 'active' : 'default') as Role };
    }),
  ];
}

/** What phase 2 adds to a pod chip, only when there is something to show. */
function podExtras(pod: Pod) {
  const note = pod.throttled ? 'throttled' : pod.lastTermination ? NOTE[pod.lastTermination] : undefined;
  return {
    ...(pod.cpuUsage !== undefined && { cpu: { used: pod.cpuUsage, ...(pod.resources?.cpu?.request !== undefined && { request: pod.resources.cpu.request }), ...(pod.resources?.cpu?.limit !== undefined && { limit: pod.resources.cpu.limit }) } }),
    ...(pod.resources && { qos: qosOf(pod.resources) }),
    ...(note && { note }),
  };
}

export function emptyClusterView(): ClusterView {
  return { kind: 'cluster', controlPlane: [], nodes: [], pending: [], objects: [], log: [] };
}

/** The cluster after a frame's event, with what that event (and any events merged with it) touched highlighted. */
export function clusterView({ event, state }: Frame, log: string[], merged: Frame[] = []): ClusterView {
  const breakdown = [event, ...merged.map((f) => f.event)].find((e) => e.breakdown)?.breakdown;
  const ruleTable = [event, ...merged.map((f) => f.event)].find((e) => e.rules)?.rules;
  const rules = ruleTable && { ...ruleTable, rows: ruleTable.rows.map((r) => ({ cells: r.cells, role: (r.mark ? RULE_ROLE[r.mark] : 'default') as Role })) };
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
    const live = mine.filter((p) => !finished(p));
    const reportsMemory = node.memory !== undefined || live.some((p) => p.memoryUsage !== undefined);
    return {
      name: node.name,
      ready: node.ready,
      ...(state.offline.includes(node.name) && { offline: true }),
      role,
      cpu: { used: Number((live.reduce((sum, p) => sum + cpuRequestM(p), 0) / 1000).toFixed(2)), capacity: node.cpu },
      ...(reportsMemory && { memory: { used: live.reduce((sum, p) => sum + (p.memoryUsage ?? memoryRequestMi(p)), 0), capacity: node.memory ?? NODE_MEMORY_MI } }),
      ...(node.labels && Object.keys(node.labels).length > 0 && { labels: Object.entries(node.labels).map(([k, v]) => `${k}=${v}`) }),
      ...(node.taints?.length && { taints: node.taints.map((t) => `${t.key}=${t.value}:${t.effect}`) }),
      ...(node.unschedulable && { cordoned: true }),
      ...(node.booting && { booting: true }),
      ...(node.memoryPressure && { memoryPressure: true }),
      pods: mine.map((p) => ({ name: p.name, phase: p.phase, ready: p.ready, role: podRole(p, touched), ...restarts(p), ...podExtras(p), ...podStorage(p, state) })),
    };
  });
  const waiting = state.nodes.some((n) => n.booting);
  const pending = state.pods.filter((p) => !p.node).map((p) => ({ name: p.name, role: podRole(p, touched), ...(p.reason && { reason: p.reason }), ...(waiting && { badge: 'waiting for a node' }) }));

  const podsOf = (owners: Set<string>) => state.pods.filter((p) => p.owner && owners.has(p.owner) && (p.ownerKind ?? 'ReplicaSet') === 'ReplicaSet');
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
    ...state.hpas.map((h) => {
      const d = state.deployments.find((x) => x.name === h.target);
      const owners = new Set(state.replicaSets.filter((rs) => rs.owner === h.target).map((rs) => rs.name));
      const pods = podsOf(owners).filter((p) => p.phase === 'Running' && p.ready);
      const request = pods.reduce((s, p) => s + cpuRequestM(p), 0);
      const used = pods.reduce((s, p) => s + (p.cpuUsage ?? 0), 0);
      const cpu = request > 0 ? `CPU ${Math.round((100 * used) / request)}% / ${h.targetCpuPercent}%` : `CPU – / ${h.targetCpuPercent}%`;
      return { kind: 'HorizontalPodAutoscaler', name: h.name, ...(d && { desired: d.replicas }), current: podsOf(owners).length, ready: pods.length, note: h.note ?? `${cpu}, ${h.min}–${h.max} replicas`, role: (touched.has(h.name) ? 'active' : 'default') as Role };
    }),
    ...state.pdbs.map((b) => {
      const rule = b.minAvailable !== undefined ? `minAvailable ${b.minAvailable}` : `maxUnavailable ${b.maxUnavailable ?? 0}`;
      return { kind: 'PodDisruptionBudget', name: b.name, note: `${rule}, allowed disruptions: ${allowedDisruptions(b, state.pods, state.replicaSets)}`, role: 'default' as Role };
    }),
    ...state.services.map((s) => {
      const count = state.endpoints.find((e) => e.name === s.name)?.pods.length ?? 0;
      return { kind: 'Service', name: s.name, note: `${count} endpoint${count === 1 ? '' : 's'}`, role: (touched.has(s.name) ? 'active' : 'default') as Role };
    }),
    ...phase3Rows(state, touched, row),
  ];
  const label = (r: Snapshot['requests'][number]) => (r.host !== undefined ? `GET ${r.host}${r.path ?? '/'}` : r.from !== undefined ? `${r.from} → ${r.service}` : `to ${r.service}`);
  const all = state.requests.map((r) => ({ id: r.id, label: label(r), status: r.status, ...(r.pod && { endpoint: r.pod }), ...(r.reason && { reason: r.reason }), ...(r.body && { body: r.body }) }));
  const requests = all.slice(-REQUEST_ROWS);
  const older = all.slice(0, -REQUEST_ROWS);
  const requestsEarlier = older.length > 0 && { count: older.length, ok: older.filter((r) => r.status === 'ok').length, failed: older.filter((r) => r.status === 'failed').length };
  const scoring = breakdown && {
    pod: breakdown.pod,
    rows: breakdown.rows.map((r) => ({ ...r, role: (r.chosen ? 'found' : r.filtered ? 'discarded' : 'default') as Role })),
  };
  return {
    kind: 'cluster',
    controlPlane,
    nodes,
    pending,
    objects,
    ...(requests.length > 0 && { requests }),
    ...(requestsEarlier && { requestsEarlier }),
    ...(state.load && { traffic: state.load }),
    ...(scoring && { scoring }),
    ...(rules && { rules }),
    log,
  };
}
