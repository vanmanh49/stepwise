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
/** Kubernetes waits 50 s by default. */
export const GRACE_S = 20;
/** Kubernetes waits 5 min by default. */
export const EVICT_S = 10;
export const BACKOFF_FIRST_S = 10;
export const BACKOFF_CAP_S = 160;
export const BACKOFF_RESET_S = 60;
// Phase 2 timings, shortened the same way (Kubernetes defaults in the lessons).
export const METRICS_S = 5;
export const HPA_SYNC_S = 5;
export const HPA_STABILISE_S = 30;
export const HPA_TOLERANCE = 0.1;
/** Default scale-up policy: per sync (per 15 s in Kubernetes) add at most 4 pods or 100%, whichever is more. */
export const HPA_UP_PODS = 4;
export const CA_SCAN_S = 5;
export const NODE_BOOT_S = 20;
export const CA_UNNEEDED_S = 60;
export const CA_UTILISATION = 0.5;
export const EVICT_RETRY_S = 5;
export const PROBE_PERIOD_S = 2;
export const PROBE_THRESHOLD = 3;
export const BASE_MEMORY_MI = 64;
export const NODE_MEMORY_MI = 8192;
// Phase 3 timings. Job back-off and CronJob checks use Kubernetes' real values; the config sync is shortened.
/** The kubelet re-reads mounted ConfigMaps (within about a minute by default). */
export const CONFIG_SYNC_S = 10;
export const DATA_S = 5;
/** A running app writes 1 record per second to each volume it mounts. */
export const RECORDS_PER_TICK = 5;
export const PROVISION_S = 3;
export const ATTACH_S = 2;
export const ATTACH_RETRY_S = 5;
export const CRON_CHECK_S = 10;
export const BACKUP_RUN_S = 20;

export type Component = 'kubectl' | 'api-server' | 'etcd' | 'scheduler' | 'controllers' | 'kubelet' | 'kube-proxy' | 'ingress' | 'operator';
export type Labels = Record<string, string>;
export interface Requirement {
  key: string;
  op: '=' | '!=' | 'in' | 'notin' | 'exists';
  values: string[];
}
export type Selector = Requirement[];
/** A pod count, or a percentage of the replicas. */
export type Amount = number | `${number}%`;
export interface Taint {
  key: string;
  value: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}
export interface Toleration {
  key: string;
  operator: 'Equal' | 'Exists';
  value?: string;
  effect?: Taint['effect'];
  /** For NoExecute: how long the pod may stay after the taint appears. */
  seconds?: number;
}
export interface AntiTerm {
  selector: Selector;
  topologyKey: 'kubernetes.io/hostname' | 'zone';
}
export interface Probe {
  periodS: number;
  failureThreshold: number;
  initialDelayS?: number;
}
/** CPU in millicores, memory in MiB. */
export interface Resources {
  cpu?: { request?: number; limit?: number };
  memory?: { request?: number; limit?: number };
}
/** Optional pod settings phase 2 adds; leaving them out keeps phase 1 behaviour. */
export interface PodExtras {
  resources?: Resources;
  tolerations?: Toleration[];
  affinity?: {
    node?: { required?: Selector; preferred?: { weight: number; selector: Selector }[] };
    podAnti?: { required?: AntiTerm; preferred?: { weight: number; term: AntiTerm }[] };
  };
  probes?: { liveness?: Probe; readiness?: Probe; startup?: Probe };
  /** Read once, when the container starts. */
  env?: EnvVar[];
  volumes?: Volume[];
  /** A container that finishes: it exits after `seconds`; the owner's first `failFirst` containers exit 1. */
  run?: { seconds: number; exitCode: 0 | 1; failFirst?: number };
  /** `kubectl rollout restart` writes restartedAt here. */
  annotations?: Labels;
}
export type OwnerKind = 'ReplicaSet' | 'StatefulSet' | 'DaemonSet' | 'Job';
export type Volume = { name: string; emptyDir: true } | { name: string; claim: string } | { name: string; configMap: string };
export interface EnvVar {
  name: string;
  from: { configMap: string; key: string } | { secret: string; key: string };
}
export interface Template extends PodExtras {
  labels: Labels;
  image: string;
  cpu: number;
  restartPolicy: 'Always' | 'OnFailure' | 'Never';
}
export type PodPhase = 'Pending' | 'ContainerCreating' | 'Running' | 'CrashLoopBackOff' | 'ImagePullBackOff' | 'CreateContainerConfigError' | 'Completed' | 'Failed' | 'Lost';

