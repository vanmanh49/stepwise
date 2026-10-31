import { ipv4 } from '../address';
import { createAs, type AsConfig, type Relation } from '../app/bgp';
import { dnsResolver, dnsServer } from '../app/dns';
import { createHost, createSwitch, type Host, type HostConfig } from '../devices';
import { createDhcpServer } from '../dhcp';
import { createRouter, type Interface, type Route } from '../router';
import type { DnsRecord } from '../packet';
import type { Device, Link } from '../sim';

export const macOf = (n: number) => `aa:00:00:00:00:${n.toString(16).padStart(2, '0')}`;

const LAN = ['A', 'B', 'C', 'D'];

export interface Lan {
  hosts: Host[];
  devices: Device[];
  links: Link[];
}

/** Hosts A–D at 10.0.0.1–4 on one switch, with a spare port p5. `known` starts every host with the others' MACs. */
export function fourHosts({ agingS = 300, known = false }: { agingS?: number; known?: boolean } = {}): Lan {
  const everyone = LAN.map((_, i) => [ipv4(`10.0.0.${i + 1}`), macOf(i + 1)] as const);
  const hosts = LAN.map((name, i): Host => {
    const config: HostConfig = { id: name, label: name, column: i < 2 ? 0 : 2, mac: macOf(i + 1), ip: ipv4(`10.0.0.${i + 1}`), prefix: 24 };
    return createHost(known ? { ...config, arp: Object.fromEntries(everyone.filter(([, mac]) => mac !== config.mac)) } : config);
  });
  const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3', 'p4', 'p5'], agingS });
  return { hosts, devices: [...hosts, sw], links: hosts.map((host, i) => ({ a: [host.id, 'eth0'], b: ['sw', `p${i + 1}`] })) };
}

export interface ThreeRoutersOptions {
  /** Adds 192.0.2.10 on R3, a network only default routes reach. */
  web?: boolean;
  /** Adds a direct R1–R3 link, a second-choice way to the server. */
  backup?: boolean;
  /** Points R2's default route back at R1. */
  loop?: boolean;
  /** R2 sends no ICMP errors. */
  silent?: boolean;
}

export interface ThreeRouters extends Lan {
  host: Host;
}

/** The link that `link: Down` cuts: R1 to R2. */
export const R1_R2_LINK = 1;

const route = (network: string, prefix: number, nextHop: string, port: string, metric = 1): Route => ({ network: ipv4(network), prefix, nextHop: ipv4(nextHop), port, metric });

