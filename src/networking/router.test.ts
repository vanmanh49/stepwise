import { describe, expect, it } from 'vitest';
import { parseIp } from './address';
import { createHost, type Host } from './devices';
import { createRouter, lookup, type NatConfig, type Route, type RouterConfig } from './router';
import { simulate, type Command, type Ctx, type Link } from './sim';

function ip(text: string): number {
  const parsed = parseIp(text);
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.value;
}

const route = (cidr: string, prefix: number, metric = 1, port = 'a'): Route => ({ network: ip(cidr), prefix, nextHop: 1, port, metric });
const up = () => true;

describe('lookup', () => {
  const routes = [route('0.0.0.0', 0), route('10.0.0.0', 8), route('10.3.0.0', 24)];

  it('takes the longest prefix', () => {
    expect(lookup(routes, ip('10.3.0.9'), up)?.prefix).toBe(24);
    expect(lookup(routes, ip('10.4.0.9'), up)?.prefix).toBe(8);
    expect(lookup(routes, ip('8.8.8.8'), up)?.prefix).toBe(0);
  });

  it('takes the lower metric between equal prefixes', () => {
    expect(lookup([route('10.3.0.0', 24, 2, 'b'), route('10.3.0.0', 24, 1, 'a')], ip('10.3.0.1'), up)?.port).toBe('a');
  });

  it('skips a route on a down port', () => {
    expect(lookup([route('10.3.0.0', 24, 1, 'a'), route('10.3.0.0', 24, 2, 'b')], ip('10.3.0.1'), (port) => port !== 'a')?.port).toBe('b');
  });

  it('finds nothing when nothing matches', () => {
    expect(lookup([route('10.3.0.0', 24)], ip('9.9.9.9'), up)).toBeUndefined();
  });
});

const mac = (n: number) => `aa:00:00:00:00:${String(n).padStart(2, '0')}`;

/** h1 (10.1.0.2) — r1 — r2 — h2 (10.2.0.2). */
function chain(options: { r2?: Partial<RouterConfig>; r1Routes?: Route[]; ttl?: number } = {}) {
  const h1 = createHost({ id: 'h1', label: 'H1', column: 0, mac: mac(1), ip: ip('10.1.0.2'), prefix: 24, gateway: ip('10.1.0.1') });
  const h2 = createHost({ id: 'h2', label: 'H2', column: 3, mac: mac(2), ip: ip('10.2.0.2'), prefix: 24, gateway: ip('10.2.0.1') });
  const r1 = createRouter({
    id: 'r1',
    label: 'R1',
    column: 1,
    interfaces: [
      { port: 'p0', ip: ip('10.1.0.1'), prefix: 24, mac: mac(11) },
      { port: 'p1', ip: ip('10.12.0.1'), prefix: 30, mac: mac(12) },
    ],
    routes: options.r1Routes ?? [{ network: ip('10.2.0.0'), prefix: 24, nextHop: ip('10.12.0.2'), port: 'p1', metric: 1 }],
  });
  const r2 = createRouter({
    id: 'r2',
    label: 'R2',
    column: 2,
    interfaces: [
      { port: 'p0', ip: ip('10.12.0.2'), prefix: 30, mac: mac(21) },
      { port: 'p1', ip: ip('10.2.0.1'), prefix: 24, mac: mac(22) },
    ],
    routes: [{ network: ip('10.1.0.0'), prefix: 24, nextHop: ip('10.12.0.1'), port: 'p0', metric: 1 }],
    ...options.r2,
  });
  const links: Link[] = [
    { a: ['h1', 'eth0'], b: ['r1', 'p0'] },
    { a: ['r1', 'p1'], b: ['r2', 'p0'] },
    { a: ['r2', 'p1'], b: ['h2', 'eth0'] },
  ];
  return { h1, h2, devices: [h1, r1, r2, h2], links };
}

function ping(net: ReturnType<typeof chain>, dst: string, ttl?: number) {
  return simulate({ devices: net.devices, links: net.links, commands: [{ at: 0, device: 'h1', run: (_, ctx) => net.h1.ping(ctx, ip(dst), 1, ttl) }] });
}

const actions = (run: { events: { action: string }[] }) => run.events.map((event) => event.action);

