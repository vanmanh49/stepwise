import { MAX_TIME, type Call, type DataOp, type DeliveryOutcome, type Fault, type Message, type NodeSpec, type NodeType, type RequestOutcome, type Scenario, type SimResult, type TraceEvent } from './model';
import { balancer, createDiscovery, gateway, registry } from './behaviours';
import { broker } from './broker';
import { relay } from './relay';
import { EventQueue } from './queue';
import { createCaller, type CallFn } from './resilience';

type Distribute<T> = T extends unknown ? Omit<T, 't'> : never;
/** A trace event before the simulator stamps its time. */
export type TraceInput = Distribute<TraceEvent>;

export interface SimContext {
  readonly now: number;
  node(id: string): NodeSpec;
  /** The service that owns an instance; any other id is its own owner. */
  ownerOf(id: string): string;
  instancesOf(service: string): string[];
  requestInfo(id: string): { label: string; path: string; token: boolean; caller?: string; key?: string; value?: string };
  /** Sends over the link between the two owners; `onReply` runs when the answer arrives. */
  send(from: string, to: string, message: Pick<Message, 'kind' | 'label'> & { request?: string; delivery?: string; path?: string }, onReply?: (reply: Message) => void): Message;
  reply(to: Message, ok: boolean, reason?: string, result?: string[], value?: string, records?: [string, string][]): void;
  /** Sends a query that does `op` to a db; the label is what the view shows. */
  query(from: string, db: string, op: DataOp, label: string, request: string | undefined, onReply: (reply: Message) => void): Message;
  /** Stops waiting for `message`'s reply; when it comes, it is traced as late and dropped. */
  cancel(message: Message): void;
  /** Sends through a call policy (timeouts, retries, breaker, bulkhead); a plain send without one. */
  call: CallFn;
  /** Sends a request on to `to` and passes its answer back to whoever sent `inbound`. */
  forward(from: string, to: string, inbound: Message): void;
  at(time: number, run: () => void): void;
  trace(event: TraceInput): void;
  isDead(instance: string): boolean;
  /** False while an instance is not started yet, is draining, or has stopped after a deploy. */
  inRotation(instance: string): boolean;
  rng(): number;
}

/** Built once per run for each node; returns what the node does with each message it receives. */
export type Behaviour = (ctx: SimContext, node: NodeSpec) => (message: Message) => void;

/** Seeded random numbers (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fills {req}, {key} and {value} in a data call's key or value from the request it belongs to. */
export function fill(template: string, request: { id: string; key?: string; value?: string }): string {
  return template.replaceAll('{req}', request.id).replaceAll('{key}', request.key ?? '').replaceAll('{value}', request.value ?? '');
}

/** A data call with its templates filled in for one request. */
function fillOp(op: DataOp, request: { id: string; key?: string; value?: string }): DataOp {
  const f = (t: string) => fill(t, request);
  const map = (records: Record<string, string>) => Object.fromEntries(Object.entries(records).map(([k, v]) => [f(k), f(v)]));
  if ('read' in op) return { read: f(op.read) };
  if ('write' in op) return { write: map(op.write) };
  if ('add' in op) return { add: map(op.add) };
  if ('delete' in op) return { delete: op.delete.map(f) };
  return { append: f(op.append) };
}

interface OpenRequest {
  outcome: RequestOutcome;
  path: string;
  token: boolean;
  caller?: string;
  key?: string;
  value?: string;
  done: boolean;
}

