import { describe, expect, it } from 'vitest';
import { ipv4 } from '../address';
import { simulate, type Command, type Ctx, type Link, type SimEvent } from '../sim';
import { createAs, type AsConfig, type AsRouter, type Relation } from './bgp';

const NETWORK = ipv4('203.0.113.0');
const ADDRESS = ipv4('203.0.113.10');

/** Each edge is `from`, `to`, and what `to` is to `from`. A provider on one end is a customer on the other. */
type Edge = [from: string, to: string, relation: Relation, prepend?: number];
const OPPOSITE: Record<Relation, Relation> = { customer: 'provider', provider: 'customer', peer: 'peer' };

function network(edges: Edge[]) {
  const names = [...new Set(edges.flatMap(([from, to]) => [from, to]))];
  const asnOf = (name: string) => 65001 + names.indexOf(name);
  const neighbours = new Map<string, AsConfig['neighbours']>(names.map((name) => [name, []]));
  for (const [from, to, relation, prepend] of edges) {
    neighbours.get(from)!.push({ port: to, relation, ...(prepend ? { prepend } : {}) });
    neighbours.get(to)!.push({ port: from, relation: OPPOSITE[relation] });
  }
  const routers = new Map<string, AsRouter>(names.map((name, column) => [name, createAs({ id: name, label: name, column, asn: asnOf(name), neighbours: neighbours.get(name)! })]));
  const links: Link[] = edges.map(([from, to]) => ({ a: [from, to], b: [to, from] }));
  const on = (name: string, at: number, run: (router: AsRouter, ctx: Ctx) => void): Command => ({ at, device: name, run: (device, ctx) => run(device as AsRouter, ctx) });
  const go = (commands: Command[]) => simulate({ devices: [...routers.values()], links, commands, maxEvents: 5000 });
  return { routers, asnOf, on, go, get: (name: string) => routers.get(name)! };
}

const announce = (router: AsRouter, ctx: Ctx) => router.announce(ctx, NETWORK, 24);
const delivered = (events: SimEvent[]) => events.filter(({ action }) => action === 'bgp-delivered');

