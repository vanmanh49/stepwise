import type { Message, NodeSpec, RateLimit, Strategy } from './model';
import type { Behaviour, SimContext } from './sim';

/** The instance a balancer sends to next. `live` is in instance order; ties go to the lowest index. */
export function pickInstance(strategy: Strategy, live: string[], inFlight: Record<string, number>, cursor: number, rng: () => number): string {
  if (strategy === 'round-robin') return live[cursor % live.length]!;
  if (strategy === 'random') return live[Math.floor(rng() * live.length)]!;
  return live.reduce((best, id) => ((inFlight[id] ?? 0) < (inFlight[best] ?? 0) ? id : best), live[0]!);
}

/**
 * Draws a version by weight among those with an instance in rotation, in the order the weights list them. A version
 * left out gives its share to the others; when every available version has weight 0, the first one is used.
 */
export function pickVersion(weights: Record<string, number>, inRotation: string[], rng: () => number): string | undefined {
  const available = [...Object.keys(weights).filter((v) => inRotation.includes(v)), ...inRotation.filter((v) => !(v in weights))];
  if (available.length === 0) return undefined;
  const total = available.reduce((sum, v) => sum + (weights[v] ?? 0), 0);
  if (total <= 0) return available[0];
  let draw = rng() * total;
  for (const version of available) {
    draw -= weights[version] ?? 0;
    if (draw < 0) return version;
  }
  return available.at(-1);
}

/** The first instance of a service, or the node itself: where a plain send to `id` goes. */
const entry = (ctx: SimContext, id: string) => ctx.instancesOf(id)[0] ?? id;

/** One limiter per gateway and run. `used`: the window's count, or the tokens spent from a full bucket, after this check. */
export function createLimiter(config: RateLimit): (key: string, now: number) => { allowed: boolean; used: number } {
  const windows = new Map<string, { window: number; count: number }>();
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (key, now) => {
    if (config.algorithm === 'fixed-window') {
      const window = Math.floor(now / config.windowMs);
      let w = windows.get(key);
      if (!w || w.window !== window) windows.set(key, (w = { window, count: 0 }));
      const allowed = w.count < config.limit;
      if (allowed) w.count++;
      return { allowed, used: w.count };
    }
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { tokens: config.limit, at: now }));
    b.tokens = Math.min(config.limit, b.tokens + ((now - b.at) * config.limit) / config.windowMs);
    b.at = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    return { allowed, used: config.limit - Math.floor(b.tokens) };
  };
}

/** Checks the token and the rate limit, then forwards to the longest route prefix the path starts with. */
export const gateway: Behaviour = (ctx, node) => {
  if (node.type !== 'gateway') return () => {};
  const limiter = node.rateLimit && createLimiter(node.rateLimit);
  return (message) => {
    if (!message.request) return;
    const request = message.request;
    ctx.at(ctx.now + node.processMs, () => {
      const { path, token, caller } = ctx.requestInfo(request);
      if (node.requireToken && !token) {
        ctx.trace({ kind: 'reject', gateway: node.id, request, status: 401 });
        return ctx.reply(message, false, '401: no token');
      }
      if (limiter && node.rateLimit) {
        const key = node.rateLimit.per === 'caller' ? (caller ?? 'all') : 'all';
        const { allowed, used } = limiter(key, ctx.now);
        ctx.trace({ kind: 'limit', gateway: node.id, request, key, allowed, used, limit: node.rateLimit.limit });
        if (!allowed) {
          ctx.trace({ kind: 'reject', gateway: node.id, request, status: 429 });
          return ctx.reply(message, false, '429: rate limit');
        }
      }
      const route = node.routes.filter((r) => path.startsWith(r.prefix)).toSorted((a, b) => b.prefix.length - a.prefix.length)[0];
      if (!route) {
        ctx.trace({ kind: 'reject', gateway: node.id, request, status: 404 });
        return ctx.reply(message, false, `404: no route for ${path}`);
      }
      ctx.trace({ kind: 'route', gateway: node.id, request, to: route.to });
      ctx.forward(node.id, entry(ctx, route.to), message);
    });
  };
};