export function simulate(input: Scenario): SimResult {
  const scenario = structuredClone(input) as Scenario;
  const nodes = new Map(scenario.nodes.map((n) => [n.id, n]));
  const owner = new Map<string, string>();
  for (const n of scenario.nodes) if (n.type === 'service') for (const i of n.instances) owner.set(i.id, n.id);
  const processMs = new Map<string, number>();
  const versionOf = new Map<string, string>();
  for (const n of scenario.nodes) {
    if (n.type !== 'service') continue;
    for (const i of n.instances) {
      processMs.set(i.id, i.processMs);
      if (i.version) versionOf.set(i.id, i.version);
    }
  }

  const queue = new EventQueue<() => void>();
  const trace: TraceEvent[] = [];
  const requests = new Map<string, OpenRequest>();
  const awaiting = new Map<string, (reply: Message) => void>();
  const cancelled = new Set<string>();
  /** Work not yet answered (requests, queries, deliveries until their reply is sent) and replies still on the wire, so the run waits for late answers. */
  const working = new Set<string>();
  const dead = new Set<string>();
  /** Deploy state: instances waiting for their start, stopping ones finishing their work, and those that stopped. */
  const notStarted = new Set(scenario.faults.flatMap((f) => (f.kind === 'deploy' && f.action === 'start' ? [f.instance] : [])));
  for (const id of notStarted) dead.add(id);
  const draining = new Set<string>();
  const retired = new Set<string>();
  /** Requests and deliveries on their way to each instance: a stopping instance waits for them too. */
  const incoming = new Map<string, number>();
  const drainIfIdle = (instance: string) => {
    if (!draining.has(instance) || (jobs.get(instance)?.size ?? 0) > 0 || (incoming.get(instance) ?? 0) > 0) return;
    draining.delete(instance);
    retired.add(instance);
    dead.add(instance);
    ctx.trace({ kind: 'drained', instance });
  };
  const down = new Set<string>();
  /** What each live instance is handling right now, and the jobs a death cut short. */
  const jobs = new Map<string, Set<Message>>();
  const aborted = new Set<Message>();
  /** The columns each query reads, by message id, kept beside the message rather than parsed from its label. */
  const queryColumns = new Map<string, string[]>();
  /** The data call each query makes, filled in for its request, by message id. */
  const queryOps = new Map<string, DataOp>();
  /** Each db's records, a copy of its starting records. */
  const records = new Map<string, Map<string, string>>();
  for (const n of scenario.nodes) if (n.type === 'db') records.set(n.id, new Map(Object.entries(n.records ?? {})));
  /** Each event store's appended events, and its latest snapshot. */
  const eventLogs = new Map<string, { events: number[]; snapshot?: { seq: number; value: number } }>();
  for (const n of scenario.nodes) if (n.type === 'db' && n.events) eventLogs.set(n.id, { events: [] });
  const random = seeded(scenario.seed ?? 1);
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
      return {
        label: r.outcome.label,
        path: r.path,
        token: r.token,
        ...(r.caller && { caller: r.caller }),
        ...(r.key !== undefined && { key: r.key }),
        ...(r.value !== undefined && { value: r.value }),
      };
    },
    send(from, to, partial, onReply) {
      const departs = now;
      const message: Message = { id: `m${++messages}`, ...partial, from, to, departs, arrives: departs + latency(from, to) };
      if (onReply) awaiting.set(message.id, onReply);
      if (message.kind === 'request' || message.kind === 'query' || message.kind === 'deliver') working.add(message.id);
      if ((message.kind === 'request' || message.kind === 'deliver') && owner.has(to)) incoming.set(to, (incoming.get(to) ?? 0) + 1);
      if (message.kind === 'request' && message.request && from === clientId) requests.get(message.request)!.outcome.attempts++;
      ctx.trace({ kind: 'send', message });
      ctx.at(message.arrives, () => deliver(message));
      return message;
    },
    reply(to, ok, reason, result, value, found) {
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
        ...(value !== undefined && { value }),
        ...(found && { records: found }),
      };
      working.delete(to.id);
      if (to.kind === 'request' || to.kind === 'query' || to.kind === 'deliver') working.add(message.id);
      ctx.trace({ kind: 'send', message });
      ctx.at(message.arrives, () => deliver(message));
    },
    forward(from, to, inbound) {
      if (inbound.request) countCrossService(from, to, inbound.request);
      ctx.send(from, to, { kind: 'request', label: inbound.label, ...(inbound.request && { request: inbound.request }) }, (answer) =>
        ctx.reply(inbound, answer.ok ?? false, answer.reason, undefined, answer.value),
      );
    },
    query(from, db, op, label, request, onReply) {
      const message = ctx.send(from, db, { kind: 'query', label, ...(request && { request }) }, onReply);
      queryOps.set(message.id, op);
      return message;
    },
    cancel(message) {
      awaiting.delete(message.id);
      cancelled.add(message.id);
    },
    call: (from, to, message, policy, done) => caller.call(from, to, message, policy, done),
    at: (time, run) => queue.push(time, run),
    trace: (event) => {
      const stamped = { t: now, ...event } as TraceEvent;
      trace.push(stamped);
      observeDeliveries(stamped);
    },
    isDead: (instance) => dead.has(instance),
    inRotation: (instance) => !notStarted.has(instance) && !draining.has(instance) && !retired.has(instance),
    rng: random,
  };

  const caller = createCaller(ctx);

  /** Each stored copy of a message, kept from the broker's events; open ones keep the run going. */
  const deliveries = new Map<string, DeliveryOutcome>();
  const storedAt = new Map<string, number>();
  const openDeliveries = new Set<string>();
  function observeDeliveries(event: TraceEvent) {
    if (event.kind === 'store') {
      for (const name of event.queues) {
        const id = `${event.request}/${name}`;
        deliveries.set(id, { id, request: event.request, label: `${event.label} → ${name}`, queue: name, status: 'failed', ms: 0, attempts: 0 });
        storedAt.set(id, event.t);
        openDeliveries.add(id);
      }
    }
    if (event.kind === 'send' && event.message.delivery) deliveries.get(event.message.delivery)!.attempts++;
    if (event.kind === 'delivered') {
      const d = deliveries.get(event.delivery)!;
      d.status = event.ok ? 'ok' : 'failed';
      d.ms = event.ms;
      if (event.consumer) d.consumer = event.consumer;
      if (event.reason) d.reason = event.reason;
      openDeliveries.delete(event.delivery);
    }
  }
  const clientId = scenario.nodes.find((n) => n.type === 'client')?.id;

  function countCrossService(from: string, to: string, request: string) {
    const [a, b] = [nodes.get(ownerOf(from)), nodes.get(ownerOf(to))];
    if (a?.type === 'service' && b?.type === 'service' && a.id !== b.id) requests.get(request)!.outcome.crossServiceCalls++;
  }

  function kill(instance: string, crashed?: Message) {
    dead.add(instance);
    caller.abandon(instance);
    for (const job of jobs.get(instance) ?? []) {
      aborted.add(job);
      const reason = `${instance} ${job === crashed ? 'crashed' : 'stopped'}`;
      ctx.trace({ kind: 'fail', at: instance, ...(job.request && { request: job.request }), reason });
      ctx.reply(job, false, reason);
    }
    jobs.delete(instance);
  }

  /** lose-reply faults whose reply has already been dropped. */
  const lostReplies = new Set<Fault>();
  const hanging = (service: string) =>
    scenario.faults.some((f) => f.kind === 'outage' && f.mode === 'hang' && f.node === service && f.from <= now && now < f.until);

  function deliver(message: Message) {
    const lose = scenario.faults.find(
      (f) => f.kind === 'lose-reply' && message.kind === 'reply' && ownerOf(message.from) === f.node && message.request === f.request && !lostReplies.has(f),
    );
    if (message.kind === 'reply') working.delete(message.id);
    if ((message.kind === 'request' || message.kind === 'deliver') && owner.has(message.to)) {
      incoming.set(message.to, (incoming.get(message.to) ?? 1) - 1);
      ctx.at(now, () => drainIfIdle(message.to));
    }
    if (lose) {
      lostReplies.add(lose);
      ctx.trace({ kind: 'lost', message });
      return;
    }
    ctx.trace({ kind: 'arrive', message });
    if (message.kind === 'reply' && cancelled.has(message.replyTo!)) {
      ctx.trace({ kind: 'late', message });
      return;
    }
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

  const serviceBehaviour: Behaviour = (_ctx, node) => {
    if (node.type !== 'service') return () => {};
    /** With dedupe: the result of each finished request, and the job of each one still running. */
    const finished = new Map<string, { ok: boolean; reason?: string }>();
    const running = new Map<string, Message>();
    return (message) => handle(node, message, finished, running);
  };

  function handle(node: Extract<NodeSpec, { type: 'service' }>, message: Message, finished: Map<string, { ok: boolean; reason?: string }>, running: Map<string, Message>) {
    const instance = message.to;
    if (hanging(node.id)) {
      if (message.request) ctx.trace({ kind: 'handle', node: node.id, instance, request: message.request });
      return;
    }
    if (message.kind === 'probe') return ctx.reply(message, true);
    const request = message.request!;
    if (node.dedupe) {
      const saved = finished.get(request);
      if (saved) {
        ctx.trace({ kind: 'duplicate', node: node.id, instance, request, status: 'replayed' });
        return ctx.reply(message, saved.ok, saved.reason);
      }
      const first = running.get(request);
      if (first && !aborted.has(first)) {
        ctx.trace({ kind: 'duplicate', node: node.id, instance, request, status: 'in progress' });
        return ctx.reply(message, false, 'already in progress');
      }
      running.set(request, message);
    }
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
    /** The last value any call answered with, passed back with the reply. */
    let value: string | undefined;
    const finish = (ok: boolean, reason?: string) => {
      if (aborted.has(message)) return;
      jobs.get(instance)?.delete(message);
      ctx.at(now, () => drainIfIdle(instance));
      if (node.dedupe) {
        running.delete(request);
        finished.set(request, { ok, ...(reason !== undefined && { reason }) });
      }
      ctx.reply(message, ok, reason, undefined, ok ? value : undefined);
    };
    const path = message.path ?? requests.get(request)!.path;
    const calls = node.calls.filter((c) => c.when === undefined || path.startsWith(c.when));
    const call = (target: Call, then: (ok: boolean, reason?: string) => void) => {
      const to = nodes.get(target.to)!;
      countCrossService(instance, target.to, request);
      const answered = (ok: boolean, reason?: string, answer?: string) => {
        if (ok && answer !== undefined) value = answer;
        const crashAfter = scenario.faults.find((f) => f.kind === 'crash-after' && f.node === node.id && f.request === request && f.after === target.to);
        if (ok && crashAfter?.kind === 'crash-after' && !aborted.has(message)) {
          ctx.trace({ kind: 'fault', fault: crashAfter });
          kill(instance, message);
          if (crashAfter.restartMs !== undefined) {
            ctx.at(now + crashAfter.restartMs, () => {
              dead.delete(instance);
              ctx.trace({ kind: 'recover', node: instance });
            });
          }
          return;
        }
        then(ok, reason);
      };
      if (to.type === 'db') {
        const columns = target.columns ?? [];
        const query = ctx.send(instance, to.id, { kind: 'query', label: `query ${columns.length > 0 ? `${columns.join(', ')} ` : ''}${request}`, request }, (reply) =>
          answered(reply.ok ?? false, reply.reason, reply.value),
        );
        queryColumns.set(query.id, columns);
        if (target.data) queryOps.set(query.id, fillOp(target.data, { id: request, ...ctx.requestInfo(request) }));
      } else {
        const first = to.type === 'service' ? to.instances[0]!.id : to.id;
        const label = target.label ?? target.path ?? requests.get(request)!.outcome.label;
        ctx.call(instance, first, { kind: 'request', label: `${label} ${request}`, request, ...(target.path && { path: target.path }) }, target.policy, answered);
      }
    };
    ctx.at(now + processMs.get(instance)!, () => {
      if (aborted.has(message)) return;
      const error = scenario.faults.find(
        (f) =>
          f.kind === 'errors' &&
          (f.node === node.id || f.node === instance) &&
          (f.version === undefined || versionOf.get(instance) === f.version) &&
          (f.request === undefined || f.request === request) &&
          (f.from === undefined || now >= f.from),
      );
      // Rates of 0 and 1 draw nothing, so they leave every other random choice in the run as it was.
      if (error?.kind === 'errors' && error.rate > 0 && (error.rate >= 1 || random() < error.rate)) {
        ctx.trace({ kind: 'fail', at: instance, request, reason: error.reason, error: true });
        return finish(false, error.reason);
      }
      if (node.parallel && calls.length > 0) {
        let left = calls.length;
        let failed = false;
        for (const target of calls) {
          call(target, (ok, reason) => {
            if (failed || aborted.has(message)) return;
            if (!ok) {
              failed = true;
              finish(false, reason);
            } else if (--left === 0) finish(true);
          });
        }
        return;
      }
      /** Calls that succeeded, oldest first: what a failure has to undo. */
      const succeeded: Call[] = [];
      const next = (index: number) => {
        const target = calls[index];
        if (!target) return finish(true);
        call(target, (ok, reason) => {
          if (!ok) return undo(succeeded.length - 1, reason);
          succeeded.push(target);
          next(index + 1);
        });
      };
      // Compensations run newest first, one at a time; a failed one doesn't stop the rest.
      const undo = (index: number, reason?: string) => {
        if (aborted.has(message)) return;
        const done = succeeded[index];
        if (!done) return finish(false, reason);
        if (!done.compensate) return undo(index - 1, reason);
        const { to, path: undoPath } = done.compensate;
        ctx.trace({ kind: 'compensate', node: node.id, instance, request, target: to, ...(undoPath && { path: undoPath }) });
        call(done.compensate, () => undo(index - 1, reason));
      };
      next(0);
    });
  }

  const dbBehaviour: Behaviour = (_ctx, node) => (message) => {
    if (node.type !== 'db') return;
    if (message.request) ctx.trace({ kind: 'handle', node: node.id, request: message.request });
    const log = eventLogs.get(node.id);
    const pending = queryOps.get(message.id);
    // A read from an event store replays every event since the latest snapshot, at perEventMs each.
    const replayed = log && pending && 'read' in pending && !pending.read.endsWith('*') ? log.events.length - (log.snapshot?.seq ?? 0) : 0;
    ctx.at(now + node.processMs + replayed * (node.events?.perEventMs ?? 0), () => {
      if (down.has(node.id)) return ctx.reply(message, false, `${node.id} is down`);
      const columns = queryColumns.get(message.id) ?? [];
      const missing = columns.find((c) => !node.columns.includes(c));
      if (missing) return ctx.reply(message, false, `no column ${missing}`);
      const op = queryOps.get(message.id);
      if (!op) return ctx.reply(message, true);
      const request = message.request ?? '';
      const data = records.get(node.id)!;
      if ('read' in op && op.read.endsWith('*')) {
        const prefix = op.read.slice(0, -1);
        return ctx.reply(message, true, undefined, undefined, undefined, [...data.entries()].filter(([key]) => key.startsWith(prefix)));
      }
      if (log && 'read' in op) {
        const value = String((log.snapshot?.value ?? 0) + log.events.slice(log.snapshot?.seq ?? 0).reduce((sum, n) => sum + n, 0));
        ctx.trace({ kind: 'read', db: node.id, request, key: op.read, value, replayed });
        return ctx.reply(message, true, undefined, undefined, value);
      }
      if (log && 'append' in op) {
        log.events.push(Number.parseInt(op.append, 10) || 0);
        const seq = log.events.length;
        data.set(`e${seq}`, op.append);
        ctx.trace({ kind: 'append', db: node.id, request, seq, event: op.append });
        const every = node.events?.snapshotEvery;
        if (every && seq % every === 0) {
          const value = log.events.reduce((sum, n) => sum + n, 0);
          log.snapshot = { seq, value };
          data.set(`snapshot @${seq}`, String(value));
          ctx.trace({ kind: 'snapshot', db: node.id, seq, value });
        }
        return ctx.reply(message, true);
      }
      if ('read' in op) {
        const value = data.get(op.read);
        ctx.trace({ kind: 'read', db: node.id, request, key: op.read, ...(value !== undefined && { value }) });
        return ctx.reply(message, true, undefined, undefined, value);
      }
      const changed: Record<string, string | null> = {};
      if ('write' in op) Object.assign(changed, op.write);
      if ('add' in op) for (const [key, by] of Object.entries(op.add)) changed[key] = String(Number.parseInt(data.get(key) ?? '0', 10) + Number.parseInt(by, 10));
      if ('delete' in op) for (const key of op.delete) if (data.has(key)) changed[key] = null;
      for (const [key, value] of Object.entries(changed)) {
        if (value === null) data.delete(key);
        else data.set(key, value);
      }
      if (Object.keys(changed).length > 0) ctx.trace({ kind: 'write', db: node.id, request, records: changed });
      ctx.reply(message, true);
    });
  };

  const clientBehaviour: Behaviour = () => () => {};

  const behaviours: Record<NodeType, Behaviour> = { client: clientBehaviour, service: serviceBehaviour, db: dbBehaviour, gateway, registry, balancer, broker, relay };

  // Faults first, so a fault at time t applies before anything else that happens at t.
  for (const fault of scenario.faults) {
    if (fault.kind === 'kill') ctx.at(fault.at, () => (ctx.trace({ kind: 'fault', fault }), kill(fault.instance)));
    if (fault.kind === 'slow') ctx.at(fault.from, () => (ctx.trace({ kind: 'fault', fault }), processMs.set(fault.instance, fault.processMs)));
    if (fault.kind === 'down') ctx.at(fault.at, () => (ctx.trace({ kind: 'fault', fault }), down.add(fault.node)));
    if (fault.kind === 'outage') {
      const instances = () => ctx.instancesOf(fault.node);
      ctx.at(fault.from, () => {
        ctx.trace({ kind: 'fault', fault });
        if (fault.mode === 'refuse') for (const instance of instances()) kill(instance);
      });
      ctx.at(fault.until, () => {
        if (fault.mode === 'refuse') for (const instance of instances()) dead.delete(instance);
        ctx.trace({ kind: 'recover', node: fault.node });
      });
    }
    if (fault.kind === 'deploy') {
      ctx.at(fault.at, () => {
        ctx.trace({ kind: 'fault', fault });
        if (fault.action === 'start') {
          notStarted.delete(fault.instance);
          dead.delete(fault.instance);
          return;
        }
        draining.add(fault.instance);
        drainIfIdle(fault.instance);
      });
    }
    if (fault.kind === 'shift') {
      ctx.at(fault.at, () => {
        ctx.trace({ kind: 'fault', fault });
        const lb = nodes.get(fault.balancer);
        if (lb?.type === 'balancer') lb.weights = { ...fault.weights };
      });
    }
    if (fault.kind === 'reroute') {
      ctx.at(fault.at, () => {
        ctx.trace({ kind: 'fault', fault });
        const facade = nodes.get(fault.gateway);
        if (facade?.type !== 'gateway') return;
        const route = facade.routes.find((r) => r.prefix === fault.prefix);
        if (route) route.to = fault.to;
        else facade.routes.push({ prefix: fault.prefix, to: fault.to });
      });
    }
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
      outcome: { id, label: spec.label, sentAt: spec.at, status: 'failed', ms: 0, hops: [], crossServiceCalls: 0, attempts: 0 },
      path: spec.path,
      token: spec.token ?? false,
      ...(spec.caller && { caller: spec.caller }),
      ...(spec.key !== undefined && { key: spec.key }),
      ...(spec.value !== undefined && { value: spec.value }),
      done: false,
    };
    requests.set(id, open);
    ctx.at(spec.at, () => {
      if (!client) throw new Error('Scenario has no client');
      open.outcome.hops.push(client.id);
      const finish = (ok: boolean, reason?: string, value?: string) => {
        if (open.done) return;
        open.done = true;
        open.outcome.status = ok ? 'ok' : 'failed';
        open.outcome.ms = now - spec.at;
        if (!ok && reason) open.outcome.reason = reason;
        if (ok && value !== undefined) open.outcome.value = value;
        ctx.trace({
          kind: 'done',
          request: id,
          ok,
          ms: open.outcome.ms,
          ...(open.outcome.reason && { reason: open.outcome.reason }),
          ...(open.outcome.value !== undefined && { value: open.outcome.value }),
        });
      };
      if (discover) return discover(id, finish);
      const target = nodes.get(spec.to)!;
      const to = target.type === 'service' ? target.instances[0]!.id : target.id;
      ctx.call(client.id, to, { kind: 'request', label: `${spec.label} ${id}`, request: id }, scenario.clientPolicy, finish);
    });
  });

  let timedOut = false;
  const allDone = () => requests.size > 0 && [...requests.values()].every((r) => r.done);
  // An outbox record still waiting for its relay keeps the run going.
  const outboxEmpty = () => [...records.values()].every((data) => ![...data.keys()].some((key) => key.startsWith('outbox/')));
  for (let next = queue.pop(); next; next = queue.pop()) {
    if (next.time > MAX_TIME) {
      timedOut = true;
      break;
    }
    now = next.time;
    next.item();
    // Answers still on their way, and work still running, show what a timeout wasted.
    if (allDone() && openDeliveries.size === 0 && outboxEmpty() && working.size === 0 && [...jobs.values()].every((set) => set.size === 0)) break;
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

  for (const id of openDeliveries) {
    timedOut = true;
    now = MAX_TIME;
    ctx.trace({ kind: 'delivered', delivery: id, ok: false, ms: MAX_TIME - storedAt.get(id)!, reason: 'not processed by 10,000 ms' });
  }

  return {
    trace,
    requests: [...requests.values()].map((r) => r.outcome),
    deliveries: [...deliveries.values()],
    endedAt: now,
    timedOut,
  };
}