describe('routers', () => {
  it('rewrites MACs and TTL on each hop and leaves the IPs alone', () => {
    const net = chain();
    const run = ping(net, '10.2.0.2');
    const hops = run.events.filter((event) => event.action === 'forward-hop' && event.frame?.payload.kind === 'ip' && event.frame.payload.src === ip('10.1.0.2'));
    expect(hops).toHaveLength(2);
    const [first, second] = hops;
    expect(first!.frame!.srcMac).toBe(mac(12));
    expect(first!.frame!.dstMac).toBe(mac(21));
    expect(first!.frame!.payload).toMatchObject({ src: ip('10.1.0.2'), dst: ip('10.2.0.2'), ttl: 63 });
    expect(first!.before?.payload).toMatchObject({ ttl: 64 });
    expect(second!.frame!.payload).toMatchObject({ src: ip('10.1.0.2'), dst: ip('10.2.0.2'), ttl: 62 });
    expect(net.h1.replies).toHaveLength(1);
    expect(net.h1.replies[0]!.type).toBe('echo-reply');
  });

  it('marks the routing table row that decided', () => {
    const run = ping(chain(), '10.2.0.2');
    const match = run.events.find((event) => event.action === 'route-match')!;
    expect(match.table?.index).toBe(0);
    expect(run.events[0]!.tables.r1![0]!.rows[match.table!.row]![0]).toBe('10.2.0.0/24');
  });

  it('sends Time Exceeded from the arrival interface when TTL runs out', () => {
    const net = chain();
    const run = ping(net, '10.2.0.2', 2);
    expect(actions(run)).toContain('ttl-expired');
    expect(net.h1.replies[0]).toMatchObject({ type: 'time-exceeded', from: ip('10.12.0.2'), seq: 1 });
  });

  it('sends Destination Unreachable with no route', () => {
    const net = chain();
    ping(net, '9.9.9.9');
    expect(net.h1.replies[0]).toMatchObject({ type: 'unreachable', from: ip('10.1.0.1') });
  });

  it('sends Destination Unreachable when the next hop never answers ARP', () => {
    const net = chain();
    ping(net, '10.2.0.77');
    expect(net.h1.replies[0]).toMatchObject({ type: 'unreachable', from: ip('10.12.0.2') });
  });

  it('stays quiet when silent', () => {
    const net = chain({ r2: { silent: true } });
    const run = ping(net, '10.2.0.2', 2);
    expect(net.h1.replies).toEqual([]);
    expect(actions(run)).toContain('silent-drop');
  });

  it('answers a ping to its own interface', () => {
    const net = chain();
    ping(net, '10.12.0.2');
    expect(net.h1.replies[0]).toMatchObject({ type: 'echo-reply', from: ip('10.12.0.2') });
  });

  it('does not forward a broadcast', () => {
    const net = chain();
    const run = ping(net, '255.255.255.255');
    expect(actions(run)).toContain('no-forward');
    expect(actions(ping(chain(), '10.2.0.255'))).toContain('no-forward');
    expect(net.h1.replies).toEqual([]);
  });

  it('sends no error about an error', () => {
    // r2 has no route back to h1, so its Time Exceeded has nowhere to go and creates nothing else.
    const net = chain({ r2: { routes: [] } });
    const run = ping(net, '10.2.0.2', 2);
    expect(actions(run).filter((action) => action === 'no-route')).toHaveLength(1);
  });

  it('survives a routing loop with a Time Exceeded', () => {
    const loop: Route = { network: 0, prefix: 0, nextHop: ip('10.12.0.2'), port: 'p1', metric: 1 };
    const net = chain({ r1Routes: [loop], r2: { routes: [{ network: 0, prefix: 0, nextHop: ip('10.12.0.1'), port: 'p0', metric: 1 }] } });
    ping(net, '192.0.2.1', 8);
    expect(net.h1.replies[0]?.type).toBe('time-exceeded');
  });
});

const PUBLIC = '198.51.100.1';

function natNet(timeoutS = 30) {
  const a = createHost({ id: 'a', label: 'A', column: 0, mac: mac(1), ip: ip('192.168.1.10'), prefix: 24, gateway: ip('192.168.1.1') });
  const b = createHost({ id: 'b', label: 'B', column: 0, mac: mac(2), ip: ip('192.168.1.11'), prefix: 24, gateway: ip('192.168.1.1') });
  const server = createHost({ id: 'server', label: 'Server', column: 2, mac: mac(3), ip: ip('198.51.100.2'), prefix: 24, gateway: ip('198.51.100.1'), echo: true });
  const nat: NatConfig = { insidePort: 'in', outsidePort: 'out', publicIp: ip(PUBLIC), timeoutS };
  const router = createRouter({
    id: 'nat',
    label: 'Router',
    column: 1,
    interfaces: [
      { port: 'in', ip: ip('192.168.1.1'), prefix: 24, mac: mac(11) },
      { port: 'out', ip: ip(PUBLIC), prefix: 24, mac: mac(12) },
    ],
    routes: [],
    nat,
  });
  // A second inside port stands in for a switch, which isn't under test here.
  const links: Link[] = [
    { a: ['a', 'eth0'], b: ['nat', 'in'] },
    { a: ['nat', 'out'], b: ['server', 'eth0'] },
  ];
  return { a, b, server, devices: [a, router, server], links };
}

