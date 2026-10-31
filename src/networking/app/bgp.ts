import { formatIp, inSubnet } from '../address';
import type { Bgp, Frame } from '../packet';
import type { Ctx, Device, Note, TableSnapshot } from '../sim';

export type Relation = 'customer' | 'peer' | 'provider';

export interface AsConfig {
  id: string;
  label: string;
  column: number;
  asn: number;
  neighbours: { port: string; relation: Relation; prepend?: number }[];
}

export interface AsRouter extends Device {
  announce(ctx: Ctx, network: number, prefix: number): void;
  withdraw(ctx: Ctx, network: number, prefix: number): void;
  /** Stands for the hold timer running out: links don't tell a device they failed. */
  peerDown(ctx: Ctx, port: string): void;
  probe(ctx: Ctx, dst: number): void;
  best(network: number, prefix: number): number[] | undefined;
}

interface Route {
  network: number;
  prefix: number;
  path: number[];
  /** Undefined for this AS's own network. */
  port?: string;
  preference: number;
}

const LOCAL_PREFERENCE: Record<Relation, number> = { customer: 200, peer: 150, provider: 100 };
const OWN_PREFERENCE = 1000;
const MAX_PROBE_HOPS = 16;

const keyOf = (network: number, prefix: number) => `${network}/${prefix}`;
const routeText = ({ network, prefix }: { network: number; prefix: number }) => `${formatIp(network)}/${prefix}`;

/** Highest preference, then shortest path, then lowest neighbour AS. */
function better(a: Route, b: Route) {
  if (a.preference !== b.preference) return a.preference > b.preference;
  if (a.path.length !== b.path.length) return a.path.length < b.path.length;
  return (a.path[0] ?? 0) < (b.path[0] ?? 0);
}

