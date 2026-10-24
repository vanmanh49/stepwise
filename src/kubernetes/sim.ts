import { EventQueue } from '../utils/eventQueue';
import { seeded } from '../utils/random';
import { autoscalerTick, bootNode, type AutoscalerState } from './controllers/autoscaler';
import { reconcileDeployments, rolledBack, withImage } from './controllers/deployment';
import { reconcileEndpoints } from './controllers/endpoints';
import { reconcileHpas, type HpaHistory } from './controllers/hpa';
import { reconcileReplicaSets } from './controllers/replicaset';
import { detachIdle, provision, reconcileVolumes, usersOf } from './controllers/volumes';
import { schedule } from './controllers/scheduler';
import { reconcileStatefulSets } from './controllers/statefulset';
import type { Change, Ctx, Reconcile } from './controllers/types';
import type { Env, Timer } from './env';
import { applyNoExecute, evictForTaint, requestEviction } from './evict';
import { answerOf, configSync } from './config';
import { createKubelet } from './kubelet';
import {
  CA_SCAN_S,
  CONFIG_SYNC_S,
  DATA_S,
  HEARTBEAT_S,
  HPA_SYNC_S,
  MAX_TIME,
  METRICS_S,
  NODE_CHECK_S,
  SEED,
  WATCH_S,
  type Action,
  type Component,
  type Fault,
  type Frame,
  type Kind,
  type RequestState,
  type Scenario,
  type SimResult,
  type Snapshot,
  type TraceEvent,
} from './model';
import { metricsTick } from './metrics';
import { dataTick } from './storage';
import { checkNodes, evict, heartbeat } from './nodes';
import { Store } from './store';

type Group = 'replicaset' | 'deployment' | 'endpoints' | 'scheduler' | 'kubelet' | 'volumes' | 'statefulset';

const GROUPS: Record<Group, { component: Component; watches: Kind[] }> = {
  deployment: { component: 'controllers', watches: ['Deployment', 'ReplicaSet', 'Pod'] },
  replicaset: { component: 'controllers', watches: ['Pod', 'ReplicaSet'] },
  endpoints: { component: 'controllers', watches: ['Pod', 'Service'] },
  scheduler: { component: 'scheduler', watches: ['Pod', 'Node', 'PersistentVolumeClaim'] },
  kubelet: { component: 'kubelet', watches: ['Pod'] },
  volumes: { component: 'controllers', watches: ['PersistentVolumeClaim', 'PersistentVolume', 'StorageClass', 'Pod'] },
  statefulset: { component: 'controllers', watches: ['StatefulSet', 'Pod', 'PersistentVolumeClaim'] },
};
const ORDER = Object.keys(GROUPS) as Group[];

const RECONCILERS: Record<Exclude<Group, 'kubelet' | 'volumes'>, Reconcile> = {
  deployment: reconcileDeployments,
  replicaset: reconcileReplicaSets,
  endpoints: reconcileEndpoints,
  scheduler: schedule,
  statefulset: reconcileStatefulSets,
};

type Item =
  | { kind: 'fault'; fault: Exclude<Fault, { kind: 'crash' | 'bad-image' | 'down' }> }
  | { kind: 'component'; component: Extract<Fault, { kind: 'down' }>['component']; up: boolean }
  | { kind: 'action'; action: Action }
  | { kind: 'reconcile'; group: Group }
  | { kind: 'timer'; timer: Timer }
  | { kind: 'heartbeat' }
  | { kind: 'node-check' }
  | { kind: 'metrics' }
  | { kind: 'hpa' }
  | { kind: 'autoscaler' }
  | { kind: 'config-sync' }
  | { kind: 'data' };

/** Whether an object's pods write data: a claim, or a pod template with a volume other than a ConfigMap. */
function storesData(object: Extract<Action, { kind: 'apply' }>['object']): boolean {
  if (object.kind === 'PersistentVolumeClaim') return true;
  if (object.kind === 'StatefulSet' && object.claims?.length) return true;
  const template = object.kind === 'Pod' ? object : 'template' in object ? object.template : object.kind === 'CronJob' ? object.jobTemplate.template : undefined;
  return (template?.volumes ?? []).some((v) => !('configMap' in v));
}

/** Recurring work that never keeps a run alive on its own. */
const periodic = (item: Item) =>
  item.kind === 'heartbeat' || item.kind === 'node-check' || item.kind === 'metrics' || item.kind === 'hpa' || item.kind === 'autoscaler' || item.kind === 'config-sync' || item.kind === 'data' || (item.kind === 'timer' && item.timer.kind === 'kubelet' && item.timer.step === 'probe');