/** Host 10.1.0.2 — R1 — R2 — R3 — server 10.3.0.2. R3 has no default route, so an address nobody knows dies there. */
export function threeRouters({ web, backup, loop, silent }: ThreeRoutersOptions = {}): ThreeRouters {
  const iface = (port: string, ip: string, prefix: number, n: number): Interface => ({ port, ip: ipv4(ip), prefix, mac: macOf(n) });
  // With a direct R1–R3 link, R2 and R3 share a column so that the link doesn't run behind R2.
  const r3Column = backup ? 2 : 3;
  const host = createHost({ id: 'host', label: 'Host', column: 0, mac: macOf(1), ip: ipv4('10.1.0.2'), prefix: 24, gateway: ipv4('10.1.0.1') });
  const server = createHost({ id: 'server', label: 'Server', column: r3Column + 1, mac: macOf(2), ip: ipv4('10.3.0.2'), prefix: 24, gateway: ipv4('10.3.0.1') });
  const r1 = createRouter({
    id: 'r1',
    label: 'R1',
    column: 1,
    interfaces: [iface('p0', '10.1.0.1', 24, 0x11), iface('p1', '10.12.0.1', 30, 0x12), ...(backup ? [iface('p2', '10.13.0.1', 30, 0x13)] : [])],
    routes: [
      route('10.3.0.0', 24, '10.12.0.2', 'p1'),
      ...(backup ? [route('10.3.0.0', 24, '10.13.0.2', 'p2', 2)] : []),
      route('10.0.0.0', 8, '10.12.0.2', 'p1'),
      route('0.0.0.0', 0, '10.12.0.2', 'p1'),
    ],
  });
  const r2 = createRouter({
    id: 'r2',
    label: 'R2',
    column: 2,
    silent,
    interfaces: [iface('p0', '10.12.0.2', 30, 0x21), iface('p1', '10.23.0.1', 30, 0x22)],
    routes: [
      route('10.1.0.0', 24, '10.12.0.1', 'p0'),
      route('10.3.0.0', 24, '10.23.0.2', 'p1'),
      loop ? route('0.0.0.0', 0, '10.12.0.1', 'p0') : route('0.0.0.0', 0, '10.23.0.2', 'p1'),
    ],
  });
  const r3 = createRouter({
    id: 'r3',
    label: 'R3',
    column: r3Column,
    interfaces: [iface('p0', '10.23.0.2', 30, 0x31), iface('p1', '10.3.0.1', 24, 0x32), ...(web ? [iface('p2', '192.0.2.1', 24, 0x33)] : []), ...(backup ? [iface('p3', '10.13.0.2', 30, 0x34)] : [])],
    // With a backup link, R2's way to R1 may be the one that failed, so replies take the direct link.
    routes: [backup ? route('10.1.0.0', 24, '10.13.0.1', 'p3') : route('10.1.0.0', 24, '10.23.0.1', 'p0')],
  });
  const devices: Device[] = [host, r1, r2, r3, server];
  const links: Link[] = [
    { a: ['host', 'eth0'], b: ['r1', 'p0'] },
    { a: ['r1', 'p1'], b: ['r2', 'p0'] },
    { a: ['r2', 'p1'], b: ['r3', 'p0'] },
    { a: ['r3', 'p1'], b: ['server', 'eth0'] },
  ];
  if (web) {
    devices.push(createHost({ id: 'web', label: 'Web', column: r3Column + 1, mac: macOf(3), ip: ipv4('192.0.2.10'), prefix: 24, gateway: ipv4('192.0.2.1') }));
    links.push({ a: ['r3', 'p2'], b: ['web', 'eth0'] });
  }
  if (backup) links.push({ a: ['r1', 'p2'], b: ['r3', 'p3'] });
  return { host, hosts: [host, server], devices, links };
}

/** A public-address router outside, so a private address has nowhere to go. */
export interface HomeNetwork extends Lan {
  a: Host;
  b: Host;
  server: Host;
}

/** Hosts A and B on a switch, behind one NAT router, across an Internet router from a server that echoes UDP. */
export function homeNetwork({ timeoutS, echoDelayMs }: { timeoutS: number; echoDelayMs?: number }): HomeNetwork {
  const inside = (id: string, n: number) => createHost({ id, label: id, column: 0, mac: macOf(n), ip: ipv4(`192.168.1.${9 + n}`), prefix: 24, gateway: ipv4('192.168.1.1') });
  const a = inside('A', 1);
  const b = inside('B', 2);
  const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3'], agingS: 300 });
  const nat = createRouter({
    id: 'nat',
    label: 'Router',
    column: 2,
    interfaces: [
      { port: 'in', ip: ipv4('192.168.1.1'), prefix: 24, mac: macOf(0x11) },
      { port: 'out', ip: ipv4('198.51.100.1'), prefix: 24, mac: macOf(0x12) },
    ],
    routes: [route('0.0.0.0', 0, '198.51.100.2', 'out')],
    nat: { insidePort: 'in', outsidePort: 'out', publicIp: ipv4('198.51.100.1'), timeoutS },
  });
  const internet = createRouter({
    id: 'internet',
    label: 'Internet',
    column: 3,
    interfaces: [
      { port: 'p0', ip: ipv4('198.51.100.2'), prefix: 24, mac: macOf(0x21) },
      { port: 'p1', ip: ipv4('203.0.113.1'), prefix: 24, mac: macOf(0x22) },
    ],
    routes: [],
  });
  const server = createHost({ id: 'server', label: 'Server', column: 4, mac: macOf(3), ip: ipv4('203.0.113.5'), prefix: 24, gateway: ipv4('203.0.113.1'), echo: true, echoDelayMs });
  return {
    a,
    b,
    server,
    hosts: [a, b, server],
    devices: [a, b, sw, nat, internet, server],
    links: [
      { a: ['A', 'eth0'], b: ['sw', 'p1'] },
      { a: ['B', 'eth0'], b: ['sw', 'p2'] },
      { a: ['sw', 'p3'], b: ['nat', 'in'] },
      { a: ['nat', 'out'], b: ['internet', 'p0'] },
      { a: ['internet', 'p1'], b: ['server', 'eth0'] },
    ],
  };
}

