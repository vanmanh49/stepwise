import { describe, expect, it } from 'vitest';
import { parseIp } from './address';
import { createHost, createSwitch, DHCP_RETRY_MS, type Host } from './devices';
import { createDhcpServer } from './dhcp';
import { BROADCAST_MAC, type Frame } from './packet';
import { simulate, type Link, type Fault } from './sim';

function ip(text: string): number {
  const parsed = parseIp(text);
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.value;
}

const mac = (n: number) => `aa:00:00:00:00:0${n}`;
const client = (n: number, label: string) => createHost({ id: label, label, column: 0, mac: mac(n), ip: 0, prefix: 24 });
const pool = (size: number) => Array.from({ length: size }, (_, i) => ip(`10.0.0.${100 + i}`));

function net(options: { pool?: number; leaseS?: number; faults?: Fault[]; endAt?: number; clients?: number } = {}) {
  const hosts: Host[] = [client(1, 'laptop'), client(2, 'phone')].slice(0, options.clients ?? 1);
  const server = createDhcpServer({ id: 'dhcp', label: 'DHCP', column: 2, mac: mac(9), ip: ip('10.0.0.1'), pool: pool(options.pool ?? 4), leaseS: options.leaseS ?? 60 });
  const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3'], agingS: 300 });
  const links: Link[] = [...hosts.map((h, i): Link => ({ a: [h.id, 'eth0'], b: ['sw', `p${i + 1}`] })), { a: ['dhcp', 'eth0'], b: ['sw', 'p3'] }];
  const run = simulate({
    devices: [...hosts, sw, server],
    links,
    commands: hosts.map((h, i) => ({ at: i, device: h.id, run: (_, ctx) => h.boot(ctx) })),
    faults: options.faults,
    endAt: options.endAt ?? 30_000,
  });
  return { hosts, run };
}

const dhcpActions = (run: { events: { action: string }[] }) => run.events.map((event) => event.action).filter((action) => action.startsWith('dhcp-'));

describe('DHCP', () => {
  it('runs Discover, Offer, Request and Ack and gives the lowest free address', () => {
    const { hosts, run } = net();
    expect(dhcpActions(run).slice(0, 4)).toEqual(['dhcp-discover', 'dhcp-offer', 'dhcp-request', 'dhcp-ack']);
    expect(hosts[0]!.address()).toBe(ip('10.0.0.100'));
  });

  it('starts from 0.0.0.0 and broadcasts', () => {
    const { run } = net();
    const discover = run.events.find((event) => event.action === 'dhcp-discover')!;
    expect(discover.frame?.dstMac).toBe(BROADCAST_MAC);
    expect(discover.frame?.payload).toMatchObject({ src: 0, dst: 0xffffffff });
  });

  it('gives a second client the next address', () => {
    const { hosts } = net({ clients: 2 });
    expect(hosts[1]!.address()).toBe(ip('10.0.0.101'));
  });

  it('stays silent with an empty pool, and the client falls back to a link-local address', () => {
    const { hosts, run } = net({ clients: 2, pool: 1 });
    expect(dhcpActions(run)).toContain('dhcp-silent');
    expect(hosts[0]!.address()).toBe(ip('10.0.0.100'));
    expect(hosts[1]!.address()).toBe(ip('169.254.0.2'));
  });

  it('falls back after exactly one retry when the server is down', () => {
    const { hosts, run } = net({ faults: [{ at: 0, kind: 'stopDevice', device: 'dhcp' }] });
    expect(dhcpActions(run).filter((action) => action === 'dhcp-discover')).toHaveLength(2);
    expect(dhcpActions(run).filter((action) => action === 'dhcp-retry')).toHaveLength(1);
    expect(run.events.find((event) => event.action === 'dhcp-fallback')?.time).toBe(2 * DHCP_RETRY_MS);
    expect(hosts[0]!.address()).toBe(ip('169.254.0.1'));
  });

  it('renews at half the lease and keeps the address', () => {
    const { hosts, run } = net({ leaseS: 60, endAt: 70_000 });
    const renewals = run.events.filter((event) => event.action === 'dhcp-renew');
    expect(renewals).toHaveLength(2);
    expect(renewals[0]!.time).toBeGreaterThanOrEqual(30_000);
    expect(renewals[0]!.time).toBeLessThan(31_000);
    expect(hosts[0]!.address()).toBe(ip('10.0.0.100'));
  });

  it('frees an address once its lease has ended', () => {
    const server = createDhcpServer({ id: 'dhcp', label: 'DHCP', column: 0, mac: mac(9), ip: ip('10.0.0.1'), pool: pool(1), leaseS: 10 });
    const discover = (from: string): Frame => ({ srcMac: from, dstMac: BROADCAST_MAC, payload: { kind: 'ip', src: 0, dst: 0xffffffff, ttl: 64, id: 1, payload: { kind: 'udp', srcPort: 68, dstPort: 67, data: { op: 'discover', yourIp: 0, serverIp: 0, leaseS: 0 } } } });
    const run = simulate({
      devices: [server],
      links: [],
      commands: [
        { at: 0, device: 'dhcp', run: (device, ctx) => device.receive(ctx, discover(mac(1)), 'eth0') },
        { at: 9_999, device: 'dhcp', run: (device, ctx) => device.receive(ctx, discover(mac(2)), 'eth0') },
        { at: 10_000, device: 'dhcp', run: (device, ctx) => device.receive(ctx, discover(mac(2)), 'eth0') },
      ],
    });
    expect(run.events.map((event) => event.action)).toEqual(['dhcp-offer', 'dhcp-silent', 'dhcp-offer']);
  });
});