/** Runs a scenario: kubectl actions and faults at their times, then every controller reacting until the cluster settles. */
export function simulate(scenario: Scenario): SimResult {
  const store = new Store();
  const queue = new EventQueue<Item>();
  const rng = seeded(SEED);
  const frames: Frame[] = [];
  const down = new Set<Component>();
  const offline = new Set<string>();
  const requests = new Map<string, RequestState>();
  const pending = new Set<Group>();
  /** Groups whose writes etcd refused; they run again when it comes back. */
  const retry = new Set<Group>();
  /** The last "nothing to do" note per object, so an unchanged state isn't narrated twice. */
  const notes = new Map<string, string>();
  const until = Math.min(scenario.until ?? MAX_TIME, MAX_TIME);
  /** Refusals already narrated, by actor and object, so a write retried during an outage is told once. */
  const refused = new Set<string>();
  let recoveredAt = 0;
  /** Requests per second at each metrics tick, for the traffic strip. */
  const traffic: number[] = [];
  const hpaHistory: HpaHistory = new Map();
  /** Claims waiting for their StorageClass to provision a volume. */
  const provisioning = new Set<string>();
  const autoscaler: AutoscalerState = { unneededSince: new Map(), maxNoted: false };
  let now = 0;
  let live = 0;
  let current: Group | undefined;

  const push = (time: number, item: Item) => {
    if (!periodic(item)) live++;
    queue.push(time, item);
  };

  const snapshot = (): Snapshot => ({
    t: now,
    ...store.snapshot(),
    ...(scenario.load && { load: { rps: traffic.at(-1) ?? 0, points: [...traffic] } }),
    down: [...down],
    offline: [...offline].toSorted(),
    requests: [...requests.values()].map((r) => ({ ...r })),
  });
  const record = (event: Omit<TraceEvent, 't'>) => frames.push({ event: { t: now, ...event }, state: snapshot() });

  const watch = (kind: Kind) => {
    for (const group of ORDER) {
      if (!GROUPS[group].watches.includes(kind) || pending.has(group)) continue;
      pending.add(group);
      push(now + WATCH_S, { kind: 'reconcile', group });
    }
  };

  const apply = (change: Change): boolean => {
    const { write, event } = change;
    if (!write) {
      const key = event.subjects[0] ?? '';
      if (notes.get(key) === event.text) return true;
      notes.set(key, event.text);
      record(event);
      return true;
    }
    const result = store.write(write);
    if (!result.ok) {
      if (current) retry.add(current);
      const key = `${event.by}/${event.subjects[0] ?? ''}`;
      if (refused.has(key)) return false;
      refused.add(key);
      record({ ...event, kind: 'refuse-write', reason: result.reason, text: `${event.text}, but the write is refused: ${result.reason}` });
      return false;
    }
    for (const subject of event.subjects) notes.delete(subject);
    record(event);
    watch(write.object.kind);
    return true;
  };

  const env: Env = {
    store,
    now: () => now,
    apply,
    later: (delay, timer) => push(now + delay, { kind: 'timer', timer }),
    offline,
    faults: scenario.faults,
    recoveredAt: () => recoveredAt,
  };
  const kubelet = createKubelet(env);
  const ctx = (): Ctx => ({ now, store, rng, ...(scenario.schedulerStrategy && { strategy: scenario.schedulerStrategy }) });

  const run = (group: Group) => {
    pending.delete(group);
    if (down.has(GROUPS[group].component)) return;
    current = group;
    if (group === 'kubelet') {
      kubelet.reconcile();
      // The taint manager watches pods too: one bound to a NoExecute node it tolerates for a while starts its countdown.
      applyNoExecute(env);
      detachIdle(env);
    } else if (group === 'volumes') reconcileVolumes(env, provisioning);
    else for (const change of RECONCILERS[group](ctx())) apply(change);
    current = undefined;
  };

  const act = (action: Action) => {
    const kubectl = (text: string, subjects: string[]) => ({ kind: 'action' as const, by: 'kubectl' as const, subjects, text });
    switch (action.kind) {
      case 'apply': {
        const { object } = action;
        const exists = !!store.get(object.kind, object.name);
        apply({ write: { op: exists ? 'update' : 'create', object }, event: kubectl(`kubectl applies ${object.kind} ${object.name}`, [object.name]) });
        return;
      }
      case 'scale': {
        const target = store.get('Deployment', action.target) ?? store.get('ReplicaSet', action.target) ?? store.get('StatefulSet', action.target);
        if (!target) return record(kubectl(`kubectl can't scale ${action.target}: not found`, [action.target]));
        apply({ write: { op: 'update', object: { ...target, replicas: action.replicas } }, event: kubectl(`kubectl scales ${target.kind} ${target.name} to ${action.replicas}`, [target.name]) });
        return;
      }
      case 'set-image': {
        const d = store.get('Deployment', action.target) ?? store.get('StatefulSet', action.target);
        if (!d) return record(kubectl(`kubectl can't update ${action.target}: not found`, [action.target]));
        apply({ write: { op: 'update', object: withImage(d, action.image) }, event: kubectl(`kubectl sets ${d.kind} ${d.name}'s image to ${action.image}`, [d.name]) });
        return;
      }
      case 'rollback': {
        const d = store.get('Deployment', action.target);
        const back = d && rolledBack(d);
        if (!back) return record(kubectl(`kubectl rollout undo ${action.target}: there is no earlier revision`, [action.target]));
        apply({ write: { op: 'update', object: back }, event: kubectl(`kubectl rolls Deployment ${back.name} back to ${back.template.image}`, [back.name]) });
        return;
      }
      case 'delete-pods': {
        for (const pod of store.list('Pod').filter((p) => p.owner === action.owner).slice(0, action.count)) {
          apply({ write: { op: 'delete', object: pod }, event: kubectl(`kubectl deletes pod ${pod.name}`, [pod.name, action.owner]) });
        }
        return;
      }
      case 'request':
        return route(action.id, action.service);
      case 'cordon':
      case 'uncordon':
      case 'drain': {
        const node = store.get('Node', action.node);
        if (!node) return record(kubectl(`kubectl can't find ${action.node}`, [action.node]));
        const cordon = action.kind !== 'uncordon';
        const text = action.kind === 'drain' ? `kubectl drain ${node.name}: cordons it, then evicts its pods` : cordon ? `kubectl cordons ${node.name}: it keeps its pods but gets no new ones` : `kubectl uncordons ${node.name}: it can take new pods again`;
        apply({ write: { op: 'update', object: { ...node, unschedulable: cordon } }, event: { kind: 'cordon', by: 'kubectl', node: node.name, subjects: [node.name], text } });
        if (action.kind === 'drain') for (const pod of store.list('Pod').filter((p) => p.node === node.name && p.phase !== 'Completed' && p.phase !== 'Failed')) requestEviction(env, pod, 'kubectl');
        return;
      }
      case 'rollout-restart': {
        const d = store.get('Deployment', action.target);
        if (!d) return record(kubectl(`kubectl can't restart ${action.target}: not found`, [action.target]));
        const template = { ...d.template, annotations: { ...d.template.annotations, restartedAt: String(now) } };
        apply({ write: { op: 'update', object: { ...d, template, history: [...d.history, d.template], revision: d.revision + 1 } }, event: kubectl(`kubectl rollout restart deployment ${d.name}: the pod template changes, so a rollout starts`, [d.name]) });
        return;
      }
      case 'delete': {
        const { kind, name } = action.object;
        const object = store.get(kind, name);
        if (!object) return record(kubectl(`kubectl can't delete ${kind} ${name}: not found`, [name]));
        // Storage-object-in-use protection: a claim a pod still uses goes only once no pod does.
        const users = object.kind === 'PersistentVolumeClaim' ? usersOf(store.list('Pod'), name) : [];
        if (object.kind === 'PersistentVolumeClaim' && users.length > 0) {
          apply({ write: { op: 'update', object: { ...object, deleting: true } }, event: kubectl(`kubectl deletes PVC ${name}, but ${users.map((p) => p.name).join(', ')} still uses it: it stays until no pod does`, [name]) });
          return;
        }
        apply({ write: { op: 'delete', object }, event: kubectl(`kubectl deletes ${kind} ${name}`, [name]) });
        return;
      }
      case 'add-node': {
        const { name, cpu, ...extra } = action.node;
        apply({ write: { op: 'create', object: { kind: 'Node', name, cpu, ready: true, lastHeartbeat: now, ...extra } }, event: { kind: 'node-join', by: 'kubelet', node: name, subjects: [name], text: `${name} joins the cluster: its kubelet registers it` } });
        return;
      }
      case 'edit-config': {
        const cm = store.get('ConfigMap', action.name);
        if (!cm) return record(kubectl(`kubectl can't edit ConfigMap ${action.name}: not found`, [action.name]));
        apply({ write: { op: 'update', object: { ...cm, data: { ...cm.data, [action.key]: action.value } } }, event: kubectl(`kubectl edits ConfigMap ${cm.name}: ${action.key}=${action.value}`, [cm.name]) });
        return;
      }
      case 'taint': {
        const node = store.get('Node', action.node);
        if (!node) return record(kubectl(`kubectl can't find ${action.node}`, [action.node]));
        const { key, value, effect } = action.taint;
        apply({ write: { op: 'update', object: { ...node, taints: [...(node.taints ?? []), action.taint] } }, event: { kind: 'taint', by: 'kubectl', node: node.name, subjects: [node.name], text: `kubectl taints ${node.name} with {${key}: ${value}}:${effect}` } });
        if (effect === 'NoExecute') applyNoExecute(env);
        return;
      }
    }
  };

  // kube-proxy: a seeded pick among the Service's endpoints, as iptables mode picks at random.
  const route = (id: string, service: string) => {
    const endpoints = store.get('Endpoints', service)?.pods ?? [];
    const by = { by: 'kube-proxy' as const, subjects: [id, service] };
    if (endpoints.length === 0) {
      const reason = `no endpoints for ${service}: connection refused`;
      requests.set(id, { id, service, status: 'failed', reason });
      return record({ kind: 'request-fail', ...by, text: `Request ${id} to ${service} fails: ${reason}`, reason });
    }
    const name = endpoints[Math.floor(rng() * endpoints.length)]!;
    const pod = store.get('Pod', name);
    const node = pod?.node ? store.get('Node', pod.node) : undefined;
    const running = pod?.phase === 'Running' && !!node?.ready && !offline.has(node.name);
    const ok = running && kubelet.answers(name);
    const reason = ok ? undefined : running ? `${name} doesn't answer: the request times out` : `${name} is not running: connection refused`;
    const body = ok ? answerOf(pod) : undefined;
    requests.set(id, { id, service, status: ok ? 'ok' : 'failed', pod: name, ...(reason && { reason }), ...(body && { body }) });
    record({ kind: 'route', ...by, ...(pod?.node && { node: pod.node }), subjects: [id, service, name], text: ok ? `kube-proxy sends request ${id} to ${name}${body ? `, which answers ${body}` : ''}` : `kube-proxy sends request ${id} to ${name}, which fails: ${reason}`, ...(reason && { reason }) });
  };

  const fault = (f: Extract<Item, { kind: 'fault' }>['fault']) => {
    if (f.kind === 'node-down') {
      offline.add(f.node);
      return record({ kind: 'fault', by: 'kubelet', node: f.node, subjects: [f.node], text: `${f.node} goes down: its kubelet stops and sends no more heartbeats` });
    }
    const pod = store.list('Pod').find((p) => p.name.startsWith(f.prefix) && p.phase === 'Running' && p.ready);
    if (!pod) return record({ kind: 'fault', by: 'kubelet', subjects: [], text: `No ready pod starting with ${f.prefix} to make unready` });
    apply({ write: { op: 'update', object: { ...pod, ready: false } }, event: { kind: 'not-ready', by: 'kubelet', node: pod.node!, subjects: [pod.name], text: `${pod.name} stops passing its readiness check: still Running, but not ready` } });
  };

  const component = (name: Extract<Item, { kind: 'component' }>['component'], up: boolean) => {
    if (name === 'etcd') store.etcdUp = up;
    if (up) down.delete(name);
    else down.add(name);
    const label = name === 'controllers' ? 'The controller manager' : name;
    record({ kind: up ? 'component-up' : 'component-down', by: name, subjects: [name], text: up ? `${label} is back` : `${label} goes down` });
    if (!up) return;
    if (name === 'etcd' || name === 'controllers') recoveredAt = now;
    if (name === 'etcd') refused.clear();
    // Level-triggered: on return, each controller reads the current state once and catches up.
    for (const group of ORDER) if (GROUPS[group].component === name || (name === 'etcd' && retry.has(group))) run(group);
    if (name === 'etcd') retry.clear();
  };

  for (const { name, cpu, ...extra } of scenario.nodes) store.write({ op: 'create', object: { kind: 'Node', name, cpu, ready: true, lastHeartbeat: 0, ...extra } });
  const pool = scenario.pool;
  for (let i = 1; i <= (pool?.min ?? 0); i++) {
    store.write({ op: 'create', object: { kind: 'Node', name: `pool-${i}`, cpu: pool!.cpu, memory: pool!.memory, ready: true, lastHeartbeat: 0, pool: true, ...(pool!.labels && { labels: pool!.labels }) } });
  }
  // Pushed first, so at equal times faults come before actions, and both before anything the run schedules.
  for (const f of scenario.faults) {
    if (f.kind === 'down') {
      push(f.from, { kind: 'component', component: f.component, up: false });
      push(f.to, { kind: 'component', component: f.component, up: true });
    } else if (f.kind === 'node-down' || f.kind === 'not-ready') push(f.at, { kind: 'fault', fault: f });
  }
  for (const action of scenario.actions) push(action.at, { kind: 'action', action });
  push(0, { kind: 'heartbeat' });
  push(NODE_CHECK_S, { kind: 'node-check' });
  if (scenario.load || scenario.faults.some((f) => f.kind === 'leak')) push(METRICS_S, { kind: 'metrics' });
  if (scenario.actions.some((a) => a.kind === 'apply' && a.object.kind === 'HorizontalPodAutoscaler')) push(HPA_SYNC_S, { kind: 'hpa' });
  if (pool) push(CA_SCAN_S, { kind: 'autoscaler' });
  if (scenario.actions.some((a) => a.kind === 'apply' && a.object.kind === 'ConfigMap')) push(CONFIG_SYNC_S, { kind: 'config-sync' });
  if (scenario.actions.some((a) => a.kind === 'apply' && storesData(a.object))) push(DATA_S, { kind: 'data' });

  let cutOff = false;
  let endedAt = 0;
  for (;;) {
    // A dead node nobody has noticed yet keeps the run going until the node lifecycle does.
    const unnoticed = store.list('Node').some((n) => n.ready && offline.has(n.name));
    if (live === 0 && !unnoticed && !scenario.runToEnd) break;
    const next = queue.pop();
    if (!next) break;
    if (next.time > until) {
      cutOff = !scenario.runToEnd;
      endedAt = until;
      break;
    }
    now = next.time;
    const item = next.item;
    if (!periodic(item)) {
      live--;
      endedAt = now;
    }
    switch (item.kind) {
      case 'fault':
        fault(item.fault);
        break;
      case 'component':
        component(item.component, item.up);
        break;
      case 'action':
        act(item.action);
        break;
      case 'reconcile':
        run(item.group);
        break;
      case 'timer': {
        const timer = item.timer;
        if (timer.kind === 'evict') evict(env, timer.node);
        else if (timer.kind === 'evict-retry') {
          const pod = store.get('Pod', timer.pod);
          if (pod) requestEviction(env, pod, timer.by);
        } else if (timer.kind === 'noexecute') {
          const pod = store.get('Pod', timer.pod);
          const taint = store.get('Node', timer.node)?.taints?.find((t) => t.effect === 'NoExecute');
          if (pod && pod.node === timer.node && taint) evictForTaint(env, pod, taint);
        } else if (timer.kind === 'boot') bootNode(env, timer.node);
        else if (timer.kind === 'provision') provision(env, timer.claim, provisioning);
        else kubelet.fire(timer);
        break;
      }
      case 'heartbeat':
        heartbeat(env);
        push(now + HEARTBEAT_S, item);
        break;
      case 'metrics':
        metricsTick(env, scenario, { startedAt: kubelet.startedAt, kill: kubelet.kill, traffic });
        push(now + METRICS_S, item);
        break;
      case 'hpa':
        // The HPA runs in the controller manager.
        if (!down.has('controllers')) {
          current = undefined;
          for (const change of reconcileHpas(ctx(), hpaHistory)) apply(change);
        }
        push(now + HPA_SYNC_S, item);
        break;
      case 'autoscaler':
        if (!down.has('controllers') && store.etcdUp) autoscalerTick(env, pool!, autoscaler);
        push(now + CA_SCAN_S, item);
        break;
      case 'data':
        dataTick(env);
        push(now + DATA_S, item);
        break;
      case 'config-sync':
        configSync(env);
        push(now + CONFIG_SYNC_S, item);
        break;
      case 'node-check':
        // Node lifecycle runs in the controller manager and needs etcd.
        if (!down.has('controllers') && store.etcdUp) checkNodes(env);
        push(now + NODE_CHECK_S, item);
        break;
    }
  }
  const ranToEnd = !!scenario.runToEnd && endedAt === until;
  now = endedAt;
  return { frames, endedAt, cutOff, ...(ranToEnd && { ranToEnd }), final: snapshot() };
}