describe('BGP', () => {
  it('grows AS_PATH by one AS per hop', () => {
    const { on, go, get, asnOf } = network([['o', 'p', 'provider'], ['p', 'q', 'provider']]);
    go([on('o', 0, announce)]);
    expect(get('o').best(NETWORK, 24)).toEqual([]);
    expect(get('p').best(NETWORK, 24)).toEqual([asnOf('o')]);
    expect(get('q').best(NETWORK, 24)).toEqual([asnOf('p'), asnOf('o')]);
  });

  it('prefers a customer route to a shorter peer route', () => {
    const { on, go, get, asnOf } = network([['x', 'y', 'customer'], ['y', 'w', 'customer'], ['w', 'o', 'customer'], ['x', 'z', 'peer'], ['z', 'o', 'customer']]);
    go([on('o', 0, announce)]);
    expect(get('x').best(NETWORK, 24)).toEqual([asnOf('y'), asnOf('w'), asnOf('o')]);
  });

  it('takes the shortest path at equal preference', () => {
    const { on, go, get, asnOf } = network([['d', 'a', 'provider'], ['d', 'b', 'provider'], ['a', 'o', 'customer'], ['b', 'c', 'customer'], ['c', 'o', 'customer']]);
    go([on('o', 0, announce)]);
    expect(get('d').best(NETWORK, 24)).toEqual([asnOf('a'), asnOf('o')]);
  });

  it('breaks a tie with the lowest neighbour AS', () => {
    const { on, go, get, asnOf } = network([['d', 'a', 'provider'], ['d', 'b', 'provider'], ['a', 'o', 'customer'], ['b', 'o', 'customer']]);
    go([on('o', 0, announce)]);
    expect(get('d').best(NETWORK, 24)).toEqual([asnOf('a'), asnOf('o')]);
  });

  it('rejects a route that already holds this AS', () => {
    const { on, go } = network([['o', 'b', 'provider'], ['b', 'c', 'provider'], ['c', 'o', 'provider']]);
    const run = go([on('o', 0, announce)]);
    expect(run.events.filter(({ action }) => action === 'bgp-loop').map(({ device }) => device)).toContain('o');
    expect(run.cut).toBe(false);
  });

  it('keeps a peer\'s route from other peers and providers, but tells customers', () => {
    const { on, go, get, asnOf } = network([['o', 'a', 'provider'], ['a', 'b', 'peer'], ['b', 'c', 'peer'], ['b', 'd', 'customer'], ['b', 'e', 'provider']]);
    const run = go([on('o', 0, announce)]);
    expect(get('d').best(NETWORK, 24)).toEqual([asnOf('b'), asnOf('a'), asnOf('o')]);
    expect(get('c').best(NETWORK, 24)).toBeUndefined();
    expect(get('e').best(NETWORK, 24)).toBeUndefined();
    expect(run.events.some(({ action }) => action === 'bgp-filtered')).toBe(true);
  });

  it('withdraws when a peer goes down, and traffic moves to the backup', () => {
    const { on, go, get, asnOf } = network([['x', 'a', 'customer'], ['x', 'b', 'customer'], ['a', 'o', 'customer'], ['b', 'o', 'customer']]);
    const run = go([on('o', 0, announce), on('x', 50, (router, ctx) => router.probe(ctx, ADDRESS)), on('a', 60, (router, ctx) => router.peerDown(ctx, 'o')), on('x', 100, (router, ctx) => router.probe(ctx, ADDRESS))]);
    expect(run.events.some(({ action }) => action === 'bgp-withdraw')).toBe(true);
    expect(get('x').best(NETWORK, 24)).toEqual([asnOf('b'), asnOf('o')]);
    const paths = delivered(run.events).map(({ frame }) => frame?.payload.kind === 'bgp' && frame.payload.path);
    expect(paths).toEqual([[asnOf('x'), asnOf('a')], [asnOf('x'), asnOf('b')]]);
  });

  it('moves traffic to the other path when prepending', () => {
    const { on, go, get, asnOf } = network([['x', 'a', 'customer'], ['x', 'b', 'customer'], ['o', 'a', 'provider', 2], ['o', 'b', 'provider']]);
    go([on('o', 0, announce)]);
    expect(get('x').best(NETWORK, 24)).toEqual([asnOf('b'), asnOf('o')]);
    expect(get('a').best(NETWORK, 24)).toEqual([asnOf('o'), asnOf('o'), asnOf('o')]);
  });

  it('lets a more specific prefix capture probes while the original stays', () => {
    const { on, go, get, asnOf } = network([['x', 'o', 'customer'], ['x', 'h', 'customer']]);
    const run = go([on('o', 0, announce), on('h', 20, (router, ctx) => router.announce(ctx, NETWORK, 25)), on('x', 50, (router, ctx) => router.probe(ctx, ADDRESS))]);
    expect(get('x').best(NETWORK, 24)).toEqual([asnOf('o')]);
    expect(get('x').best(NETWORK, 25)).toEqual([asnOf('h')]);
    expect(delivered(run.events).map(({ device }) => device)).toEqual(['h']);
  });

  it('notes a probe with nowhere to go', () => {
    const { on, go } = network([['x', 'o', 'customer']]);
    const run = go([on('x', 0, (router, ctx) => router.probe(ctx, ADDRESS))]);
    expect(run.events.map(({ action }) => action)).toEqual(['bgp-no-route']);
  });

  it('shows its best routes in a table', () => {
    const { on, go, get } = network([['o', 'p', 'provider']]);
    go([on('o', 0, announce)]);
    const [table] = get('p').tables();
    expect(table!.columns).toEqual(['Prefix', 'AS_PATH', 'Via', 'Pref']);
    expect(table!.rows).toEqual([['203.0.113.0/24', '65001', 'o', '200']]);
  });
});
