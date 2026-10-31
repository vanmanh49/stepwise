import { ipv4 } from '../address';
import { createHost, createSwitch, type Host, type HostConfig } from '../devices';
import { createDhcpServer } from '../dhcp';
import { createRouter, type Interface, type Route } from '../router';
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
  const host = createHost({ id: 'host', label: 'Host', column: 0, mac: macOf(1), ip: ipv4('10.1.0.2'), prefix: 24, gateway: ipv4('10.1.0.1') });
  const server = createHost({ id: 'server', label: 'Server', column: 4, mac: macOf(2), ip: ipv4('10.3.0.2'), prefix: 24, gateway: ipv4('10.3.0.1') });
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
    column: 3,
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
    devices.push(createHost({ id: 'web', label: 'Web', column: 4, mac: macOf(3), ip: ipv4('192.0.2.10'), prefix: 24, gateway: ipv4('192.0.2.1') }));
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
