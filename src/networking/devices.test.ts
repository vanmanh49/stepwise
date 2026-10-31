import { describe, expect, it } from 'vitest';
import { parseIp } from './address';
import { ARP_TIMEOUT_MS, createHost, createSwitch, type Host } from './devices';
import { BROADCAST_MAC } from './packet';
import { simulate, type Command, type Ctx, type Link } from './sim';

function ip(text: string): number {
  const parsed = parseIp(text);
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.value;
}

const mac = (n: number) => `aa:00:00:00:00:0${n}`;
const host = (n: number, gateway?: number) => createHost({ id: `h${n}`, label: `H${n}`, column: 0, mac: mac(n), ip: ip(`10.0.0.${n}`), prefix: 24, gateway });

function lan(commands: (h: Host[]) => Command[], agingS = 300) {
  const hosts = [host(1, ip('10.0.0.254')), host(2), host(3)];
  const links: Link[] = hosts.map((h, i) => ({ a: [h.id, 'eth0'], b: ['sw', `p${i + 1}`] }));
  const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3'], agingS });
  return { hosts, ...simulate({ devices: [...hosts, sw], links, commands: commands(hosts) }) };
}

const at = (ms: number, h: Host, run: (ctx: Ctx) => void): Command => ({ at: ms, device: h.id, run: (_, ctx) => run(ctx) });
const actions = (run: { events: { action: string }[] }) => run.events.map((event) => event.action);

describe('hosts and ARP', () => {
  it('broadcasts ARP, holds the packet, then delivers it', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 1))]);
    const list = actions(run);
    expect(list.indexOf('arp-request')).toBeLessThan(list.indexOf('arp-reply'));
    expect(list.indexOf('arp-reply')).toBeLessThan(list.indexOf('send'));
    const request = run.events.find((event) => event.action === 'arp-request')!;
    expect(request.frame?.dstMac).toBe(BROADCAST_MAC);
    expect(run.hosts[0]!.replies).toEqual([{ seq: 1, from: ip('10.0.0.2'), type: 'echo-reply', rttMs: expect.any(Number) }]);
  });

  it('skips ARP on the second ping', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 1)), at(100, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 2))]);
    expect(actions(run).filter((action) => action === 'arp-request')).toHaveLength(1);
    expect(actions(run)).toContain('arp-hit');
    expect(run.hosts[0]!.replies).toHaveLength(2);
  });

  it('holds two packets for one ARP answer', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => { a!.ping(ctx, ip('10.0.0.2'), 1); a!.ping(ctx, ip('10.0.0.2'), 2); })]);
    expect(actions(run).filter((action) => action === 'arp-request')).toHaveLength(1);
    expect(run.hosts[0]!.replies.map((reply) => reply.seq).toSorted()).toEqual([1, 2]);
  });

  it('gives up when nobody answers', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.9'), 1))]);
    const failed = run.events.find((event) => event.action === 'arp-failed')!;
    expect(failed.time).toBe(ARP_TIMEOUT_MS);
    expect(actions(run)).not.toContain('send');
  });

  it('asks ARP for the gateway when the destination is on another subnet', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('8.8.8.8'), 1))]);
    expect(actions(run)).toContain('via-gateway');
    const request = run.events.find((event) => event.action === 'arp-request')!;
    expect(request.frame?.payload).toMatchObject({ targetIp: ip('10.0.0.254') });
  });

  it('refuses to leave its subnet with no gateway', () => {
    const run = lan(([, b]) => [at(0, b!, (ctx) => b!.ping(ctx, ip('8.8.8.8'), 1))]);
    expect(actions(run)).toEqual(['no-gateway']);
  });

  it('answers itself without using the wire', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.1'), 1))]);
    expect(actions(run)).toEqual(['loopback']);
  });

  it('keeps 127.0.0.1 on the host', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('127.0.0.1'), 1))]);
    expect(actions(run)).toEqual(['loopback']);
  });

  it('drops a frame for another MAC', () => {
    const a = createHost({ id: 'h1', label: 'H1', column: 0, mac: mac(1), ip: ip('10.0.0.1'), prefix: 24, arp: { [ip('10.0.0.2')]: mac(2) } });
    const others = [host(2), host(3)];
    const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3'], agingS: 300 });
    const links: Link[] = [a, ...others].map((h, i) => ({ a: [h.id, 'eth0'], b: ['sw', `p${i + 1}`] }));
    const run = simulate({ devices: [a, ...others, sw], links, commands: [at(0, a, (ctx) => a.ping(ctx, ip('10.0.0.2'), 1))] });
    expect(run.events.find((event) => event.action === 'not-mine')?.device).toBe('h3');
  });
});

describe('switches', () => {
  it('floods an unknown destination everywhere except the arrival port', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 1))]);
    const flood = run.events.find((event) => event.action === 'flood')!;
    expect(flood.hops.map((hop) => hop.to).toSorted()).toEqual(['h2', 'h3']);
  });

  it('forwards to one port once it has learned the address', () => {
    const run = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 1))]);
    const forward = run.events.find((event) => event.action === 'forward')!;
    expect(forward.hops).toHaveLength(1);
  });

  it('keeps an entry at exactly the aging time and drops it just after', () => {
    const first = lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 1))], 1);
    const lastSeen = first.events.findLast((event) => event.action === 'forward' && event.frame?.srcMac === mac(2))!.time;
    const second = (ms: number) => lan(([a]) => [at(0, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 1)), at(ms, a!, (ctx) => a!.ping(ctx, ip('10.0.0.2'), 2))], 1);
    // The second ping's frame reaches the switch 1 ms after it leaves.
    expect(actions(second(lastSeen + 999))).not.toContain('aged-out');
    expect(actions(second(lastSeen + 1000))).toContain('aged-out');
  });

  it('moves an address when its host appears on a new port', () => {
    const hosts = [host(1), host(2)];
    const sw = createSwitch({ id: 'sw', label: 'Switch', column: 1, ports: ['p1', 'p2', 'p3'], agingS: 300 });
    const links: Link[] = [
      { a: ['h1', 'eth0'], b: ['sw', 'p1'] },
      { a: ['h2', 'eth0'], b: ['sw', 'p2'] },
    ];
    const run = simulate({
      devices: [...hosts, sw],
      links,
      commands: [
        { at: 0, device: 'h2', run: (_, ctx) => hosts[1]!.ping(ctx, ip('10.0.0.1'), 1) },
        { at: 100, device: 'h2', run: (_, ctx) => hosts[1]!.ping(ctx, ip('10.0.0.1'), 2) },
      ],
      faults: [{ at: 50, kind: 'moveLink', link: 1, to: ['sw', 'p3'] }],
    });
    const rows = run.events.at(-1)!.tables.sw![0]!.rows;
    expect(rows.find((row) => row[0] === mac(2))?.[1]).toBe('p3');
    expect(run.events.filter((event) => event.action === 'learn' && event.title.includes('p3'))).toHaveLength(1);
  });
});
