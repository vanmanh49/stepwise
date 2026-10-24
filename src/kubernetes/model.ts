/** A run stops here even if work is still scheduled (seconds of simulated time). */
export const MAX_TIME = 600;
/** Steps shown before the rest of a run folds into one summary step. */
export const MAX_STEPS = 200;
/** Seed for pod names and kube-proxy picks, so every run repeats exactly. */
export const SEED = 7;

// Timings in seconds, shortened from Kubernetes' defaults so runs stay short; lessons say so.
export const WATCH_S = 1;
export const PULL_S = 2;
export const START_S = 1;
export const READY_S = 2;
export const HEARTBEAT_S = 10;
export const NODE_CHECK_S = 5;
/** Kubernetes waits 40 s by default. */
export const GRACE_S = 20;
/** Kubernetes waits 5 min by default. */
export const EVICT_S = 10;
export const BACKOFF_FIRST_S = 10;
export const BACKOFF_CAP_S = 160;
export const BACKOFF_RESET_S = 60;

export type Component = 'kubectl' | 'api-server' | 'etcd' | 'scheduler' | 'controllers' | 'kubelet' | 'kube-proxy';
export type Labels = Record<string, string>;
export interface Requirement {
  key: string;
  op: '=' | '!=' | 'in' | 'notin' | 'exists';
  values: string[];
}
export type Selector = Requirement[];
/** A pod count, or a percentage of the replicas. */
export type Amount = number | `${number}%`;
export interface Template {
  labels: Labels;
  image: string;
  cpu: number;
  restartPolicy: 'Always' | 'OnFailure' | 'Never';
}
export type PodPhase = 'Pending' | 'ContainerCreating' | 'Running' | 'CrashLoopBackOff' | 'ImagePullBackOff' | 'Completed' | 'Failed' | 'Lost';

export interface NodeObj {
  kind: 'Node';
  name: string;
  cpu: number;
  ready: boolean;
  lastHeartbeat: number;
}
export interface Pod {
  kind: 'Pod';
  name: string;
  labels: Labels;
  owner?: string;
  node?: string;
  phase: PodPhase;
  ready: boolean;
  restarts: number;
  image: string;
  cpu: number;
  restartPolicy: Template['restartPolicy'];
  createdAt: number;
  reason?: string;
}
export interface ReplicaSet {
  kind: 'ReplicaSet';
  name: string;
  replicas: number;
  selector: Selector;
  template: Template;
  owner?: string;
  revision: number;
}
export interface Deployment {
  kind: 'Deployment';
  name: string;
  replicas: number;
  selector: Selector;
  template: Template;
  maxSurge: Amount;
  maxUnavailable: Amount;
  revision: number;
  /** Earlier templates, newest last. */
  history: Template[];
}
export interface Service {
  kind: 'Service';
  name: string;
  selector: Selector;
}
export interface Endpoints {
  kind: 'Endpoints';
  name: string;
  pods: string[];
}
export type Obj = NodeObj | Pod | ReplicaSet | Deployment | Service | Endpoints;
export type Kind = Obj['kind'];
export type ObjOf<K extends Kind> = Extract<Obj, { kind: K }>;

export type Action = { at: number } & (
  | { kind: 'apply'; object: Pod | ReplicaSet | Deployment | Service }
  /** A Deployment, else the ReplicaSet of that name. */
  | { kind: 'scale'; target: string; replicas: number }
  | { kind: 'set-image'; target: string; image: string }
  /** The first `count` pods owned by `owner`, in name order. */
  | { kind: 'delete-pods'; owner: string; count: number }
  | { kind: 'rollback'; target: string }
  | { kind: 'request'; id: string; service: string }
);

export type Fault =
  | { kind: 'node-down'; node: string; at: number }
  /** Every container of a pod whose name starts with prefix exits afterS after each start. */
  | { kind: 'crash'; prefix: string; afterS: number; exitCode: 0 | 1 }
  | { kind: 'bad-image'; image: string }
  /** The first Running pod (name order) whose name starts with prefix. */
  | { kind: 'not-ready'; prefix: string; at: number }
  | { kind: 'down'; component: 'scheduler' | 'controllers' | 'etcd'; from: number; to: number };

export interface Scenario {
  nodes: { name: string; cpu: number }[];
  actions: Action[];
  faults: Fault[];
  /** Defaults to MAX_TIME. */
  until?: number;
}

export type TraceKind =
  | 'action'
  | 'refuse-write'
  | 'reconcile'
  | 'create-pod'
  | 'delete-pod'
  | 'scale'
  | 'rollout'
  | 'bind'
  | 'unschedulable'
  | 'pull'
  | 'pull-fail'
  | 'start'
  | 'ready'
  | 'not-ready'
  | 'exit'
  | 'restart'
  | 'back-off'
  | 'node-not-ready'
  | 'lost'
  | 'endpoints'
  | 'route'
  | 'request-fail'
  | 'fault'
  | 'component-down'
  | 'component-up'
  | 'summary';

export interface TraceEvent {
  t: number;
  kind: TraceKind;
  by: Component;
  node?: string;
  /** Object names this event touched. */
  subjects: string[];
  /** Default narration with real values, e.g. "ReplicaSet web-7f creates web-7f-m4p". */
  text: string;
  reason?: string;
}

export interface RequestState {
  id: string;
  service: string;
  status: 'pending' | 'ok' | 'failed';
  pod?: string;
  reason?: string;
}

export interface Snapshot {
  t: number;
  nodes: NodeObj[];
  pods: Pod[];
  replicaSets: ReplicaSet[];
  deployments: Deployment[];
  services: Service[];
  endpoints: Endpoints[];
  down: Component[];
  requests: RequestState[];
}

export interface Frame {
  event: TraceEvent;
  state: Snapshot;
}

export interface SimResult {
  frames: Frame[];
  endedAt: number;
  /** True when until/MAX_TIME cut off work still scheduled. */
  cutOff: boolean;
}

/** A count, or a percentage of `replicas` rounded the way Kubernetes rounds it (surge up, unavailable down). */
export function resolveAmount(amount: Amount, replicas: number, round: 'up' | 'down'): number {
  if (typeof amount === 'number') return amount;
  const exact = (parseFloat(amount) / 100) * replicas;
  return round === 'up' ? Math.ceil(exact) : Math.floor(exact);
}
