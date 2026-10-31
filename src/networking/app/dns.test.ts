import { describe, expect, it } from 'vitest';
import type { Frame } from '../packet';
import { dnsTree, RESOLVER_IP } from '../scenarios/topology';
import { simulate, type Fault, type SimEvent } from '../sim';
import { lookup } from './dns';

const isQuery = (frame: Frame) => frame.payload.kind === 'ip' && frame.payload.payload.kind === 'udp' && typeof frame.payload.payload.data === 'object' && 'proto' in frame.payload.payload.data && frame.payload.payload.data.proto === 'dns' && !frame.payload.payload.data.response;

function look(names: [at: number, name: string][], options: { drop?: (mac: { client: string; resolver: string }) => Fault[]; seeded?: boolean } = {}) {
  const net = dnsTree(options.seeded ? { seeded: true } : {});
  const found: (string | undefined)[] = [];
  const run = simulate({
    devices: net.devices,
    links: net.links,
    faults: options.drop?.({ client: net.client.mac, resolver: net.resolver.mac }) ?? [],
    commands: names.map(([at, name]) => ({ at, device: net.client.id, run: (_, ctx) => lookup(ctx, net.client, RESOLVER_IP, name, (address) => found.push(address)) })),
  });
  const asked = (device: string) => run.events.filter((event) => event.device === device && (event.action === 'dns-query' || event.action === 'dns-retry'));
  return { ...net, run, found, asked };
}

const lastHopOf = (event: SimEvent) => event.frame?.payload.kind === 'ip' ? event.frame.payload.dst : undefined;
const dropClient = (...nths: number[]) => ({ client }: { client: string }): Fault[] => nths.map((nth) => ({ kind: 'dropPacket', nth, matches: (frame) => frame.srcMac === client && isQuery(frame) }));
const dropResolver = (...nths: number[]) => ({ resolver }: { resolver: string }): Fault[] => nths.map((nth) => ({ kind: 'dropPacket', nth, matches: (frame) => frame.srcMac === resolver && isQuery(frame) }));

describe('DNS', () => {
  it('walks root, TLD and authoritative on a cold lookup', () => {
    const { run, found, asked, root, tld, auth } = look([[0, 'www.example.com']]);
    expect(asked('resolver').map(lastHopOf)).toEqual([root, tld, auth].map((host) => host.address()));
    expect(run.events.filter(({ action }) => action === 'dns-referral').map(({ device }) => device)).toEqual(['root', 'tld']);
    expect(found).toEqual(['192.0.2.10']);
  });

  it('answers a second lookup from the cache, with nothing past the resolver', () => {
    const { asked, found, run } = look([[0, 'www.example.com'], [30000, 'www.example.com']]);
    expect(asked('resolver')).toHaveLength(3);
    expect(run.events.filter(({ action }) => action === 'dns-cached')).toHaveLength(1);
    expect(found).toEqual(['192.0.2.10', '192.0.2.10']);
  });

  it('walks again once the 60 s TTL has passed', () => {
    const { asked } = look([[0, 'www.example.com'], [61000, 'www.example.com']]);
    expect(asked('resolver')).toHaveLength(6);
  });

  it('uses a cached referral for another name in the zone', () => {
    const { asked, auth } = look([[0, 'www.example.com'], [1000, 'api.example.com']]);
    expect(asked('resolver').slice(3).map(lastHopOf)).toEqual([auth.address()]);
  });

  it('gives NXDOMAIN and undefined for a name nobody has', () => {
    const { run, found } = look([[0, 'nothing.example.com']]);
    expect(run.events.filter(({ action }) => action === 'dns-nxdomain').map(({ device }) => device)).toEqual(['auth', 'resolver']);
    expect(found).toEqual([undefined]);
  });

  it('does not cache a failed name', () => {
    const { asked, found } = look([[0, 'nothing.example.com'], [1000, 'nothing.example.com']]);
    expect(asked('resolver')).toHaveLength(4);
    expect(found).toEqual([undefined, undefined]);
  });

  it('resends a lost client query after 1000 ms', () => {
    const { run, found } = look([[0, 'www.example.com']], { drop: dropClient(1) });
    const retry = run.events.find(({ action }) => action === 'dns-retry')!;
    expect(retry.device).toBe('client');
    expect(retry.time).toBe(1000);
    expect(found).toEqual(['192.0.2.10']);
  });

  it('resends a lost resolver query, and the client gets one answer', () => {
    const { run, found } = look([[0, 'www.example.com']], { drop: dropResolver(1) });
    expect(run.events.filter(({ action, device }) => action === 'dns-retry' && device === 'resolver')).toHaveLength(1);
    expect(found).toEqual(['192.0.2.10']);
  });

  it('gives up after 2 retries', () => {
    const { run, found } = look([[0, 'www.example.com']], { drop: dropClient(1, 2, 3) });
    const failed = run.events.find(({ action }) => action === 'dns-failed')!;
    expect(failed.time).toBe(3000);
    expect(found).toEqual([undefined]);
  });

  it('goes straight to the authoritative server with a seed', () => {
    const { asked, auth, found } = look([[0, 'www.example.com']], { seeded: true });
    expect(asked('resolver').map(lastHopOf)).toEqual([auth.address()]);
    expect(found).toEqual(['192.0.2.10']);
  });

  it('shows the cache in a table', () => {
    const { resolver } = look([[0, 'www.example.com']]);
    const table = resolver.tables()[4]!;
    expect(table.title).toBe('Resolver cache');
    expect(table.rows).toContainEqual(['www.example.com', 'A', '192.0.2.10', expect.any(String)]);
  });

});