/** A laptop and a phone with no address yet, on a switch with a DHCP server at 10.0.0.1. */
export function dhcpNetwork({ pool, leaseS }: { pool: number; leaseS: number }): Lan {
  const client = (id: string, label: string, n: number) => createHost({ id, label, column: 0, mac: macOf(n), ip: 0, prefix: 24 });
  const laptop = client('laptop', 'Laptop', 1);
  const phone = client('phone', 'Phone', 2);
  const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3'], agingS: 300 });
  const addresses = Array.from({ length: pool }, (_, i) => ipv4(`10.0.0.${100 + i}`));
  const server = createDhcpServer({ id: 'dhcp', label: 'DHCP', column: 2, mac: macOf(9), ip: ipv4('10.0.0.1'), pool: addresses, leaseS });
  return {
    hosts: [laptop, phone],
    devices: [laptop, phone, sw, server],
    links: [
      { a: ['laptop', 'eth0'], b: ['sw', 'p1'] },
      { a: ['phone', 'eth0'], b: ['sw', 'p2'] },
      { a: ['dhcp', 'eth0'], b: ['sw', 'p3'] },
    ],
  };
}

export const SERVER_PORT = 80;
const SEGMENT_BYTES = 1040;
export const HOST_COLUMNS = [{ id: 'client', label: 'Client' }, { id: 'server', label: 'Server' }];
export const CLIENT_IP = ipv4('10.0.0.1');
export const SERVER_IP = ipv4('10.0.0.2');

/** A Client and a Server on one 10 ms link, each already knowing the other's MAC. */
export function twoHosts({ rate }: { rate?: number } = {}) {
  const client = createHost({ id: 'client', label: 'Client', column: 0, mac: macOf(1), ip: CLIENT_IP, prefix: 24, arp: { [SERVER_IP]: macOf(2) } });
  const server = createHost({ id: 'server', label: 'Server', column: 1, mac: macOf(2), ip: SERVER_IP, prefix: 24, arp: { [CLIENT_IP]: macOf(1) } });
  const links: Link[] = [{ a: ['client', 'eth0'], b: ['server', 'eth0'], ms: 10, ...(rate ? { rate } : {}) }];
  return { client, server, devices: [client, server] as Device[], links };
}

export interface TcpPath {
  client: Host;
  server: Host;
  devices: Device[];
  links: Link[];
  /** Index of the Router–Server link. */
  bottleneck: number;
}

