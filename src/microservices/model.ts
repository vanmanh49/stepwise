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
  /** "v1", "v2": the release it runs. */
  version?: string;
}

/**
 * What a query to a db does with its records. Keys and values may use {req} (the request id), {key} and {value}
 * (the request's data). A write of several records is atomic; `add` adds integers ("+50"), a missing key counting as 0.
 */
export type DataOp =
  | { read: string }
  | { write: Record<string, string> }
  | { delete: string[] }
  | { add: Record<string, string> }
  | { append: string };

/** A downstream call. `columns` are what a query to a db reads, e.g. "users.name". */
export interface Call {
  to: string;
  columns?: string[];
  /** Made only for requests whose path starts with this prefix. */
  when?: string;
  policy?: CallPolicy;
  /** The message label for this call, e.g. "OrderPlaced"; the request's label otherwise. */
  label?: string;
  /** For a call to a db: what the query does with its records. */
  data?: DataOp;
  /** The path this call sends, e.g. "/refund"; the callee's `when` checks it. The request's path otherwise. */
  path?: string;
  /** In a sequential service: the call that undoes this one when a later call fails (a saga step's compensation). */
  compensate?: Call;
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
    | { type: 'db'; processMs: number; columns: string[]; records?: Record<string, string> }
    /** queue: consumers' instances compete for one queue. topic: one queue per consumer service, each gets a copy. */
    | { type: 'broker'; processMs: number; mode: 'queue' | 'topic'; consumers: string[]; redeliverMs: number }
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
  /** The data it carries, e.g. key "order 42" and value "paid". */
  key?: string;
  value?: string;
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
  | { kind: 'lose-reply'; node: string; request: string }
  /** `node` (a service or one instance) answers with `reason` instead of working, with chance `rate`; `version`, `request` and `from` narrow it. */
  | { kind: 'errors'; node: string; rate: number; reason: string; version?: string; request?: string; from?: number }
  /** The gateway's route for `prefix` points at `to` from `at` on (added when missing). */
  | { kind: 'reroute'; gateway: string; at: number; prefix: string; to: string };

export interface Scenario {
  nodes: NodeSpec[];
  links: Link[];
  requests: RequestSpec[];
  faults: Fault[];
  seed?: number;
  /** Applies to every request the client sends. */
  clientPolicy?: CallPolicy;
}

export type MessageKind = 'request' | 'reply' | 'query' | 'lookup' | 'heartbeat' | 'probe' | 'deliver';

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
  /** Deliver messages only: "#3/email". */
  delivery?: string;
  /** A call's own path ("/refund"), checked by the callee's `when`. */
  path?: string;
  /** Replies only: the value a read found, passed back up the chain. */
  value?: string;
}

export type TraceEvent = { t: number } & (
  | { kind: 'send'; message: Message }
  | { kind: 'arrive'; message: Message }
  | { kind: 'handle'; node: string; instance?: string; request: string }
  /** error: the instance answered with an error (an `errors` fault) rather than breaking. */
  | { kind: 'fail'; at: string; request?: string; reason: string; error?: boolean }
  | { kind: 'compensate'; node: string; instance: string; request: string; target: string; path?: string }
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
  /** label: the message without its request id, e.g. "OrderPlaced". */
  | { kind: 'store'; broker: string; request: string; label: string; queues: string[] }
  | { kind: 'requeue'; broker: string; delivery: string; reason: string }
  | { kind: 'delivered'; delivery: string; consumer?: string; ok: boolean; ms: number; reason?: string }
  /** A deleted key has the value null. */
  | { kind: 'write'; db: string; request: string; records: Record<string, string | null> }
  | { kind: 'read'; db: string; request: string; key: string; value?: string; replayed?: number }
  | { kind: 'done'; request: string; ok: boolean; ms: number; reason?: string; value?: string }
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
  /** The value the answer carried, e.g. what a read found. */
  value?: string;
}

/** One copy of a stored message, for one queue: "#3/email". ms runs from store to ack. */
export interface DeliveryOutcome {
  id: string;
  request: string;
  /** "OrderPlaced → email" */
  label: string;
  queue: string;
  /** The instance that acked it. */
  consumer?: string;
  status: 'ok' | 'failed';
  ms: number;
  attempts: number;
  reason?: string;
}

export interface SimResult {
  trace: TraceEvent[];
  requests: RequestOutcome[];
  deliveries: DeliveryOutcome[];
  endedAt: number;
  timedOut: boolean;
}
