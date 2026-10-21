import { MAX_TIME, type Call, type Message, type NodeSpec, type NodeType, type RequestOutcome, type Scenario, type SimResult, type TraceEvent } from './model';
import { balancer, createDiscovery, gateway, registry } from './behaviours';
import { EventQueue } from './queue';

type Distribute<T> = T extends unknown ? Omit<T, 't'> : never;
/** A trace event before the simulator stamps its time. */
export type TraceInput = Distribute<TraceEvent>;

export interface SimContext {
  readonly now: number;
  node(id: string): NodeSpec;
  /** The service that owns an instance; any other id is its own owner. */
  ownerOf(id: string): string;
  instancesOf(service: string): string[];
  requestInfo(id: string): { label: string; path: string; token: boolean };
  /** Sends over the link between the two owners; `onReply` runs when the answer arrives. */
  send(from: string, to: string, message: Pick<Message, 'kind' | 'label'> & { request?: string }, onReply?: (reply: Message) => void): Message;
  reply(to: Message, ok: boolean, reason?: string, result?: string[]): void;
  /** Sends a request on to `to` and passes its answer back to whoever sent `inbound`. */
  forward(from: string, to: string, inbound: Message): void;
  at(time: number, run: () => void): void;
  trace(event: TraceInput): void;
  isDead(instance: string): boolean;
  rng(): number;
}

/** Built once per run for each node; returns what the node does with each message it receives. */
export type Behaviour = (ctx: SimContext, node: NodeSpec) => (message: Message) => void;