const udp = (from: Host, dst: string, srcPort: number, atMs = 0): Command => ({ at: atMs, device: from.id, run: (_, ctx: Ctx) => from.udp(ctx, ip(dst), srcPort, 7, 'hi') });

describe('NAT', () => {
  it('rewrites the source going out, keeping a free port', () => {
    const net = natNet();
    const run = simulate({ devices: net.devices, links: net.links, commands: [udp(net.a, '198.51.100.2', 5000)] });
    const out = run.events.find((event) => event.action === 'nat-out')!;
    const hop = run.events.find((event) => event.action === 'nat-send-out')!;
    expect(out).toBeDefined();
    expect(hop.frame!.payload).toMatchObject({ src: ip(PUBLIC), payload: { srcPort: 5000 } });
  });

  it('shows a new mapping with its real expiry', () => {
    const net = natNet();
    const run = simulate({ devices: net.devices, links: net.links, commands: [udp(net.a, '198.51.100.2', 5000)] });
    const out = run.events.find((event) => event.action === 'nat-out')!;
    expect(out.tables.nat![2]!.rows[0]![2]).not.toBe('0 ms');
  });

  it('says what NAT changed instead of saying the IPs stay the same', () => {
    const net = natNet();
    const run = simulate({ devices: net.devices, links: net.links, commands: [udp(net.a, '198.51.100.2', 5000)] });
    const out = run.events.find((event) => event.action === 'nat-send-out')!;
    const back = run.events.find((event) => event.action === 'nat-send-in')!;
    expect(out.why).toContain('NAT changed the source IP to 198.51.100.1');
    expect(back.why).toContain('NAT changed the destination IP to 192.168.1.10');
  });

  it('restores the inside address on the reply', () => {
    const net = natNet();
    const run = simulate({ devices: net.devices, links: net.links, commands: [udp(net.a, '198.51.100.2', 5000)] });
    expect(run.events.map((event) => event.action)).toContain('nat-in');
    const last = run.events.findLast((event) => event.action === 'udp-received')!;
    expect(last.device).toBe('a');
    expect(last.title).toContain('port 5000');
  });

  it('takes 40000 then 40001 when the port is already in use', () => {
    const net = natNet();
    const run = simulate({
      devices: net.devices,
      links: net.links,
      commands: [
        udp(net.a, '198.51.100.2', 5000, 0),
        { at: 100, device: 'nat', run: (router, ctx) => router.receive(ctx, insideFrame(ip('192.168.1.11'), 5000), 'in') },
        { at: 200, device: 'nat', run: (router, ctx) => router.receive(ctx, insideFrame(ip('192.168.1.12'), 5000), 'in') },
      ],
    });
    const ports = run.events.filter((event) => event.action === 'nat-new-port').map((event) => event.title);
    expect(ports[0]).toContain('40000');
    expect(ports[1]).toContain('40001');
  });

  it('drops inbound traffic with no mapping', () => {
    const net = natNet();
    const run = simulate({ devices: net.devices, links: net.links, commands: [udp(net.server, PUBLIC, 7)] });
    expect(run.events.map((event) => event.action)).toContain('nat-drop');
  });

  it('treats a mapping exactly at its timeout as lapsed', () => {
    const net = natNet(1);
    const run = simulate({
      devices: net.devices,
      links: net.links,
      commands: [
        { at: 0, device: 'nat', run: (router, ctx) => router.receive(ctx, insideFrame(ip('192.168.1.10'), 5000), 'in') },
        { at: 999, device: 'nat', run: (router, ctx) => router.receive(ctx, outsideFrame(5000), 'out') },
        { at: 999 + 1000, device: 'nat', run: (router, ctx) => router.receive(ctx, outsideFrame(5000), 'out') },
      ],
    });
    const list = run.events.map((event) => event.action);
    expect(list).toContain('nat-in');
    expect(list.at(-1)).toBe('nat-expired');
  });
});

function insideFrame(src: number, srcPort: number) {
  return { srcMac: mac(1), dstMac: mac(11), payload: { kind: 'ip' as const, src, dst: ip('198.51.100.2'), ttl: 64, id: 1, payload: { kind: 'udp' as const, srcPort, dstPort: 7, data: 'hi' } } };
}

function outsideFrame(dstPort: number) {
  return { srcMac: mac(3), dstMac: mac(12), payload: { kind: 'ip' as const, src: ip('198.51.100.2'), dst: ip(PUBLIC), ttl: 64, id: 1, payload: { kind: 'udp' as const, srcPort: 7, dstPort, data: 'hi' } } };
}