/** Instances register and send heartbeats; ticks evict the silent ones; lookups list the rest. */
export const registry: Behaviour = (ctx, node) => {
  if (node.type !== 'registry') return () => {};
  const lastBeat = new Map<string, number>();
  const beat = (instance: string, first: boolean) => {
    if (ctx.isDead(instance)) return;
    ctx.send(instance, node.id, { kind: 'heartbeat', label: `${first ? 'register' : 'heartbeat'} ${instance}` });
    ctx.at(ctx.now + node.heartbeatMs, () => beat(instance, false));
  };
  for (const service of node.serves) for (const instance of ctx.instancesOf(service)) ctx.at(0, () => beat(instance, true));
  const tick = () => {
    for (const [instance, last] of lastBeat) {
      if (ctx.now - last > node.ttlMs) {
        lastBeat.delete(instance);
        ctx.trace({ kind: 'evict', registry: node.id, instance });
      }
    }
    ctx.at(ctx.now + node.heartbeatMs, tick);
  };
  ctx.at(node.heartbeatMs, tick);

  return (message) => {
    if (message.kind === 'heartbeat') {
      ctx.trace({ kind: lastBeat.has(message.from) ? 'heartbeat' : 'register', registry: node.id, instance: message.from });
      lastBeat.set(message.from, ctx.now);
      return;
    }
    if (message.kind !== 'lookup') return;
    const service = message.label.split(' ')[1]!;
    ctx.at(ctx.now + node.processMs, () => {
      const result = ctx.instancesOf(service).filter((id) => lastBeat.has(id));
      ctx.trace({ kind: 'lookup', registry: node.id, service, result });
      ctx.reply(message, true, undefined, result);
    });
  };
};

/** Asks the registry before each request, then takes the returned instances in turn. */
export function createDiscovery(ctx: SimContext, client: NodeSpec): ((request: string, finish: (ok: boolean, reason?: string) => void) => void) | undefined {
  if (client.type !== 'client' || !client.discovery) return undefined;
  const { registry: registryId, service } = client.discovery;
  let cursor = 0;
  return (request, finish) => {
    ctx.send(client.id, registryId, { kind: 'lookup', label: `lookup ${service} ${request}`, request }, (answer) => {
      const live = answer.result ?? [];
      if (live.length === 0) return finish(false, `no ${service} instance registered`);
      const instance = live[cursor++ % live.length]!;
      ctx.send(client.id, instance, { kind: 'request', label: `${ctx.requestInfo(request).label} ${request}`, request }, (reply) =>
        finish(reply.ok ?? false, reply.reason),
      );
    });
  };
}

/** Picks an instance per request and relays its answer; optional probes skip dead instances. */
export const balancer: Behaviour = (ctx, node) => {
  if (node.type !== 'balancer') return () => {};
  const inFlight: Record<string, number> = {};
  const unhealthy = new Set<string>();
  let cursor = 0;
  /** Weighted balancing: a round-robin cursor per version, and the canary's failed answers so far. */
  const cursors = new Map<string, number>();
  let canaryErrors = 0;
  const versionOf = (id: string) => {
    const target = ctx.node(id);
    return target.type === 'service' ? target.instances.find((i) => i.id === id)?.version : undefined;
  };
  const probe = () => {
    for (const instance of ctx.instancesOf(node.target)) {
      ctx.send(node.id, instance, { kind: 'probe', label: `probe ${instance}` }, (answer) => {
        const healthy = answer.ok ?? false;
        if (healthy === !unhealthy.has(instance)) return;
        if (healthy) unhealthy.delete(instance);
        else unhealthy.add(instance);
        ctx.trace({ kind: 'mark', balancer: node.id, instance, healthy });
      });
    }
    ctx.at(ctx.now + node.healthCheckMs!, probe);
  };
  if (node.healthCheckMs) ctx.at(0, probe);

  return (message: Message) => {
    if (!message.request) return;
    const request = message.request;
    ctx.at(ctx.now + node.processMs, () => {
      const live = ctx.instancesOf(node.target).filter((id) => !unhealthy.has(id) && ctx.inRotation(id));
      if (live.length === 0) return ctx.reply(message, false, `no healthy ${node.target} instance`);
      let instance: string;
      if (node.weights) {
        const available = [...new Set(live.flatMap((id) => versionOf(id) ?? []))];
        const version = pickVersion(node.weights, available, ctx.rng)!;
        const pool = live.filter((id) => versionOf(id) === version);
        const at = cursors.get(version) ?? 0;
        cursors.set(version, at + 1);
        instance = pool[at % pool.length]!;
      } else instance = pickInstance(node.strategy, live, inFlight, cursor++, ctx.rng);
      ctx.trace({ kind: 'pick', balancer: node.id, instance, strategy: node.strategy, inFlight: { ...inFlight } });
      inFlight[instance] = (inFlight[instance] ?? 0) + 1;
      ctx.send(node.id, instance, { kind: 'request', label: message.label, request }, (answer) => {
        inFlight[instance]! -= 1;
        const canary = node.canary;
        if (canary && node.weights && !answer.ok && versionOf(instance) === canary.version && (node.weights[canary.version] ?? 0) > 0) {
          canaryErrors++;
          if (canaryErrors >= canary.maxErrors) {
            node.weights = { ...node.weights, [canary.version]: 0 };
            ctx.trace({ kind: 'rollback', balancer: node.id, version: canary.version, errors: canaryErrors });
          }
        }
        ctx.reply(message, answer.ok ?? false, answer.reason, undefined, answer.value);
      });
    });
  };
};