/** Client — Router — Server. The Router–Server link is the slow one: 10 ms per segment by default, and a queue in packets. */
export function tcpPath({ rate = 104, queue = 10, ms = 20 }: { rate?: number; queue?: number; ms?: number } = {}): TcpPath {
  const client = createHost({ id: 'client', label: 'Client', column: 0, mac: macOf(1), ip: ipv4('10.0.1.2'), prefix: 24, gateway: ipv4('10.0.1.1'), arp: { [ipv4('10.0.1.1')]: macOf(0x11) } });
  const server = createHost({ id: 'server', label: 'Server', column: 2, mac: macOf(2), ip: ipv4('10.0.2.2'), prefix: 24, gateway: ipv4('10.0.2.1'), arp: { [ipv4('10.0.2.1')]: macOf(0x12) } });
  const router = createRouter({
    id: 'router',
    label: 'Router',
    column: 1,
    interfaces: [
      { port: 'p0', ip: ipv4('10.0.1.1'), prefix: 24, mac: macOf(0x11) },
      { port: 'p1', ip: ipv4('10.0.2.1'), prefix: 24, mac: macOf(0x12) },
    ],
    routes: [],
  });
  const links: Link[] = [
    { a: ['client', 'eth0'], b: ['router', 'p0'] },
    { a: ['router', 'p1'], b: ['server', 'eth0'], rate, ms, queueBytes: queue * SEGMENT_BYTES },
  ];
  return { client, server, devices: [client, router, server], links, bottleneck: 1 };
}

/** Client — R1 — R2 — Server, where the R1–R2 link has the small MTU. The client's own MTU is 1500 and the server's 1400. */
export function mtuPath({ mtu, silent = false }: { mtu: number; silent?: boolean }) {
  const client = createHost({ id: 'client', label: 'Client', column: 0, mac: macOf(1), ip: ipv4('10.0.1.2'), prefix: 24, gateway: ipv4('10.0.1.1'), mtu: 1500 });
  const server = createHost({ id: 'server', label: 'Server', column: 3, mac: macOf(2), ip: ipv4('10.0.2.2'), prefix: 24, gateway: ipv4('10.0.2.1'), mtu: 1400 });
  const r1 = createRouter({
    id: 'r1',
    label: 'R1',
    column: 1,
    silent,
    interfaces: [
      { port: 'p0', ip: ipv4('10.0.1.1'), prefix: 24, mac: macOf(0x11) },
      { port: 'p1', ip: ipv4('10.0.12.1'), prefix: 30, mac: macOf(0x12) },
    ],
    routes: [route('10.0.2.0', 24, '10.0.12.2', 'p1')],
  });
  const r2 = createRouter({
    id: 'r2',
    label: 'R2',
    column: 2,
    interfaces: [
      { port: 'p0', ip: ipv4('10.0.12.2'), prefix: 30, mac: macOf(0x21) },
      { port: 'p1', ip: ipv4('10.0.2.1'), prefix: 24, mac: macOf(0x22) },
    ],
    routes: [route('10.0.1.0', 24, '10.0.12.1', 'p0')],
  });
  const links: Link[] = [
    { a: ['client', 'eth0'], b: ['r1', 'p0'] },
    { a: ['r1', 'p1'], b: ['r2', 'p0'], mtu },
    { a: ['r2', 'p1'], b: ['server', 'eth0'] },
  ];
  return { client, server, devices: [client, r1, r2, server] as Device[], links };
}

/** Hidden on any run through a Router, where the hops themselves aren't the lesson. */
export const WEB_QUIET = ['arp-request', 'arp-reply', 'not-mine', 'route-match', 'forward-hop'];

/** Holds every packet of a whole page, so a web lesson loses only the packets it chooses. */
const WEB_QUEUE = 64;

/** Client — Router — Server, as `tcpPath`, with a queue that doesn't overflow. */
export const webPath = ({ rate, queue = WEB_QUEUE, ms }: { rate?: number; queue?: number; ms?: number } = {}) => tcpPath({ ...(rate === undefined ? {} : { rate }), queue, ...(ms === undefined ? {} : { ms }) });

export const RESOLVER_IP = ipv4('10.0.2.2');
const AUTH_IP = '10.0.5.2';
const DNS_TTL_S = 60;
const dnsRecord = (name: string, type: DnsRecord['type'], value: string): DnsRecord => ({ name, type, value, ttl: DNS_TTL_S });
const EXAMPLE_NS = [dnsRecord('example.com', 'NS', 'ns1.example.com'), dnsRecord('ns1.example.com', 'A', AUTH_IP)];

