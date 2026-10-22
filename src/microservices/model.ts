/** The simulated system a microservices lesson runs: topology, workload and faults. */

/** Simulated milliseconds after which a run stops; requests still open then fail. */
export const MAX_TIME = 10_000;
/** Steps shown for one run; anything after is summarised in one more step. */
export const MAX_STEPS = 200;

export type Strategy = 'round-robin' | 'least-connections' | 'random';

/** attempts = retries after the first try. */
export interface RetryPolicy {
  attempts: number;
  backoff: 'none' | 'fixed' | 'exponential';
  baseMs: number;
  jitter: boolean;
}

/** How a caller protects itself on one call: each attempt passes the bulkhead, then the breaker, then goes out with its timeout. */
export interface CallPolicy {
  timeoutMs?: number;
  retry?: RetryPolicy;
  /** Opens after `threshold` failures in a row; stays open for `openMs`. */
  breaker?: { threshold: number; openMs: number };
  /** At most `size` calls in flight from one caller instance through the pool named `pool`. */
  bulkhead?: { pool: string; size: number };
}

export type BreakerState = 'closed' | 'open' | 'half-open';

/** Fixed window: `limit` per window. Token bucket: starts full, refills `limit` tokens per `windowMs`. */
export interface RateLimit {
  algorithm: 'fixed-window' | 'token-bucket';
  limit: number;
  windowMs: number;
  /** One count for everyone, or one per request caller. */
  per: 'all' | 'caller';
}

export interface Instance {
  id: string;
  processMs: number;
}

/** A downstream call. `columns` are what a query to a db reads, e.g. "users.name". */
export interface Call {
  to: string;
  columns?: string[];
  /** Made only for requests whose path starts with this prefix. */
  when?: string;
  policy?: CallPolicy;
}

interface NodeBase {
  id: string;
  label: string;
  /** Layout column, left to right: client 0, gateway 1, services 2… */
  column: number;
}

export type NodeSpec = NodeBase &
  (
    | { type: 'client'; discovery?: { registry: string; service: string } }
    | { type: 'gateway'; processMs: number; routes: { prefix: string; to: string }[]; requireToken: boolean; rateLimit?: RateLimit }
    | { type: 'registry'; processMs: number; heartbeatMs: number; ttlMs: number; serves: string[] }
    | { type: 'balancer'; processMs: number; target: string; strategy: Strategy; healthCheckMs?: number }
    | { type: 'service'; instances: Instance[]; calls: Call[]; parallel: boolean; dedupe?: boolean }
    | { type: 'db'; processMs: number; columns: string[] }
  );

export type NodeType = NodeSpec['type'];

export interface Link {
  from: string;
  to: string;
  latencyMs: number;
}

/** `to` is the first hop's node id; ids are "#1", "#2", … in send order. */
export interface RequestSpec {
  label: string;
  path: string;
  to: string;
  at: number;
  token?: boolean;
  /** Who sent it, for per-caller rate limits. */
  caller?: string;
}

export type Fault =
  | { kind: 'kill'; instance: string; at: number }
  | { kind: 'slow'; instance: string; processMs: number; from: number }
  | { kind: 'down'; node: string; at: number }
  /** The instance that handles a request whose path starts with `prefix` crashes, as a bug would make it. */
  | { kind: 'crash-on'; node: string; prefix: string }
  /** The owner service's own queries are updated; everyone else's are not. */
  | { kind: 'rename-column'; node: string; from: string; to: string; at: number; owner: string }
  /** Every instance of a service refuses connections (`refuse`) or accepts and never answers (`hang`) between from and until. */
  | { kind: 'outage'; node: string; from: number; until: number; mode: 'refuse' | 'hang' }
  /** The first reply `node` sends for `request` is lost on the network. */
  | { kind: 'lose-reply'; node: string; request: string };

export interface Scenario {
  nodes: NodeSpec[];
  links: Link[];
  requests: RequestSpec[];
  faults: Fault[];
  seed?: number;
  /** Applies to every request the client sends. */
  clientPolicy?: CallPolicy;
}

export type MessageKind = 'request' | 'reply' | 'query' | 'lookup' | 'heartbeat' | 'probe';

export interface Message {
  /** "m1", "m2", … in send order. */
  id: string;
  /** "#3"; absent for heartbeats and probes. */
  request?: string;
  kind: MessageKind;
  /** Node or instance id. */
  from: string;
  /** Node or instance id. */
  to: string;
  /** "GET /orders #3", "reply #3", "heartbeat orders-2". */
  label: string;
  departs: number;
  arrives: number;
  /** Replies only: the message this answers. */
  replyTo?: string;
  /** Replies only. */
  ok?: boolean;
  /** Failed replies only. */
  reason?: string;
  /** Replies to a lookup: the registered instances. */
  result?: string[];
}

export type TraceEvent = { t: number } & (
  | { kind: 'send'; message: Message }
  | { kind: 'arrive'; message: Message }
  | { kind: 'handle'; node: string; instance?: string; request: string }
  | { kind: 'fail'; at: string; request?: string; reason: string }
  | { kind: 'register' | 'heartbeat' | 'evict'; registry: string; instance: string }
  | { kind: 'lookup'; registry: string; service: string; result: string[] }
  | { kind: 'pick'; balancer: string; instance: string; strategy: Strategy; inFlight: Record<string, number> }
  | { kind: 'route'; gateway: string; request: string; to: string }
  | { kind: 'reject'; gateway: string; request: string; status: 401 | 404 | 429 }
  | { kind: 'limit'; gateway: string; request: string; key: string; allowed: boolean; used: number; limit: number }
  | { kind: 'mark'; balancer: string; instance: string; healthy: boolean }
  | { kind: 'fault'; fault: Fault }
  | { kind: 'recover'; node: string }
  | { kind: 'lost'; message: Message }
  | { kind: 'duplicate'; node: string; instance: string; request: string; status: 'replayed' | 'in progress' }
  | { kind: 'timeout'; caller: string; target: string; request: string; afterMs: number }
  /** An answer that arrived after its caller stopped waiting. */
  | { kind: 'late'; message: Message }
  | { kind: 'retry'; caller: string; request: string; attempt: number; max: number; delayMs: number }
  /** caller and target are owners (service ids, or the client). */
  | { kind: 'breaker'; caller: string; target: string; state: BreakerState; failures: number; threshold: number }
  | { kind: 'shed'; caller: string; request: string; reason: 'circuit open' | 'bulkhead full' }
  | { kind: 'pool'; caller: string; pool: string; used: number; size: number }
  | { kind: 'done'; request: string; ok: boolean; ms: number; reason?: string }
);

export interface RequestOutcome {
  id: string;
  label: string;
  sentAt: number;
  status: 'ok' | 'failed';
  ms: number;
  /** Node and instance ids the request reached, in order. */
  hops: string[];
  /** Messages between two different service nodes. */
  crossServiceCalls: number;
  /** Request messages the client sent for it: 1 plus its retries. */
  attempts: number;
  reason?: string;
}

export interface SimResult {
  trace: TraceEvent[];
  requests: RequestOutcome[];
  endedAt: number;
  timedOut: boolean;
}