export function createAs({ id, label, column, asn, neighbours }: AsConfig): AsRouter {
  /** Every route heard, per network, keyed by port. Own networks use the key ''. */
  const heard = new Map<string, Map<string, Route>>();
  const chosen = new Map<string, Route>();
  /** Which neighbours were told what, so a change can take it back. */
  const told = new Map<string, Set<string>>();
  const macOf = (port: string) => `as-${asn}-${port}`;
  const send = (ctx: Ctx, port: string, payload: Bgp, note: Note) => {
    const frame: Frame = { srcMac: macOf(port), dstMac: 'peer', payload };
    ctx.send([port], frame, note);
  };

  const relationOf = (port: string) => neighbours.find((each) => each.port === port)?.relation;
  /** A customer's route or our own goes to everyone. Anyone else's goes to customers only, because nobody carries free traffic. */
  const mayExport = (route: Route, port: string) => route.port === undefined || relationOf(route.port) === 'customer' || relationOf(port) === 'customer';

  function advertise(ctx: Ctx, route: Route | undefined, key: string, network: number, prefix: number) {
    const sent = told.get(key) ?? new Set<string>();
    told.set(key, sent);
    for (const { port, prepend = 0 } of neighbours) {
      if (route && port !== route.port && mayExport(route, port)) {
        const path = [...Array.from({ length: prepend + 1 }, () => asn), ...route.path];
        sent.add(port);
        send(ctx, port, { kind: 'bgp', type: 'UPDATE', network, prefix, path }, {
          action: 'bgp-update',
          title: `AS ${asn} tells ${port}: ${routeText({ network, prefix })} via ${path.join(' ')}`,
          why: prepend > 0 ? `It adds its own number ${prepend + 1} times. A longer path looks worse, so traffic is pushed towards other routes.` : 'Each AS adds its own number to the front of AS_PATH before passing a route on.',
        });
      } else if (sent.delete(port)) {
        send(ctx, port, { kind: 'bgp', type: 'WITHDRAW', network, prefix, path: [] }, {
          action: 'bgp-withdraw',
          title: `AS ${asn} tells ${port} to forget ${routeText({ network, prefix })}`,
          why: 'This AS can no longer reach the network that way, so it takes back what it said.',
        });
      } else if (route && port !== route.port) {
        ctx.note({ action: 'bgp-filtered', title: `AS ${asn} keeps this route from ${port}`, why: `It came from a ${relationOf(route.port!)}, and ${port} is a ${relationOf(port)}. Passing it on would mean carrying their traffic for free.` });
      }
    }
  }

  function decide(ctx: Ctx, network: number, prefix: number) {
    const key = keyOf(network, prefix);
    const best = [...(heard.get(key)?.values() ?? [])].reduce<Route | undefined>((top, route) => (!top || better(route, top) ? route : top), undefined);
    const before = chosen.get(key);
    if (best?.port === before?.port && best?.path.join() === before?.path.join()) return;
    if (best) chosen.set(key, best);
    else chosen.delete(key);
    ctx.note({
      action: 'bgp-best',
      title: best ? `AS ${asn} picks ${best.path.join(' ') || 'its own network'} for ${routeText({ network, prefix })}` : `AS ${asn} has no route to ${routeText({ network, prefix })}`,
      why: best ? 'Highest local preference wins first, then the shortest AS_PATH, then the lowest neighbour AS. Business comes before distance.' : 'The last route to this network is gone.',
    });
    advertise(ctx, best, key, network, prefix);
  }

  function learn(ctx: Ctx, port: string, update: Bgp) {
    const { network, prefix, path } = update;
    const key = keyOf(network, prefix);
    const routes = heard.get(key) ?? new Map<string, Route>();
    heard.set(key, routes);
    if (update.type === 'WITHDRAW') {
      routes.delete(port);
    } else if (path.includes(asn)) {
      routes.delete(port);
      ctx.note({ action: 'bgp-loop', title: `AS ${asn} rejects a path holding its own number`, why: `${path.join(' ')} already went through AS ${asn}. Using it would make a loop, so AS_PATH alone keeps the internet loop-free.` });
    } else {
      routes.set(port, { network, prefix, path, port, preference: LOCAL_PREFERENCE[relationOf(port) ?? 'provider'] });
    }
    decide(ctx, network, prefix);
  }

  /** The longest prefix that holds the address, as IP routing does. */
  const routeTo = (dst: number) => [...chosen.values()].filter(({ network, prefix }) => inSubnet(dst, network, prefix)).toSorted((a, b) => b.prefix - a.prefix)[0];

  function forward(ctx: Ctx, dst: number, hops: number[]) {
    const route = routeTo(dst);
    if (!route || hops.length >= MAX_PROBE_HOPS) {
      ctx.note({ action: 'bgp-no-route', title: `AS ${asn} has no route to ${formatIp(dst)}`, why: 'Nothing it has heard covers this address, so the packet stops here.' });
      return;
    }
    if (route.port === undefined) {
      ctx.note({ action: 'bgp-delivered', title: `The probe reaches AS ${asn}`, why: `AS ${asn} announced ${routeText(route)}, so the traffic ends here, whoever really owns the address.` }, { srcMac: 'peer', dstMac: macOf('local'), payload: { kind: 'bgp', type: 'PROBE', network: 0, prefix: 0, path: hops, dst } });
      return;
    }
    send(ctx, route.port, { kind: 'bgp', type: 'PROBE', network: 0, prefix: 0, path: [...hops, asn], dst }, {
      action: 'bgp-probe',
      title: `AS ${asn} sends the probe to ${route.port}`,
      why: `Its best match for ${formatIp(dst)} is ${routeText(route)}, through ${route.path.join(' ')}.`,
    });
  }

  return {
    id,
    label,
    type: 'as',
    column,
    badge: () => `AS ${asn}`,
    receive(ctx, frame, port) {
      if (frame.payload.kind !== 'bgp') return;
      if (frame.payload.type === 'PROBE') forward(ctx, frame.payload.dst ?? 0, frame.payload.path);
      else learn(ctx, port, frame.payload);
    },
    announce(ctx, network, prefix) {
      const key = keyOf(network, prefix);
      heard.set(key, new Map([['', { network, prefix, path: [], preference: OWN_PREFERENCE }]]));
      decide(ctx, network, prefix);
    },
    withdraw(ctx, network, prefix) {
      heard.get(keyOf(network, prefix))?.delete('');
      decide(ctx, network, prefix);
    },
    peerDown(ctx, port) {
      for (const [, routes] of heard) routes.delete(port);
      for (const { network, prefix } of chosen.values()) decide(ctx, network, prefix);
    },
    probe(ctx, dst) {
      forward(ctx, dst, []);
    },
    best: (network, prefix) => chosen.get(keyOf(network, prefix))?.path,
    tables: (): TableSnapshot[] => [{
      title: `AS ${asn} routes`,
      columns: ['Prefix', 'AS_PATH', 'Via', 'Pref'],
      rows: [...chosen.values()].map((route) => [routeText(route), route.path.join(' ') || '–', route.port ?? 'this AS', route.port === undefined ? '–' : String(route.preference)]),
    }],
  };
}
