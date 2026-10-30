export type Role =
  | 'default'
  | 'active'
  | 'compare'
  | 'swap'
  | 'sorted'
  | 'found'
  | 'visited'
  | 'frontier'
  | 'discarded'
  | 'pivot';

export interface Cell {
  /** Stable across steps so renderers can animate position changes. */
  id: string;
  value: number | string;
  role: Role;
}

export interface ArrayView {
  kind: 'array';
  cells: Cell[];
  /** Pointer name → index, e.g. { i: 0, j: 1 }. */
  pointers?: Record<string, number>;
  aux?: { label: string; cells: Cell[] };
}

export interface ListView {
  kind: 'linked-list';
  nodes: Cell[];
  /** Pointer name → node index; an index equal to nodes.length points at null. */
  pointers?: Record<string, number>;
}

/** The last item is the top. */
export interface StackView {
  kind: 'stack';
  items: Cell[];
}

/** The first item is the front. */
export interface QueueView {
  kind: 'queue';
  items: Cell[];
}

export interface TreeNode {
  id: string;
  value: number;
  role: Role;
  left?: string;
  right?: string;
  /** Short text drawn above the node, e.g. a balance factor or a range. */
  badge?: string;
  /** A red-black tree node's colour. */
  color?: 'red' | 'black';
}

export interface TreeView {
  kind: 'tree';
  root?: string;
  nodes: TreeNode[];
}

/** Array-backed binary heap; the tree shape is derived from the index. */
export interface HeapView {
  kind: 'heap';
  items: Cell[];
}

export interface GraphNodeView {
  id: string;
  label: string;
  x: number;
  y: number;
  role: Role;
  badge?: string;
}

export interface GraphEdgeView {
  from: string;
  to: string;
  weight?: number;
  /** Shown instead of the weight when set, e.g. "3/5" for flow over capacity. */
  label?: string;
  role: Role;
}

export interface GraphView {
  kind: 'graph';
  directed: boolean;
  nodes: GraphNodeView[];
  edges: GraphEdgeView[];
  frontier?: { label: string; items: string[] };
  /** Per-node table: rows keyed by node label. */
  table?: { columns: string[]; rows: Record<string, string[]> };
}

export interface SqlRow {
  /** Stable across steps so the renderer can follow a row. */
  id: string;
  cells: (number | string | null)[];
  role: Role;
  /** Column indexes to highlight in this row. */
  focus?: number[];
  /** Group number while GROUP BY is shown. */
  group?: number;
  /** Short mark shown at the end of the row, e.g. "kept", "removed", "no match". */
  note?: string;
}

export interface SqlTable {
  /** "orders", "after WHERE", "result". */
  label: string;
  columns: string[];
  /** One short constraint badge per column, such as "PK" or "NOT NULL"; empty strings for none. */
  columnNotes?: string[];
  rows: SqlRow[];
}

/** SQL tables at one point of a query, with the clauses the query uses. */
export interface TableView {
  kind: 'table';
  /** Clauses this query uses, in logical order. */
  clauses: string[];
  /** The clause being run. */
  current?: string;
  /** 1–3 tables: inputs, then the working or result table. */
  tables: SqlTable[];
  /** An index being searched, drawn above the tables. */
  index?: BTreeView;
}

/** An index drawn as a B+ tree: inner nodes hold separator keys, leaves hold the indexed values, linked left to right. */
export interface BTreeView {
  kind: 'btree';
  /** "idx_salary on employees(salary)". */
  label: string;
  root: string;
  nodes: { id: string; keys: string[]; children: string[]; leaf: boolean; role: Role; matched: number[] }[];
  /** Whether leaves link left to right, as in a B+ tree; defaults to true. */
  linked?: boolean;
}

/** A trie: one node per prefix. The root has an empty letter and no parent. */
export interface TrieView {
  kind: 'trie';
  nodes: { id: string; parent?: string; letter: string; /** Set on a node that ends a word. */ word?: string; role: Role }[];
}

/** A two-session script: each statement in its session's column, then the tables as each session sees them. */
export interface SessionsView {
  kind: 'sessions';
  rows: { session: 'A' | 'B'; text: string; status: 'ran' | 'waiting' | 'resumed' | 'skipped' | 'error' | 'still waiting' | 'next'; anomaly?: string; active: boolean }[];
  tables: SqlTable[];
}

/** A grid cell; `heat` (0–1) shades a default-role cell, e.g. an attention weight. */
export interface GridCell extends Cell {
  heat?: number;
}

/** A labelled 2-D table: DP tables, boards, and text rows aligned with null gaps. */
export interface GridView {
  kind: 'grid';
  /** Column headers, e.g. capacities 0..C or the characters of a string. */
  colLabels?: string[];
  rows: { label?: string; cells: (GridCell | null)[] }[];
  /** Dependency arrows between cells, as [row, col] pairs. */
  arrows?: { from: [number, number]; to: [number, number] }[];
}

export interface CallFrame {
  id: string;
  parent?: string;
  /** e.g. "fib(4)". */
  label: string;
  /** Return value once the frame has finished. */
  result?: string;
  role: Role;
}

/** A recursion tree: one frame per call. */
export interface CallsView {
  kind: 'calls';
  frames: CallFrame[];
}

/** Values distributed into labelled buckets, e.g. radix sort's digit buckets. */
export interface BucketsView {
  kind: 'buckets';
  /** The array being distributed or collected. */
  input?: { label: string; cells: Cell[] };
  buckets: { label: string; cells: Cell[] }[];
  /** "up" stacks cells from the bottom (radix sort); "down" lists a chain from the top, in wide cells. Defaults to "up". */
  direction?: 'up' | 'down';
}