export interface NodeObj {
  kind: 'Node';
  name: string;
  cpu: number;
  ready: boolean;
  lastHeartbeat: number;
  labels?: Labels;
  taints?: Taint[];
  /** Cordoned: no new pods. */
  unschedulable?: boolean;
  /** MiB; NODE_MEMORY_MI when absent. */
  memory?: number;
  /** Added by the autoscaler and still starting. */
  booting?: boolean;
  /** Belongs to the autoscaler's node pool. */
  pool?: boolean;
  /** The kubelet reports the node out of memory: no new BestEffort pods. */
  memoryPressure?: boolean;
}
export interface Pod extends PodExtras {
  kind: 'Pod';
  name: string;
  labels: Labels;
  owner?: string;
  /** The owner's kind; absent means ReplicaSet. */
  ownerKind?: OwnerKind;
  node?: string;
  phase: PodPhase;
  ready: boolean;
  restarts: number;
  image: string;
  cpu: number;
  restartPolicy: Template['restartPolicy'];
  createdAt: number;
  reason?: string;
  /** Millicores, from the latest metrics tick. */
  cpuUsage?: number;
  /** MiB, from the latest metrics tick. */
  memoryUsage?: number;
  throttled?: boolean;
  lastTermination?: 'OOMKilled' | 'Error' | 'Evicted' | 'Liveness';
  /** What the app reads from its ConfigMaps and Secrets now. */
  config?: Record<string, string>;
  /** Records in its emptyDir volumes: they go with the pod. */
  records?: number;
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
export interface HorizontalPodAutoscaler {
  kind: 'HorizontalPodAutoscaler';
  name: string;
  /** A Deployment. */
  target: string;
  min: number;
  max: number;
  targetCpuPercent: number;
  desired?: number;
  note?: string;
}
export interface PodDisruptionBudget {
  kind: 'PodDisruptionBudget';
  name: string;
  selector: Selector;
  minAvailable?: number;
  maxUnavailable?: number;
}
export interface ConfigMap {
  kind: 'ConfigMap';
  name: string;
  data: Record<string, string>;
}
export interface Secret {
  kind: 'Secret';
  name: string;
  /** Stored as given; the view shows it base64-encoded, which is all Kubernetes does by default. */
  data: Record<string, string>;
}
export type AccessMode = 'ReadWriteOnce' | 'ReadWriteMany';
export interface StorageClass {
  kind: 'StorageClass';
  name: string;
  reclaimPolicy: 'Delete' | 'Retain';
}
export interface PersistentVolume {
  kind: 'PersistentVolume';
  name: string;
  capacityGi: number;
  accessMode: AccessMode;
  storageClass?: string;
  reclaimPolicy: 'Delete' | 'Retain';
  phase: 'Available' | 'Bound' | 'Released';
  claim?: string;
  records: number;
  /** The node it is attached to. */
  attachedTo?: string;
}
export interface PersistentVolumeClaim {
  kind: 'PersistentVolumeClaim';
  name: string;
  requestGi: number;
  accessMode: AccessMode;
  storageClass?: string;
  phase: 'Pending' | 'Bound';
  volume?: string;
  /** Deleted while a pod still uses it: it goes once no pod does. */
  deleting?: boolean;
  /** The StatefulSet whose claim template made it. */
  owner?: string;
}
export interface StatefulSet {
  kind: 'StatefulSet';
  name: string;
  replicas: number;
  selector: Selector;
  template: Template;
  serviceName: string;
  podManagementPolicy: 'OrderedReady' | 'Parallel';
  claims?: { name: string; requestGi: number; storageClass: string }[];
  whenScaled: 'Retain' | 'Delete';
  revision: number;
  history: Template[];
}
export interface DaemonSet {
  kind: 'DaemonSet';
  name: string;
  selector: Selector;
  template: Template;
  nodeSelector?: Labels;
  revision: number;
  history: Template[];
}
export interface JobStatus {
  active: number;
  succeeded: number;
  failed: number;
  startedAt: number;
  condition?: 'Complete' | 'Failed';
  reason?: 'BackoffLimitExceeded' | 'DeadlineExceeded';
}
export interface Job {
  kind: 'Job';
  name: string;
  template: Template;
  completions: number;
  parallelism: number;
  backoffLimit: number;
  activeDeadlineS?: number;
  /** The CronJob that made it. */
  owner?: string;
  status: JobStatus;
}
export interface CronJob {
  kind: 'CronJob';
  name: string;
  /** "*\/N * * * *": every N minutes. */
  schedule: string;
  jobTemplate: Omit<Job, 'kind' | 'name' | 'status' | 'owner'>;
  concurrencyPolicy: 'Allow' | 'Forbid' | 'Replace';
  successfulHistory: number;
  failedHistory: number;
  /** The latest schedule time a Job was made (or skipped) for. */
  lastScheduled?: number;
}
export interface IngressPath {
  path: string;
  pathType: 'Prefix' | 'Exact';
  service: string;
}
export interface Ingress {
  kind: 'Ingress';
  name: string;
  rules: { host?: string; paths: IngressPath[] }[];
  defaultBackend?: string;
}
export interface NetworkPolicy {
  kind: 'NetworkPolicy';
  name: string;
  /** [] selects every pod. */
  podSelector: Selector;
  policyTypes: ('Ingress' | 'Egress')[];
  ingress?: { from: Selector[] }[];
  /** dns: allow lookups (UDP 53 to kube-dns). */
  egress?: { to: Selector[]; dns?: boolean }[];
}
export interface CustomResourceDefinition {
  kind: 'CustomResourceDefinition';
  name: string;
  group: string;
  resource: 'Database';
}
/** The one custom resource: the operator lesson's example. */
export interface Database {
  kind: 'Database';
  name: string;
  spec: { replicas: number; version: number; backup: boolean };
  status?: { phase: 'Creating' | 'Ready' | 'BackingUp' | 'Upgrading'; ready: number; version: number };
}
export type Obj =
  | NodeObj
  | Pod
  | ReplicaSet
  | Deployment
  | Service
  | Endpoints
  | HorizontalPodAutoscaler
  | PodDisruptionBudget
  | ConfigMap
  | Secret
  | StorageClass
  | PersistentVolume
  | PersistentVolumeClaim
  | StatefulSet
  | DaemonSet
  | Job
  | CronJob
  | Ingress
  | NetworkPolicy
  | CustomResourceDefinition
  | Database;
export type Kind = Obj['kind'];
export type ObjOf<K extends Kind> = Extract<Obj, { kind: K }>;

export type Action = { at: number } & (
  | { kind: 'apply'; object: Exclude<Obj, NodeObj | Endpoints> }
  /** A Deployment, else the ReplicaSet of that name. */
  | { kind: 'scale'; target: string; replicas: number }
  | { kind: 'set-image'; target: string; image: string }
  /** The first `count` pods owned by `owner`, in name order. */
  | { kind: 'delete-pods'; owner: string; count: number }
  | { kind: 'rollback'; target: string }
  /** from: the source pod's name prefix (NetworkPolicies); host or path: sent through the Ingress controller. */
  | { kind: 'request'; id: string; service: string; from?: string; host?: string; path?: string }
  | { kind: 'rollout-restart'; target: string }
  | { kind: 'delete'; object: { kind: Kind; name: string } }
  | { kind: 'add-node'; node: Scenario['nodes'][number] }
  | { kind: 'edit-config'; name: string; key: string; value: string }
  | { kind: 'cordon' | 'uncordon' | 'drain'; node: string }
  | { kind: 'taint'; node: string; taint: Taint }
);

export type Fault =
  | { kind: 'node-down'; node: string; at: number }
  /** Every container of a pod whose name starts with prefix exits afterS after each start. */
  | { kind: 'crash'; prefix: string; afterS: number; exitCode: 0 | 1 }
  | { kind: 'bad-image'; image: string }
  /** The first Running pod (name order) whose name starts with prefix. */
  | { kind: 'not-ready'; prefix: string; at: number }
  | { kind: 'down'; component: 'scheduler' | 'controllers' | 'etcd'; from: number; to: number }
  /** The app answers probes only `seconds` after its container starts. */
  | { kind: 'slow-start'; prefix: string; seconds: number }
  /** The app stops answering liveness probes from `at`. */
  | { kind: 'hang'; prefix: string; at: number }
  /** Memory grows by `miPerS` while the container runs. */
  | { kind: 'leak'; prefix: string; miPerS: number };

export interface Scenario {
  nodes: { name: string; cpu: number; labels?: Labels; taints?: Taint[]; memory?: number }[];
  actions: Action[];
  faults: Fault[];
  /** Defaults to MAX_TIME. */
  until?: number;
  /** Keep running to `until` even when only periodic work (metrics, HPA, autoscaler, probes) is left. */
  runToEnd?: boolean;
  /** Request rate over time, aimed at a Deployment's ready pods. */
  load?: { target: string; points: [number, number][]; cpuPerRequest: number };
  /** The Cluster Autoscaler's node pool. */
  pool?: { cpu: number; memory: number; labels?: Labels; min: number; max: number };
  schedulerStrategy?: 'LeastAllocated' | 'MostAllocated';
  /** An Ingress controller (ingress-nginx) is installed. */
  ingressController?: boolean;
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
  | 'filter'
  | 'metrics'
  | 'throttle'
  | 'oom-kill'
  | 'evict'
  | 'evict-refused'
  | 'probe-fail'
  | 'probe-ok'
  | 'hpa'
  | 'node-add'
  | 'node-remove'
  | 'cordon'
  | 'taint'
  | 'config'
  | 'config-error'
  | 'create-claim'
  | 'bind-volume'
  | 'provision'
  | 'attach'
  | 'attach-fail'
  | 'reclaim'
  | 'job'
  | 'cron'
  | 'ingress'
  | 'policy-drop'
  | 'operator'
  | 'node-join'
  | 'records'
  | 'summary';

/** The scheduler's view of one pod: each node's filter result or scores. */
export interface Breakdown {
  pod: string;
  rows: { node: string; filtered?: string; scores?: Record<string, number>; total?: number; chosen?: boolean }[];
}

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
  breakdown?: Breakdown;
}

export interface RequestState {
  id: string;
  service: string;
  status: 'pending' | 'ok' | 'failed';
  pod?: string;
  reason?: string;
  from?: string;
  host?: string;
  path?: string;
  /** What the pod answered. */
  body?: string;
}

export interface Snapshot {
  t: number;
  nodes: NodeObj[];
  pods: Pod[];
  replicaSets: ReplicaSet[];
  deployments: Deployment[];
  services: Service[];
  endpoints: Endpoints[];
  hpas: HorizontalPodAutoscaler[];
  pdbs: PodDisruptionBudget[];
  configMaps: ConfigMap[];
  secrets: Secret[];
  storageClasses: StorageClass[];
  volumes: PersistentVolume[];
  claims: PersistentVolumeClaim[];
  statefulSets: StatefulSet[];
  daemonSets: DaemonSet[];
  jobs: Job[];
  cronJobs: CronJob[];
  ingresses: Ingress[];
  networkPolicies: NetworkPolicy[];
  crds: CustomResourceDefinition[];
  databases: Database[];
  /** The traffic so far: current req/s and one value per metrics tick. */
  load?: { rps: number; points: number[] };
  down: Component[];
  /** Nodes that are really down, whether or not the control plane has noticed yet. */
  offline: string[];
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
  /** True when a runToEnd scenario ran to its until. */
  ranToEnd?: boolean;
  /** The cluster when the run ended, which can be later than the last frame. */
  final?: Snapshot;
}

/** True for 0 or "0%": the values Kubernetes refuses when both maxSurge and maxUnavailable have them. */
export const isZero = (amount: Amount) => amount === 0 || amount === '0%';

/** A count, or a percentage of `replicas` rounded the way Kubernetes rounds it (surge up, unavailable down). */
export function resolveAmount(amount: Amount, replicas: number, round: 'up' | 'down'): number {
  if (typeof amount === 'number') return amount;
  const exact = (parseFloat(amount) / 100) * replicas;
  return round === 'up' ? Math.ceil(exact) : Math.floor(exact);
}

/** CPU request in millicores: the explicit request, else the limit (Kubernetes copies it), else phase 1 cores. */
export function cpuRequestM(p: Pick<Pod, 'cpu' | 'resources'>): number {
  return p.resources?.cpu?.request ?? p.resources?.cpu?.limit ?? p.cpu * 1000;
}

export function memoryRequestMi(p: Pick<Pod, 'resources'>): number {
  return p.resources?.memory?.request ?? p.resources?.memory?.limit ?? 0;
}

/** Guaranteed: CPU and memory limits equal to their requests; BestEffort: nothing set; otherwise Burstable. */
export function qosOf(r: Resources | undefined): 'BestEffort' | 'Burstable' | 'Guaranteed' {
  const set = [r?.cpu?.request, r?.cpu?.limit, r?.memory?.request, r?.memory?.limit].some((v) => v !== undefined);
  if (!set) return 'BestEffort';
  const pinned = (x?: { request?: number; limit?: number }) => x?.limit !== undefined && (x.request ?? x.limit) === x.limit;
  return pinned(r?.cpu) && pinned(r?.memory) ? 'Guaranteed' : 'Burstable';
}

export function tolerates(tolerations: Toleration[] | undefined, taint: Taint): boolean {
  return (tolerations ?? []).some(
    (t) => t.key === taint.key && (t.effect === undefined || t.effect === taint.effect) && (t.operator === 'Exists' || t.value === taint.value),
  );
}

/** The request rate at t: linear between points, constant before the first and after the last. */
export function loadAt(points: [number, number][], t: number): number {
  if (points.length === 0) return 0;
  const after = points.findIndex(([at]) => at > t);
  if (after === 0) return points[0]![1];
  if (after === -1) return points.at(-1)![1];
  const [t0, r0] = points[after - 1]!;
  const [t1, r1] = points[after]!;
  return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0);
}

/** A node's labels, with the hostname label every node has. */
export const nodeLabels = (n: NodeObj): Labels => ({ 'kubernetes.io/hostname': n.name, ...n.labels });
