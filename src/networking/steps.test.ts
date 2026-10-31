import { describe, expect, it } from 'vitest';
import { parseIp } from './address';
import { createHost } from './devices';
import type { Frame } from './packet';
import { createRouter } from './router';
import { simulate, type Device, type SimResult } from './sim';
import { MAX_STEPS, packetGrid, tableGrid, traceSteps } from './steps';
import type { GridView, PanelsView, ServicesView, Step } from '../types/visualization';

function ip(text: string): number {
  const parsed = parseIp(text);
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.value;
}

const CODE = 'first line\nforward line';
const LINES = { 'forward-hop': 'forward line' };

function routed(): SimResult {
  const a = createHost({ id: 'a', label: 'A', column: 0, mac: 'aa:00:00:00:00:01', ip: ip('10.1.0.2'), prefix: 24, gateway: ip('10.1.0.1') });
  const b = createHost({ id: 'b', label: 'B', column: 2, mac: 'aa:00:00:00:00:02', ip: ip('10.2.0.2'), prefix: 24, gateway: ip('10.2.0.1') });
  const r = createRouter({
    id: 'r',
    label: 'R',
    column: 1,
    interfaces: [
      { port: 'p0', ip: ip('10.1.0.1'), prefix: 24, mac: 'aa:00:00:00:00:11' },
      { port: 'p1', ip: ip('10.2.0.1'), prefix: 24, mac: 'aa:00:00:00:00:12' },
    ],
    routes: [],
  });
  return simulate({
    devices: [a, r, b],
    links: [
      { a: ['a', 'eth0'], b: ['r', 'p0'] },
      { a: ['r', 'p1'], b: ['b', 'eth0'] },
    ],
    commands: [{ at: 0, device: 'a', run: (_, ctx) => a.ping(ctx, ip('10.2.0.2'), 1) }],
  });
}

const panels = (step: Step) => (step.view as PanelsView).panels;
const grid = (step: Step, label: string) => panels(step).find((panel) => panel.label === label)!.view as GridView;
const services = (step: Step) => panels(step).find((panel) => panel.label === 'Network')!.view as ServicesView;
const rolesOf = (view: GridView) => Object.fromEntries(view.rows.map((row) => [row.label, row.cells[0]!.role]));

describe('traceSteps', () => {
  const steps = traceSteps(routed(), CODE, LINES);

  it('highlights what a router changed, and leaves the IPs alone', () => {
    const hop = steps.find((step) => step.title.includes('forwards it'))!;
    const roles = rolesOf(grid(hop, 'Packet'));
    expect(roles['TTL']).toBe('active');
    expect(roles['Source MAC']).toBe('active');
    expect(roles['Destination MAC']).toBe('active');
    expect(roles['Source IP']).toBe('default');
    expect(roles['Destination IP']).toBe('default');
  });

  it('points each action at its code line', () => {
    expect(steps.find((step) => step.title.includes('forwards it'))!.codeLine).toBe(2);
    expect(steps[0]!.codeLine).toBe(1);
  });

  it('keeps the last code line on a step with no line of its own', () => {
    const after = steps.findIndex((step) => step.title.includes('forwards it'));
    expect(steps[after + 1]!.codeLine).toBe(2);
  });

  it('leaves out hidden actions', () => {
    const titles = traceSteps(routed(), CODE, LINES, { hide: ['arp-request', 'arp-reply'] }).map((step) => step.title);
    expect(titles.join()).not.toContain('Who has');
  });

  it('never shows more than 3 panels', () => {
    for (const step of steps) expect(panels(step).length).toBeLessThanOrEqual(3);
  });

  it('highlights the deciding row', () => {
    const match = steps.find((step) => step.title.includes('matches'))!;
    expect(grid(match, 'R routes').rows.flatMap((row) => row.cells.map((cell) => cell?.role))).toContain('active');
  });

  it('shows the acting device as active', () => {
    const hop = steps.find((step) => step.title.includes('forwards it'))!;
    expect(services(hop).nodes.find((node) => node.id === 'r')?.role).toBe('active');
    expect(services(hop).messages).toHaveLength(1);
  });

  it('draws a flood as one step with one message per port', () => {
    const hub: Device = { id: 'hub', label: 'Hub', type: 'switch', column: 0, receive() {}, tables: () => [] };
    const leaf = (id: string): Device => ({ id, label: id, type: 'host', column: 1, receive() {}, tables: () => [] });
    const frame: Frame = { srcMac: 'x', dstMac: 'y', payload: { kind: 'ip', src: 1, dst: 2, ttl: 9, id: 1, payload: { kind: 'icmp', type: 'echo-request', seq: 1 } } };
    const run = simulate({
      devices: [hub, leaf('a'), leaf('b')],
      links: [
        { a: ['hub', 'p1'], b: ['a', 'eth0'] },
        { a: ['hub', 'p2'], b: ['b', 'eth0'] },
      ],
      commands: [{ at: 0, device: 'hub', run: (_, ctx) => ctx.send(['p1', 'p2'], frame, { action: 'flood', title: 'flood', why: 'test' }) }],
    });
    const flood = traceSteps(run, CODE, {});
    expect(flood).toHaveLength(1);
    expect(services(flood[0]!).messages.map((message) => message.to)).toEqual(['a', 'b']);
    expect(new Set(services(flood[0]!).messages.map((message) => message.id)).size).toBe(2);
  });

  it('folds a long run into a summary that counts what it left out', () => {
    const talker: Device = { id: 't', label: 'T', type: 'host', column: 0, receive() {}, tables: () => [] };
    const run = simulate({
      devices: [talker],
      links: [],
      commands: Array.from({ length: 300 }, (_, at) => ({ at, device: 't', run: (_d: Device, ctx: Parameters<Device['receive']>[0]) => ctx.note({ action: 'x', title: `event ${at}`, why: 'test' }) })),
    });
    const long = traceSteps(run, CODE, {});
    expect(long).toHaveLength(MAX_STEPS + 1);
    expect(long.at(-1)!.title).toContain('100');
  });
});

describe('grids', () => {
  it('fills an empty table with a placeholder row', () => {
    const view = tableGrid({ title: 'T', columns: ['A', 'B'], rows: [] }, 'x');
    expect(view.rows).toHaveLength(1);
  });

  it('lists ARP fields', () => {
    const frame: Frame = { srcMac: 'x', dstMac: 'y', payload: { kind: 'arp', op: 'request', senderMac: 'x', senderIp: 1, targetMac: '', targetIp: 2 } };
    expect(packetGrid(frame).rows.map((row) => row.label)).toContain('Target IP');
  });

  it('lists DHCP fields', () => {
    const frame: Frame = { srcMac: 'x', dstMac: 'y', payload: { kind: 'ip', src: 0, dst: 0xffffffff, ttl: 64, id: 1, payload: { kind: 'udp', srcPort: 68, dstPort: 67, data: { op: 'offer', yourIp: 5, serverIp: 6, leaseS: 60 } } } };
    expect(packetGrid(frame).rows.map((row) => row.label)).toContain('DHCP');
  });
});
