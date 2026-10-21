import { lineOf } from '../data-structures/shared';
import type { Role, ServicesView, Step } from '../types/visualization';
import { MAX_STEPS, type Message, type NodeSpec, type Scenario, type SimResult, type Strategy, type TraceEvent } from './model';

export interface Narration {
  title: string;
  why: string;
  next?: string;
}

export interface StepOptions {
  code: string;
  /** A snippet of `code` per event kind, for lineOf; kinds left out use line 1. */
  lines: Partial<Record<TraceEvent['kind'], string>>;
  /** Lesson wording for an event, and optionally a snippet for its code line; return undefined to keep the defaults. */
  explain?: (event: TraceEvent, result: SimResult) => (Partial<Narration> & { line?: string }) | undefined;
  variables?: (event: TraceEvent, result: SimResult) => Record<string, string | number>;
}

export function emptyServicesView(): ServicesView {
  return { kind: 'services', nodes: [], links: [], messages: [], requests: [], log: [] };
}

const LOG_LINES = 4;

const STRATEGY: Record<Strategy, string> = { 'round-robin': 'round robin', 'least-connections': 'least connections', random: 'random' };

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Heartbeats, health probes and their answers: events that only matter in bulk. */
function isQuiet(event: TraceEvent, probes: Set<string>): boolean {
  if (event.kind === 'heartbeat') return true;
  if (event.kind === 'send' || event.kind === 'arrive') {
    const m = event.message;
    return m.kind === 'heartbeat' || m.kind === 'probe' || (m.kind === 'reply' && probes.has(m.replyTo ?? ''));
  }
  return event.kind === 'fail' && event.request === undefined;
}

