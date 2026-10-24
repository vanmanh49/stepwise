import { EventQueue } from '../utils/eventQueue';
import { seeded } from '../utils/random';
import { reconcileDeployments, rolledBack, withImage } from './controllers/deployment';
import { reconcileEndpoints } from './controllers/endpoints';
import { reconcileReplicaSets } from './controllers/replicaset';
import { schedule } from './controllers/scheduler';
import type { Change, Ctx, Reconcile } from './controllers/types';
import type { Env, Timer } from './env';
import { createKubelet } from './kubelet';
import {
  HEARTBEAT_S,
  MAX_TIME,
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
  type TraceEvent,
} from './model';
import { checkNodes, evict, heartbeat } from './nodes';
import { Store } from './store';

type Group = 'replicaset' | 'deployment' | 'endpoints' | 'scheduler' | 'kubelet';

const GROUPS: Record<Group, { component: Component; watches: Kind[] }> = {
  deployment: { component: 'controllers', watches: ['Deployment', 'ReplicaSet', 'Pod'] },
  replicaset: { component: 'controllers', watches: ['Pod', 'ReplicaSet'] },
  endpoints: { component: 'controllers', watches: ['Pod', 'Service'] },
  scheduler: { component: 'scheduler', watches: ['Pod', 'Node'] },
  kubelet: { component: 'kubelet', watches: ['Pod'] },
};
const ORDER = Object.keys(GROUPS) as Group[];

const RECONCILERS: Record<Exclude<Group, 'kubelet'>, Reconcile> = {
  deployment: reconcileDeployments,
  replicaset: reconcileReplicaSets,
  endpoints: reconcileEndpoints,
  scheduler: schedule,
};

type Item =
  | { kind: 'fault'; fault: Exclude<Fault, { kind: 'crash' | 'bad-image' | 'down' }> }
  | { kind: 'component'; component: Extract<Fault, { kind: 'down' }>['component']; up: boolean }
  | { kind: 'action'; action: Action }
  | { kind: 'reconcile'; group: Group }
  | { kind: 'timer'; timer: Timer }
  | { kind: 'heartbeat' }
  | { kind: 'node-check' };

const periodic = (item: Item) => item.kind === 'heartbeat' || item.kind === 'node-check';

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
  let now = 0;
  let live = 0;
  let current: Group | undefined;

  const push = (time: number, item: Item) => {
    if (!periodic(item)) live++;
    queue.push(time, item);
  };

  const record = (event: Omit<TraceEvent, 't'>) => {
    frames.push({
      event: { t: now, ...event },
      state: { t: now, ...store.snapshot(), down: [...down], offline: [...offline].toSorted(), requests: [...requests.values()].map((r) => ({ ...r })) },
    });
  };

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
  const ctx = (): Ctx => ({ now, store, rng });

  const run = (group: Group) => {
    pending.delete(group);
    if (down.has(GROUPS[group].component)) return;
    current = group;
    if (group === 'kubelet') kubelet.reconcile();
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
        const target = store.get('Deployment', action.target) ?? store.get('ReplicaSet', action.target);
        if (!target) return record(kubectl(`kubectl can't scale ${action.target}: not found`, [action.target]));
        apply({ write: { op: 'update', object: { ...target, replicas: action.replicas } }, event: kubectl(`kubectl scales ${target.kind} ${target.name} to ${action.replicas}`, [target.name]) });
        return;
      }
      case 'set-image': {
        const d = store.get('Deployment', action.target);
        if (!d) return record(kubectl(`kubectl can't update ${action.target}: not found`, [action.target]));
        apply({ write: { op: 'update', object: withImage(d, action.image) }, event: kubectl(`kubectl sets Deployment ${d.name}'s image to ${action.image}`, [d.name]) });
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
    const ok = pod?.phase === 'Running' && !!node?.ready && !offline.has(node.name);
    const reason = ok ? undefined : `${name} is not running: connection refused`;
    requests.set(id, { id, service, status: ok ? 'ok' : 'failed', pod: name, ...(reason && { reason }) });
    record({ kind: 'route', ...by, ...(pod?.node && { node: pod.node }), subjects: [id, service, name], text: ok ? `kube-proxy sends request ${id} to ${name}` : `kube-proxy sends request ${id} to ${name}, which fails: ${reason}`, ...(reason && { reason }) });
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

  let cutOff = false;
  let endedAt = 0;
  for (;;) {
    // A dead node nobody has noticed yet keeps the run going until the node lifecycle does.
    const unnoticed = store.list('Node').some((n) => n.ready && offline.has(n.name));
    if (live === 0 && !unnoticed) break;
    const next = queue.pop();
    if (!next) break;
    if (next.time > until) {
      cutOff = true;
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
      case 'timer':
        if (item.timer.kind === 'evict') evict(env, item.timer.node);
        else kubelet.fire(item.timer);
        break;
      case 'heartbeat':
        heartbeat(env);
        push(now + HEARTBEAT_S, item);
        break;
      case 'node-check':
        // Node lifecycle runs in the controller manager and needs etcd.
        if (!down.has('controllers') && store.etcdUp) checkNodes(env);
        push(now + NODE_CHECK_S, item);
        break;
    }
  }
  return { frames, endedAt, cutOff };
}