/** A host on its own subnet 10.0.n.0/24, one link from a Router that has interface pn. */
const hostOn = (id: string, label: string, n: number, column: number, type?: Device['type']) => createHost({ id, label, column, mac: macOf(n), ip: ipv4(`10.0.${n}.2`), prefix: 24, gateway: ipv4(`10.0.${n}.1`), arp: { [ipv4(`10.0.${n}.1`)]: macOf(0x10 + n) }, ...(type ? { type } : {}) });

const hub = (column: number, subnets: number[], routes: Route[] = []) => createRouter({
  id: 'router',
  label: 'Router',
  column,
  interfaces: subnets.map((n) => ({ port: `p${n}`, ip: ipv4(`10.0.${n}.1`), prefix: 24, mac: macOf(0x10 + n) })),
  routes,
});

/** One Router joining a Client and four name servers on their own subnets, so each link is a real hop. */
export function dnsTree({ seeded = false }: { seeded?: boolean } = {}) {
  const client = hostOn('client', 'Client', 1, 0);
  const resolver = hostOn('resolver', 'Resolver', 2, 0, 'dns');
  const root = hostOn('root', 'Root', 3, 2, 'dns');
  const tld = hostOn('tld', 'TLD', 4, 2, 'dns');
  const auth = hostOn('auth', 'Authoritative', 5, 2, 'dns');
  const hosts = [client, resolver, root, tld, auth];
  dnsResolver(resolver, root.address(), seeded ? EXAMPLE_NS : []);
  dnsServer(root, [dnsRecord('com', 'NS', 'a.gtld-servers.net'), dnsRecord('a.gtld-servers.net', 'A', '10.0.4.2')]);
  dnsServer(tld, EXAMPLE_NS);
  dnsServer(auth, [dnsRecord('www.example.com', 'A', '192.0.2.10'), dnsRecord('api.example.com', 'A', '192.0.2.20')]);
  const links: Link[] = hosts.map((host, i) => ({ a: [host.id, 'eth0'], b: ['router', `p${i + 1}`], ms: 10 }));
  return { client, resolver, root, tld, auth, devices: [...hosts, hub(1, [1, 2, 3, 4, 5])] as Device[], links };
}

/** Client, Resolver and Authoritative round a Router, with the Server on tcpPath's slow link. The Resolver already knows where example.com is. */
export function pagePath() {
  const client = hostOn('client', 'Client', 1, 0);
  const resolver = hostOn('resolver', 'Resolver', 2, 1, 'dns');
  const auth = hostOn('auth', 'Authoritative', 5, 1, 'dns');
  const server = hostOn('server', 'Server', 6, 3);
  dnsResolver(resolver, ipv4('10.0.3.2'), EXAMPLE_NS);
  dnsServer(auth, [dnsRecord('www.example.com', 'A', '10.0.6.2')]);
  const links: Link[] = [
    { a: ['client', 'eth0'], b: ['router', 'p1'] },
    { a: ['resolver', 'eth0'], b: ['router', 'p2'], ms: 10 },
    { a: ['auth', 'eth0'], b: ['router', 'p5'], ms: 10 },
    { a: ['router', 'p6'], b: ['server', 'eth0'], rate: 104, ms: 20, queueBytes: WEB_QUEUE * SEGMENT_BYTES },
  ];
  return { client, resolver, auth, server, devices: [client, resolver, auth, hub(2, [1, 2, 5, 6]), server] as Device[], links };
}

export const ANYCAST_IP = ipv4('198.51.100.10');
const NEAR_MS = 5;
const FAR_MS = 30;
const ORIGIN_MS = 60;

