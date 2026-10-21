import type { Message, NodeSpec, Strategy } from './model';
import type { Behaviour, SimContext } from './sim';

/** The instance a balancer sends to next. `live` is in instance order; ties go to the lowest index. */
export function pickInstance(strategy: Strategy, live: string[], inFlight: Record<string, number>, cursor: number, rng: () => number): string {
  if (strategy === 'round-robin') return live[cursor % live.length]!;
  if (strategy === 'random') return live[Math.floor(rng() * live.length)]!;
  return live.reduce((best, id) => ((inFlight[id] ?? 0) < (inFlight[best] ?? 0) ? id : best), live[0]!);
}

/** The first instance of a service, or the node itself: where a plain send to `id` goes. */
const entry = (ctx: SimContext, id: string) => ctx.instancesOf(id)[0] ?? id;

/** Checks the token, then forwards to the longest route prefix the path starts with. */
export const gateway: Behaviour = (ctx, node) => (message) => {
  if (node.type !== 'gateway' || !message.request) return;
  const request = message.request;
  ctx.at(ctx.now + node.processMs, () => {
    const { path, token } = ctx.requestInfo(request);
    if (node.requireToken && !token) {
      ctx.trace({ kind: 'reject', gateway: node.id, request, status: 401 });
      return ctx.reply(message, false, '401: no token');
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
      const live = ctx.instancesOf(node.target).filter((id) => !unhealthy.has(id));
      if (live.length === 0) return ctx.reply(message, false, `no healthy ${node.target} instance`);
      const instance = pickInstance(node.strategy, live, inFlight, cursor++, ctx.rng);
      ctx.trace({ kind: 'pick', balancer: node.id, instance, strategy: node.strategy, inFlight: { ...inFlight } });
      inFlight[instance] = (inFlight[instance] ?? 0) + 1;
      ctx.send(node.id, instance, { kind: 'request', label: message.label, request }, (answer) => {
        inFlight[instance]! -= 1;
        ctx.reply(message, answer.ok ?? false, answer.reason);
      });
    });
  };
};