/** Seeded random numbers (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OpenRequest {
  outcome: RequestOutcome;
  path: string;
  token: boolean;
  done: boolean;
}

export function simulate(input: Scenario): SimResult {
  const scenario = structuredClone(input) as Scenario;
  const nodes = new Map(scenario.nodes.map((n) => [n.id, n]));
  const owner = new Map<string, string>();
  for (const n of scenario.nodes) if (n.type === 'service') for (const i of n.instances) owner.set(i.id, n.id);
  const processMs = new Map<string, number>();
  for (const n of scenario.nodes) if (n.type === 'service') for (const i of n.instances) processMs.set(i.id, i.processMs);

  const queue = new EventQueue<() => void>();
  const trace: TraceEvent[] = [];
  const requests = new Map<string, OpenRequest>();
  const awaiting = new Map<string, (reply: Message) => void>();
  const dead = new Set<string>();
  const down = new Set<string>();
  /** What each live instance is handling right now, and the jobs a death cut short. */
  const jobs = new Map<string, Set<Message>>();
  const aborted = new Set<Message>();
  /** The columns each query reads, by message id, kept beside the message rather than parsed from its label. */
  const queryColumns = new Map<string, string[]>();
  const random = rng(scenario.seed ?? 1);
  let now = 0;
  let messages = 0;

  const ownerOf = (id: string) => owner.get(id) ?? id;
  const latency = (from: string, to: string) => {
    const [a, b] = [ownerOf(from), ownerOf(to)];
    const link = scenario.links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));
    if (!link) throw new Error(`Scenario has no link between ${a} and ${b}`);
    return link.latencyMs;
  };

  const ctx: SimContext = {
    get now() {
      return now;
    },
    node: (id) => nodes.get(ownerOf(id))!,
    ownerOf,
    instancesOf: (service) => {
      const n = nodes.get(service);
      return n?.type === 'service' ? n.instances.map((i) => i.id) : [];
    },
    requestInfo: (id) => {
      const r = requests.get(id)!;
      return { label: r.outcome.label, path: r.path, token: r.token };
    },
    send(from, to, partial, onReply) {
      const departs = now;
      const message: Message = { id: `m${++messages}`, ...partial, from, to, departs, arrives: departs + latency(from, to) };
      if (onReply) awaiting.set(message.id, onReply);
      ctx.trace({ kind: 'send', message });
      ctx.at(message.arrives, () => deliver(message));
      return message;
    },
    reply(to, ok, reason, result) {
      const departs = now;
      const message: Message = {
        id: `m${++messages}`,
        ...(to.request && { request: to.request }),
        kind: 'reply',
        from: to.to,
        to: to.from,
        label: `${ok ? 'reply' : 'failed'} ${to.request ?? to.label}`,
        departs,
        arrives: departs + latency(to.to, to.from),
        replyTo: to.id,
        ok,
        ...(reason !== undefined && { reason }),
        ...(result && { result }),
      };
      ctx.trace({ kind: 'send', message });
      ctx.at(message.arrives, () => deliver(message));
    },
    forward(from, to, inbound) {
      if (inbound.request) countCrossService(from, to, inbound.request);
      ctx.send(from, to, { kind: 'request', label: inbound.label, ...(inbound.request && { request: inbound.request }) }, (answer) =>
        ctx.reply(inbound, answer.ok ?? false, answer.reason),
      );
    },
    at: (time, run) => queue.push(time, run),
    trace: (event) => trace.push({ t: now, ...event } as TraceEvent),
    isDead: (instance) => dead.has(instance),
    rng: random,
  };

  function countCrossService(from: string, to: string, request: string) {
    const [a, b] = [nodes.get(ownerOf(from)), nodes.get(ownerOf(to))];
    if (a?.type === 'service' && b?.type === 'service' && a.id !== b.id) requests.get(request)!.outcome.crossServiceCalls++;
  }

  function kill(instance: string, crashed?: Message) {
    dead.add(instance);
    for (const job of jobs.get(instance) ?? []) {
      aborted.add(job);
      const reason = `${instance} ${job === crashed ? 'crashed' : 'stopped'}`;
      ctx.trace({ kind: 'fail', at: instance, ...(job.request && { request: job.request }), reason });
      ctx.reply(job, false, reason);
    }
    jobs.delete(instance);
  }

  function deliver(message: Message) {
    ctx.trace({ kind: 'arrive', message });
    const isInstance = owner.has(message.to);
    if (isInstance && dead.has(message.to)) {
      if (message.kind === 'reply') {
        awaiting.delete(message.replyTo!);
        ctx.trace({ kind: 'fail', at: message.to, ...(message.request && { request: message.request }), reason: `${message.to} has stopped, so its reply is lost` });
      } else {
        const reason = `${message.to} refused the connection`;
        ctx.trace({ kind: 'fail', at: message.to, ...(message.request && { request: message.request }), reason });
        ctx.reply(message, false, reason);
      }
      return;
    }
    if (message.kind === 'reply') {
      const handler = awaiting.get(message.replyTo!);
      awaiting.delete(message.replyTo!);
      handler?.(message);
      return;
    }
    if (message.request && (message.kind === 'request' || message.kind === 'query')) requests.get(message.request)?.outcome.hops.push(message.to);
    receivers.get(ownerOf(message.to))?.(message);
  }

  const serviceBehaviour: Behaviour = (_ctx, node) => (message) => {
    if (node.type !== 'service') return;
    const instance = message.to;
    if (message.kind === 'probe') return ctx.reply(message, true);
    const request = message.request!;
    ctx.trace({ kind: 'handle', node: node.id, instance, request });
    let active = jobs.get(instance);
    if (!active) jobs.set(instance, (active = new Set()));
    active.add(message);
    const crash = scenario.faults.find((f) => f.kind === 'crash-on' && f.node === node.id && requests.get(request)!.path.startsWith(f.prefix));
    if (crash) {
      ctx.trace({ kind: 'fault', fault: crash });
      kill(instance, message);
      return;
    }
    const finish = (ok: boolean, reason?: string) => {
      if (aborted.has(message)) return;
      jobs.get(instance)?.delete(message);
      ctx.reply(message, ok, reason);
    };
    const call = (target: Call, then: (reply: Message) => void) => {
      const to = nodes.get(target.to)!;
      countCrossService(instance, target.to, request);
      if (to.type === 'db') {
        const columns = target.columns ?? [];
        const query = ctx.send(instance, to.id, { kind: 'query', label: `query ${columns.length > 0 ? `${columns.join(', ')} ` : ''}${request}`, request }, then);
        queryColumns.set(query.id, columns);
      } else {
        const first = to.type === 'service' ? to.instances[0]!.id : to.id;
        ctx.send(instance, first, { kind: 'request', label: requests.get(request)!.outcome.label + ` ${request}`, request }, then);
      }
    };
    ctx.at(now + processMs.get(instance)!, () => {
      if (aborted.has(message)) return;
      if (node.parallel && node.calls.length > 0) {
        let left = node.calls.length;
        let failed = false;
        for (const target of node.calls) {
          call(target, (reply) => {
            if (failed || aborted.has(message)) return;
            if (!reply.ok) {
              failed = true;
              finish(false, reply.reason);
            } else if (--left === 0) finish(true);
          });
        }
        return;
      }
      const next = (index: number) => {
        const target = node.calls[index];
        if (!target) return finish(true);
        call(target, (reply) => (reply.ok ? next(index + 1) : finish(false, reply.reason)));
      };
      next(0);
    });
  };

  const dbBehaviour: Behaviour = (_ctx, node) => (message) => {
    if (node.type !== 'db') return;
    ctx.trace({ kind: 'handle', node: node.id, request: message.request! });
    ctx.at(now + node.processMs, () => {
      if (down.has(node.id)) return ctx.reply(message, false, `${node.id} is down`);
      const columns = queryColumns.get(message.id) ?? [];
      const missing = columns.find((c) => !node.columns.includes(c));
      if (missing) return ctx.reply(message, false, `no column ${missing}`);
      ctx.reply(message, true);
    });
  };

  const clientBehaviour: Behaviour = () => () => {};

  const behaviours: Record<NodeType, Behaviour> = { client: clientBehaviour, service: serviceBehaviour, db: dbBehaviour, gateway, registry, balancer };

  // Faults first, so a fault at time t applies before anything else that happens at t.
  for (const fault of scenario.faults) {
    if (fault.kind === 'kill') ctx.at(fault.at, () => (ctx.trace({ kind: 'fault', fault }), kill(fault.instance)));
    if (fault.kind === 'slow') ctx.at(fault.from, () => (ctx.trace({ kind: 'fault', fault }), processMs.set(fault.instance, fault.processMs)));
    if (fault.kind === 'down') ctx.at(fault.at, () => (ctx.trace({ kind: 'fault', fault }), down.add(fault.node)));
    if (fault.kind === 'rename-column') {
      ctx.at(fault.at, () => {
        ctx.trace({ kind: 'fault', fault });
        const db = nodes.get(fault.node);
        if (db?.type === 'db') db.columns = db.columns.map((c) => (c === fault.from ? fault.to : c));
        const ownerNode = nodes.get(fault.owner);
        if (ownerNode?.type === 'service') {
          for (const c of ownerNode.calls) if (c.to === fault.node && c.columns) c.columns = c.columns.map((col) => (col === fault.from ? fault.to : col));
        }
      });
    }
  }

  const receivers = new Map<string, (message: Message) => void>();
  for (const node of scenario.nodes) {
    receivers.set(node.id, behaviours[node.type](ctx, node));
  }

  const client = scenario.nodes.find((n) => n.type === 'client');
  const discover = client && createDiscovery(ctx, client);
  scenario.requests.forEach((spec, index) => {
    const id = `#${index + 1}`;
    const open: OpenRequest = {
      outcome: { id, label: spec.label, sentAt: spec.at, status: 'failed', ms: 0, hops: [], crossServiceCalls: 0 },
      path: spec.path,
      token: spec.token ?? false,
      done: false,
    };
    requests.set(id, open);
    ctx.at(spec.at, () => {
      if (!client) throw new Error('Scenario has no client');
      open.outcome.hops.push(client.id);
      const finish = (ok: boolean, reason?: string) => {
        if (open.done) return;
        open.done = true;
        open.outcome.status = ok ? 'ok' : 'failed';
        open.outcome.ms = now - spec.at;
        if (!ok && reason) open.outcome.reason = reason;
        ctx.trace({ kind: 'done', request: id, ok, ms: open.outcome.ms, ...(open.outcome.reason && { reason: open.outcome.reason }) });
      };
      if (discover) return discover(id, finish);
      const target = nodes.get(spec.to)!;
      const to = target.type === 'service' ? target.instances[0]!.id : target.id;
      ctx.send(client.id, to, { kind: 'request', label: `${spec.label} ${id}`, request: id }, (reply) => finish(reply.ok ?? false, reply.reason));
    });
  });

  let timedOut = false;
  const allDone = () => requests.size > 0 && [...requests.values()].every((r) => r.done);
  for (let next = queue.pop(); next; next = queue.pop()) {
    if (next.time > MAX_TIME) {
      timedOut = true;
      break;
    }
    now = next.time;
    next.item();
    if (allDone()) break;
  }

  for (const open of requests.values()) {
    if (open.done) continue;
    timedOut = true;
    now = MAX_TIME;
    open.done = true;
    open.outcome.ms = MAX_TIME - open.outcome.sentAt;
    open.outcome.reason = 'no reply by 10,000 ms';
    ctx.trace({ kind: 'done', request: open.outcome.id, ok: false, ms: open.outcome.ms, reason: open.outcome.reason });
  }

  return { trace, requests: [...requests.values()].map((r) => r.outcome), endedAt: now, timedOut };
}