/** Replays a run's trace into steps, each with a complete services view. */
export function traceSteps(scenario: Scenario, result: SimResult, options: StepOptions): Step[] {
  const nodes = new Map(scenario.nodes.map((n) => [n.id, n]));
  const owner = new Map<string, string>();
  for (const n of scenario.nodes) if (n.type === 'service') for (const i of n.instances) owner.set(i.id, n.id);
  const ownerOf = (id: string) => owner.get(id) ?? id;
  const name = (id: string) => {
    const type = nodes.get(id)?.type;
    return type === 'client' || type === 'gateway' || type === 'registry' || type === 'balancer' ? `the ${id}` : id;
  };
  const line = (kind: TraceEvent['kind']) => {
    const snippet = options.lines[kind];
    return snippet ? lineOf(options.code, snippet) : 1;
  };

  // What the view shows, updated event by event.
  const dead = new Set<string>();
  const handling = new Map<string, Set<string>>();
  const handled = new Set<string>();
  const inFlight = new Map<string, Message>();
  const arrived = new Set<string>();
  const probes = new Set<string>();
  const lastBeat = new Map<string, number>();
  const evicted = new Set<string>();
  const balancerLoad = new Map<string, number>();
  const requests = new Map<string, ServicesView['requests'][number] & { hopList: string[] }>();
  const labels = new Map(scenario.requests.map((r, i) => [`#${i + 1}`, r.label]));
  const log: string[] = [];
  let now = 0;

  const requestRow = (id: string) => {
    let row = requests.get(id);
    if (!row) requests.set(id, (row = { id, label: labels.get(id) ?? id, status: 'pending', hops: '', hopList: [] }));
    return row;
  };

  function apply(event: TraceEvent) {
    now = event.t;
    switch (event.kind) {
      case 'send': {
        const m = event.message;
        inFlight.set(m.id, m);
        if (m.kind === 'probe') probes.add(m.id);
        if (m.request) {
          const row = requestRow(m.request);
          if (row.hopList.length === 0) row.hopList.push(m.from);
        }
        if (m.kind === 'reply' && m.request && nodes.get(m.to)?.type === 'balancer') balancerLoad.set(m.from, (balancerLoad.get(m.from) ?? 1) - 1);
        if (m.kind === 'reply' && m.request) handling.get(m.from)?.delete(m.request);
        break;
      }
      case 'arrive': {
        const m = event.message;
        arrived.add(m.id);
        if (m.request && (m.kind === 'request' || m.kind === 'query') && !dead.has(m.to)) requestRow(m.request).hopList.push(m.to);
        break;
      }
      case 'handle':
        if (event.instance) {
          handled.add(event.instance);
          let set = handling.get(event.instance);
          if (!set) handling.set(event.instance, (set = new Set()));
          set.add(event.request);
        }
        break;
      case 'fault':
        if (event.fault.kind === 'kill') dead.add(event.fault.instance);
        break;
      case 'fail':
        if (owner.has(event.at) && /(crashed|stopped)$/.test(event.reason)) {
          dead.add(event.at);
          handling.delete(event.at);
        }
        break;
      case 'register':
      case 'heartbeat':
        lastBeat.set(event.instance, event.t);
        evicted.delete(event.instance);
        break;
      case 'evict':
        evicted.add(event.instance);
        break;
      case 'pick':
        balancerLoad.set(event.instance, (event.inFlight[event.instance] ?? 0) + 1);
        break;
      case 'done': {
        const row = requestRow(event.request);
        row.status = event.ok ? 'ok' : 'failed';
        row.ms = event.ms;
        if (event.reason) row.reason = event.reason;
        break;
      }
      default:
        break;
    }
  }

  function focusOf(event: TraceEvent): { node?: string; compare?: boolean } {
    switch (event.kind) {
      case 'send':
        return { node: ownerOf(event.message.from) };
      case 'arrive':
        return { node: ownerOf(event.message.to) };
      case 'handle':
        return { node: event.node };
      case 'route':
      case 'reject':
        return { node: event.gateway };
      case 'pick':
        return { node: event.balancer, compare: true };
      case 'mark':
        return { node: event.balancer };
      case 'lookup':
        return { node: event.registry, compare: true };
      case 'register':
      case 'heartbeat':
      case 'evict':
        return { node: event.registry };
      case 'done':
        return { node: scenario.nodes.find((n) => n.type === 'client')?.id };
      default:
        return {};
    }
  }

  const leastConnections = new Set(scenario.nodes.flatMap((n) => (n.type === 'balancer' && n.strategy === 'least-connections' ? [n.target] : [])));
  const registered = new Set(scenario.nodes.flatMap((n) => (n.type === 'registry' ? n.serves : [])));

  function instanceBadge(service: string, instance: string): string | undefined {
    if (leastConnections.has(service)) return `${balancerLoad.get(instance) ?? 0} in flight`;
    if (registered.has(service)) {
      if (evicted.has(instance)) return 'evicted';
      const last = lastBeat.get(instance);
      // How long since the registry last heard from it, short enough to fit beside the instance name.
      return last === undefined ? undefined : `♥ ${now - last} ms`;
    }
    return undefined;
  }

  function snapshot(focus: { node?: string; compare?: boolean }): ServicesView {
    const viewNodes = scenario.nodes.map((n: NodeSpec): ServicesView['nodes'][number] => {
      const base = { id: n.id, label: n.label, type: n.type, column: n.column };
      if (n.type === 'service') {
        const instances = n.instances.map((i) => {
          const role: Role = dead.has(i.id) ? 'discarded' : (handling.get(i.id)?.size ?? 0) > 0 ? 'active' : handled.has(i.id) ? 'visited' : 'default';
          const badge = instanceBadge(n.id, i.id);
          return { id: i.id, role, ...(badge && { badge }) };
        });
        return { ...base, role: instances.every((i) => i.role === 'discarded') ? 'discarded' : 'default', instances };
      }
      const role: Role = focus.node === n.id ? (focus.compare ? 'compare' : 'active') : 'default';
      return { ...base, role };
    });
    const messages = [...inFlight.values()].map((m) => {
      const span = m.arrives - m.departs;
      const progress = arrived.has(m.id) ? 1 : span === 0 ? 1 : Math.min(1, Math.max(0, (now - m.departs) / span));
      const role: Role = m.kind === 'reply' ? (m.ok ? 'found' : 'discarded') : 'frontier';
      return { id: m.id, from: ownerOf(m.from), to: ownerOf(m.to), label: m.label, role, progress };
    });
    const busy = new Set(messages.map((m) => [m.from, m.to].toSorted().join(' ')));
    const links = scenario.links.map((l) => ({ from: l.from, to: l.to, role: (busy.has([l.from, l.to].toSorted().join(' ')) ? 'frontier' : 'default') as Role }));
    const rows = [...requests.values()]
      .toSorted((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
      .map(({ hopList, ...row }) => ({ ...row, hops: hopList.join(' → ') }));
    return { kind: 'services', nodes: viewNodes, links, messages, requests: rows, log: log.slice(-LOG_LINES) };
  }

  function describe(event: TraceEvent): Narration {
    switch (event.kind) {
      case 'send': {
        const m = event.message;
        const ms = m.arrives - m.departs;
        const [from, to] = [name(m.from), name(m.to)];
        if (m.kind === 'reply') {
          return m.ok
            ? { title: `${from} replies to ${to} for ${m.request ?? m.label}`, why: `The work is done, and the answer takes ${ms} ms to travel back.` }
            : { title: `${from} tells ${to} that ${m.request ?? 'it'} failed`, why: `${capitalise(m.reason ?? 'Something went wrong')}. The failure travels back like any answer, in ${ms} ms.` };
        }
        if (m.kind === 'query') return { title: `${from} queries ${to} for ${m.request}`, why: `${from} needs data it doesn't keep itself. The query takes ${ms} ms to arrive.` };
        if (m.kind === 'lookup') return { title: `${from} asks ${to} where ${m.label.split(' ')[1]} is`, why: `Instances come and go, so ${from} asks before every request.` };
        return { title: `${m.request} leaves ${from} for ${to}`, why: `${from} sends ${m.label}. Crossing the network takes ${ms} ms.` };
      }
      case 'arrive':
        return { title: `${event.message.label} reaches ${name(event.message.to)}`, why: `It took ${event.message.arrives - event.message.departs} ms on the network.` };
      case 'handle':
        return { title: `${event.instance ?? name(event.node)} starts on ${event.request}`, why: `${event.instance ?? name(event.node)} is now working on ${event.request}.` };
      case 'fail':
        return { title: `${event.request ?? 'A message'} fails at ${event.at}`, why: `${capitalise(event.reason)}.` };
      case 'register':
        return { title: `${event.instance} registers with ${name(event.registry)}`, why: `From now on, lookups can return ${event.instance}.` };
      case 'heartbeat':
        return { title: `${event.instance} sends a heartbeat`, why: 'A heartbeat says "I am still alive".' };
      case 'evict': {
        const registry = nodes.get(event.registry);
        const ttl = registry?.type === 'registry' ? registry.ttlMs : 0;
        const last = lastBeat.get(event.instance);
        const silent = last === undefined ? '' : ` for ${event.t - last} ms`;
        return { title: `${capitalise(name(event.registry))} drops ${event.instance}`, why: `No heartbeat${silent}, which is more than the ${ttl} ms it allows. Lookups stop returning ${event.instance}.` };
      }
      case 'lookup':
        return {
          title: `${capitalise(name(event.registry))} answers: ${event.result.length > 0 ? event.result.join(', ') : 'no instances'}`,
          why: `These are the ${event.service} instances that sent a heartbeat recently enough.`,
        };
      case 'pick': {
        const counts = Object.entries(event.inFlight).map(([id, n]) => `${id}: ${n}`).join(', ');
        const why =
          event.strategy === 'round-robin'
            ? 'Round robin takes the instances in turn, whatever they are doing.'
            : event.strategy === 'least-connections'
              ? `Least connections takes the instance with the fewest requests in flight${counts ? ` (${counts})` : ''}.`
              : 'Random picks any instance; over many requests the load evens out.';
        return { title: `${capitalise(name(event.balancer))} picks ${event.instance} (${STRATEGY[event.strategy]})`, why };
      }
      case 'route': {
        const gateway = nodes.get(event.gateway);
        const path = scenario.requests[Number(event.request.slice(1)) - 1]?.path ?? '';
        const prefix = gateway?.type === 'gateway' ? gateway.routes.find((r) => r.to === event.to)?.prefix : undefined;
        return { title: `${capitalise(name(event.gateway))} routes ${event.request} to ${event.to}`, why: `The path ${path} starts with ${prefix ?? 'its route'}, which belongs to ${event.to}.` };
      }
      case 'reject':
        return event.status === 401
          ? { title: `${capitalise(name(event.gateway))} rejects ${event.request} with 401`, why: 'The request has no token, so it never reaches a service.' }
          : { title: `${capitalise(name(event.gateway))} rejects ${event.request} with 404`, why: 'No route matches the path, so there is no service to send it to.' };
      case 'mark':
        return {
          title: `${capitalise(name(event.balancer))} marks ${event.instance} ${event.healthy ? 'healthy' : 'down'}`,
          why: event.healthy ? `${event.instance} answered its health check.` : `${event.instance} didn't answer its health check, so it gets no more requests.`,
        };
      case 'fault': {
        const f = event.fault;
        if (f.kind === 'kill') return { title: `${f.instance} stops`, why: `${f.instance} has died. Anything sent to it now is refused.` };
        if (f.kind === 'slow') return { title: `${f.instance} slows down`, why: `From now on, each request takes ${f.processMs} ms on ${f.instance}.` };
        if (f.kind === 'down') return { title: `${f.node} goes down`, why: `Every query to ${f.node} fails until it comes back.` };
        if (f.kind === 'crash-on') return { title: `A bug crashes ${f.node}`, why: `Handling a ${f.prefix} request hits the bug, and the whole process dies.` };
        return { title: `${f.owner} renames ${f.from} to ${f.to}`, why: `The ${f.owner} team changes its table and updates its own queries. Nobody else knows.` };
      }
      case 'done':
        return event.ok
          ? { title: `${event.request} succeeds after ${event.ms} ms`, why: `The answer is back at the client, ${event.ms} ms after it was sent.` }
          : { title: `${event.request} fails after ${event.ms} ms`, why: `${capitalise(event.reason ?? 'It failed')}.` };
    }
  }

  function quietTitle(run: TraceEvent[]): Narration {
    const arrivals = run.filter((e) => e.kind === 'arrive' && e.message.kind === 'heartbeat');
    const probesSent = run.filter((e) => e.kind === 'send' && e.message.kind === 'probe');
    const beatsSent = run.filter((e) => e.kind === 'send' && e.message.kind === 'heartbeat');
    if (arrivals.length > 0) {
      const registry = name(arrivals[0]!.kind === 'arrive' ? arrivals[0]!.message.to : '');
      const n = arrivals.length;
      return { title: `${n} heartbeat${n === 1 ? ' reaches' : 's reach'} ${registry}`, why: 'Each heartbeat tells the registry that its instance is still alive.' };
    }
    if (probesSent.length > 0) return { title: `Health check: ${probesSent.length} probes go out`, why: 'The balancer asks every instance whether it is alive.' };
    if (beatsSent.length > 0) return { title: `${beatsSent.length} instance${beatsSent.length === 1 ? ' sends a heartbeat' : 's send heartbeats'}`, why: 'Live instances report in on a fixed beat.' };
    return { title: 'Health checks come back', why: 'The answers to the health checks arrive at the balancer.' };
  }

  const steps: Step[] = [];
  const trace = result.trace;
  const push = (event: TraceEvent, narration: Narration, codeLine: number) => {
    log.push(narration.title);
    const request = 'request' in event && event.request ? event.request : event.kind === 'send' || event.kind === 'arrive' ? event.message.request : undefined;
    steps.push({
      ...narration,
      codeLine,
      variables: { t: `${event.t} ms`, ...(request && { request }), ...options.variables?.(event, result) },
      view: snapshot(focusOf(event)),
    });
    // A message is drawn at its destination on the step it arrives, then dropped.
    for (const id of arrived) inFlight.delete(id);
    arrived.clear();
  };

  /** A first heartbeat is a registration: its arrival belongs with the register step that follows. */
  const quietAt = (i: number) => {
    const event = trace[i]!;
    const following = trace[i + 1];
    if (event.kind === 'arrive' && following?.kind === 'register' && following.t === event.t) return false;
    return isQuiet(event, probes);
  };

  for (let i = 0; i < trace.length; i++) {
    const event = trace[i]!;
    if (quietAt(i)) {
      const run: TraceEvent[] = [];
      // One round per step: a run ends where new sends follow arrivals.
      while (i < trace.length && quietAt(i) && !(trace[i]!.kind === 'send' && run.some((e) => e.kind === 'arrive'))) {
        apply(trace[i]!);
        run.push(trace[i]!);
        i++;
      }
      i--;
      push(run.at(-1)!, quietTitle(run), line('heartbeat'));
      continue;
    }
    apply(event);
    const following = trace[i + 1];
    if (event.kind === 'arrive' && following && following.t === event.t && !quietAt(i + 1)) continue;
    const { line: snippet, ...override } = options.explain?.(event, result) ?? {};
    const narration = { ...describe(event), ...override };
    const lower = (text: string) => (text.startsWith('the ') ? capitalise(text) : text);
    push(event, { ...narration, title: lower(narration.title), why: lower(narration.why) }, snippet ? lineOf(options.code, snippet) : line(event.kind));
  }

  if (steps.length <= MAX_STEPS) return steps;
  const more = steps.length - MAX_STEPS;
  const final = steps.at(-1)!;
  const ok = result.requests.filter((r) => r.status === 'ok').length;
  return [
    ...steps.slice(0, MAX_STEPS),
    {
      title: `${more} more steps`,
      why: `The rest of the run is summarised to keep it readable: ${ok} of ${result.requests.length} requests succeeded.`,
      codeLine: line('done'),
      variables: { t: `${result.endedAt} ms` },
      view: final.view,
    },
  ];
}