/** Two edges share one address. The Router knows both ways to it, and the lower metric wins while its link is up. */
export function cdnNet() {
  const client = hostOn('client', 'Client', 1, 0);
  const resolver = hostOn('resolver', 'Resolver', 2, 0, 'dns');
  // shortcut: each edge fetches from the origin on the shared address, with its own ports; a real edge has a unicast address for this.
  const edge = (id: string, label: string, n: number) => createHost({ id, label, column: 2, mac: macOf(n), ip: ANYCAST_IP, prefix: 32, gateway: ipv4(`10.0.${n}.1`), arp: { [ipv4(`10.0.${n}.1`)]: macOf(0x10 + n) }, firstPort: 50000 + n * 1000 });
  const edges = [edge('near', 'Near edge', 3), edge('far', 'Far edge', 4)];
  const origin = hostOn('origin', 'Origin', 5, 3);
  const anycast = (port: string, metric: number): Route => ({ network: ANYCAST_IP, prefix: 32, port, metric });
  const router = hub(1, [1, 2, 3, 4, 5], [anycast('p3', 1), anycast('p4', 2)]);
  dnsResolver(resolver, ipv4('10.0.3.2'), [dnsRecord('www.example.com', 'A', '198.51.100.10')]);
  const links: Link[] = [
    { a: ['client', 'eth0'], b: ['router', 'p1'] },
    { a: ['resolver', 'eth0'], b: ['router', 'p2'] },
    { a: ['near', 'eth0'], b: ['router', 'p3'], ms: NEAR_MS },
    { a: ['far', 'eth0'], b: ['router', 'p4'], ms: FAR_MS },
    { a: ['origin', 'eth0'], b: ['router', 'p5'], ms: ORIGIN_MS },
  ];
  return { client, resolver, edges, origin, anycast: ANYCAST_IP, devices: [client, resolver, router, ...edges, origin] as Device[], links, nearLink: 2 };
}

const AS_LINK_MS = 5;
const asEdges: [from: string, to: string, relation: Relation][] = [
  ['isp', 'ta', 'provider'],
  ['isp', 'tb', 'provider'],
  ['ta', 'tb', 'peer'],
  ['ta', 'origin', 'customer'],
  ['tb', 'core', 'customer'],
  ['core', 'origin', 'customer'],
  ['tb', 'evil', 'customer'],
];
const AS_NAMES: Record<string, { label: string; asn: number; column: number }> = {
  isp: { label: 'ISP', asn: 65200, column: 0 },
  ta: { label: 'Transit A', asn: 65010, column: 1 },
  tb: { label: 'Transit B', asn: 65020, column: 1 },
  core: { label: 'Core', asn: 65030, column: 2 },
  evil: { label: 'Hijacker', asn: 65666, column: 2 },
  origin: { label: 'Origin', asn: 65001, column: 3 },
};
const OPPOSITE: Record<Relation, Relation> = { customer: 'provider', provider: 'customer', peer: 'peer' };

/** Six ASes. The ISP's way through Transit A is shorter than through Transit B and Core. `prepend` is what Origin adds towards Transit A. */
export function asNet({ prepend = 0 }: { prepend?: number } = {}) {
  const routers = Object.fromEntries(Object.entries(AS_NAMES).map(([id, { label, asn, column }]) => {
    const neighbours = asEdges.flatMap(([from, to, relation]): AsConfig['neighbours'] => {
      if (from === id) return [{ port: to, relation }];
      if (to === id) return [{ port: from, relation: OPPOSITE[relation], ...(id === 'origin' && from === 'ta' && prepend ? { prepend } : {}) }];
      return [];
    });
    return [id, createAs({ id, label, column, asn, neighbours })];
  }));
  const links: Link[] = asEdges.map(([from, to]) => ({ a: [from, to], b: [to, from], ms: AS_LINK_MS }));
  return { routers, devices: Object.values(routers) as Device[], links, asnOf: (id: string) => AS_NAMES[id]!.asn };
}