/** A simulated microservice system: nodes in layout columns, the messages crossing its links, and each request's progress. */
/** One span of a trace: from a request reaching a node to that node's reply. No `ms` while it is still open. */
export interface SpanRow {
  id: string;
  label: string;
  start: number;
  ms?: number;
  depth: number;
  trace: string;
  role: Role;
}

export interface ServicesView {
  kind: 'services';
  nodes: {
    id: string;
    label: string;
    type: 'client' | 'gateway' | 'registry' | 'balancer' | 'service' | 'db' | 'broker' | 'relay' | 'sidecar' | 'attacker';
    column: number;
    role: Role;
    badge?: string;
    /** A service's instances; for a broker, its queues (badge: what is waiting); for a db, its records (badge: the value). */
    instances?: { id: string; role: Role; badge?: string }[];
  }[];
  links: { from: string; to: string; role: Role }[];
  /** Messages in flight at this step, between node ids; progress runs from 0 (just sent) to 1 (arrived). */
  messages: { id: string; from: string; to: string; label: string; role: Role; progress: number }[];
  /** label: "GET /orders"; hops: the path taken so far, e.g. "gw → orders-2 → db". */
  requests: { id: string; label: string; status: 'pending' | 'ok' | 'failed'; hops: string; ms?: number; reason?: string; attempts?: number; value?: string }[];
  /** The last few events, newest last. */
  log: string[];
  /** A trace waterfall: title such as "trace of #2"; endMs is the timeline's right edge, nowMs the step's time (open spans reach it). */
  spans?: { title: string; endMs: number; nowMs: number; rows: SpanRow[] };
}

/** A simulated Kubernetes cluster: the control plane, worker nodes with their pods, and the objects it reconciles. */
export interface ClusterView {
  kind: 'cluster';
  /** The control-plane components; the one acting in this step has role 'active'. */
  controlPlane: { id: 'api-server' | 'etcd' | 'scheduler' | 'controllers'; label: string; role: Role; badge?: string }[];
  nodes: {
    name: string;
    /** What the control plane believes: false once it has marked the node NotReady. */
    ready: boolean;
    /** The node is really down, noticed or not. */
    offline?: boolean;
    role: Role;
    /** CPU requested by its pods vs capacity, in cores. */
    cpu: { used: number; capacity: number };
    /** Memory used by its pods vs capacity, in MiB, once anything reports memory. */
    memory?: { used: number; capacity: number };
    /** Shown as badges: "zone=a", "gpu=true:NoSchedule". */
    labels?: string[];
    taints?: string[];
    cordoned?: boolean;
    booting?: boolean;
    memoryPressure?: boolean;
    /** phase: Pending | ContainerCreating | Running | CrashLoopBackOff | ImagePullBackOff | Completed | Failed | Lost. */
    pods: {
      name: string;
      phase: string;
      ready: boolean;
      role: Role;
      badge?: string;
      /** CPU use against request and limit, in millicores, once metrics run. */
      cpu?: { used: number; request?: number; limit?: number };
      qos?: string;
      /** "throttled", "OOMKilled", "Liveness probe failed". */
      note?: string;
      /** What it mounts and reads: "data-db-0 · 45 records", "emptyDir · 20 records", "config: color=green". */
      mounts?: string[];
      /** A StatefulSet pod's stable DNS name: "db-0.db". */
      dns?: string;
    }[];
  }[];
  /** Pods not bound to any node yet. */
  pending: { name: string; role: Role; reason?: string; badge?: string }[];
  /** Workload objects: desired vs current vs ready. */
  objects: { kind: string; name: string; desired?: number; current?: number; ready?: number; note?: string; role: Role }[];
  /** Client requests to a Service. */
  requests?: { id: string; label: string; status: 'pending' | 'ok' | 'failed'; endpoint?: string; reason?: string; body?: string }[];
  /** Requests older than the ones listed, folded into counts. */
  requestsEarlier?: { count: number; ok: number; failed: number };
  /** Requests per second now, and one value per metrics tick so far. */
  traffic?: { rps: number; points: number[] };
  /** The scheduler's filters and scores for one pod. */
  scoring?: { pod: string; rows: { node: string; filtered?: string; scores?: Record<string, number>; total?: number; chosen?: boolean; role: Role }[] };
  /** Rules that decided this step (Ingress paths, NetworkPolicies), the deciding row highlighted. */
  rules?: { title: string; columns: string[]; rows: { cells: string[]; role: Role }[] };
  /** The last few steps, newest last. */
  log: string[];
}

/** A probability distribution as labelled horizontal bars, e.g. a model's next-token probabilities. */
export interface DistributionView {
  kind: 'distribution';
  /** e.g. "P(next word | the cat sat on the)". */
  title?: string;
  bars: { id: string; label: string; value: number; role: Role }[];
  /** Bars from this index on were cut (top-k / top-p); drawn as a marker between bars. */
  cutoff?: number;
  /** Index of the training target, marked with a label. */
  target?: number;
}

/** Several views shown together in one step. Panels do not nest. */
export interface PanelsView {
  kind: 'panels';
  panels: { label?: string; view: Exclude<View, PanelsView> }[];
}

export type View =
  | BTreeView
  | TrieView
  | SessionsView
  | ArrayView
  | ListView
  | StackView
  | QueueView
  | TreeView
  | HeapView
  | GraphView
  | TableView
  | GridView
  | CallsView
  | BucketsView
  | ServicesView
  | ClusterView
  | DistributionView
  | PanelsView;

export interface Step {
  /** What happened. */
  title: string;
  /** Why it happened. */
  why: string;
  /** What happens next. */
  next?: string;
  /** 1-based line in the lesson's code. */
  codeLine?: number;
  variables?: Record<string, string | number>;
  view: View;
}
