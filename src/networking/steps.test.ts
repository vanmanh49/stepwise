import { describe, expect, it } from 'vitest';
import { parseIp } from './address';
import { createHost } from './devices';
import type { Dns, Frame, Quic } from './packet';
import { createRouter } from './router';
import { simulate, type Device, type Fault, type SimEvent, type SimResult } from './sim';
import { tcpPath } from './scenarios/topology';
import { ladderView, MAX_STEPS, networkView, packetGrid, roundSteps, tableGrid, traceSteps } from './steps';
import type { ChartView, GridView, LadderView, PanelsView, ServicesView, Step } from '../types/visualization';

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

const COLUMNS = [{ id: 'client', label: 'Client' }, { id: 'server', label: 'Server' }];

function direct(faults: Fault[] = [], bytes = 8000): SimResult {
  const client = createHost({ id: 'client', label: 'Client', column: 0, mac: 'aa:00:00:00:00:01', ip: ip('10.0.0.1'), prefix: 24, arp: { [ip('10.0.0.2')]: 'aa:00:00:00:00:02' } });
  const server = createHost({ id: 'server', label: 'Server', column: 1, mac: 'aa:00:00:00:00:02', ip: ip('10.0.0.2'), prefix: 24, arp: { [ip('10.0.0.1')]: 'aa:00:00:00:00:01' } });
  return simulate({
    devices: [client, server],
    links: [{ a: ['client', 'eth0'], b: ['server', 'eth0'] }],
    commands: [
      { at: 0, device: 'server', run: () => server.listen(80) },
      { at: 1, device: 'client', run: (_, ctx) => client.write(ctx, client.connect(ctx, ip('10.0.0.2'), 80, { fixedWindow: 4 }), bytes) },
    ],
    ...(faults.length > 0 ? { faults } : {}),
  });
}

describe('ladderView', () => {
  it('keeps the newest 12 rows and counts the rest', () => {
    const run = direct();
    const view = ladderView(run, run.events.length - 1, COLUMNS);
    expect(view.rows).toHaveLength(12);
    expect(view.earlier).toBe(run.events.filter((event) => event.hops.length > 0).length - 12);
    expect(view.rows.at(-1)!.role).toBe('active');
  });

  it('shows no earlier count on a short ladder', () => {
    expect(ladderView(direct(), 0, COLUMNS).earlier).toBeUndefined();
  });

  it('marks a lost hop', () => {
    const faults: Fault[] = [{ kind: 'dropPacket', matches: (frame) => frame.payload.kind === 'ip' && frame.payload.payload.kind === 'tcp' && frame.payload.payload.flags.join() === 'SYN', nth: 1 }];
    const row = ladderView(direct(faults), 0, COLUMNS).rows[0]!;
    expect(row.lost).toBe(true);
    expect(row.role).toBe('discarded');
  });

  it('names real header fields on each row', () => {
    const run = direct();
    expect(ladderView(run, 2, COLUMNS).rows.map((row) => row.label)).toEqual(['SYN seq=1000', 'SYN ACK seq=5000 ack=1001', 'ACK ack=5001 win=64000']);
  });

  it('follows the connection state in each column', () => {
    const run = direct();
    const states = (upTo: number) => ladderView(run, upTo, COLUMNS).columns.map((column) => column.state);
    expect(states(0)).toEqual(['SYN_SENT', undefined]);
    expect(states(2)).toEqual(['ESTABLISHED', 'SYN_RCVD']);
  });

  it('leaves out hops off the page, such as ones through a router', () => {
    const run = routed();
    expect(ladderView(run, run.events.length - 1, COLUMNS).rows).toEqual([]);
  });
});

describe('traceSteps with a ladder', () => {
  const steps = traceSteps(direct(), CODE, LINES, { ladder: COLUMNS });

  it('swaps the Network panel for the ladder', () => {
    expect(panels(steps[0]!).map((panel) => panel.label)).toContain('Ladder');
    expect(panels(steps[0]!).map((panel) => panel.label)).not.toContain('Network');
  });

  it('lays out at most 3 panels', () => {
    expect(Math.max(...steps.map((step) => panels(step).length))).toBeLessThanOrEqual(3);
  });

  it('builds each ladder from the frames up to that step', () => {
    const ladder = (step: Step) => panels(step).find((panel) => panel.label === 'Ladder')!.view as LadderView;
    expect(ladder(steps[0]!).rows).toHaveLength(1);
    expect(ladder(steps[1]!).rows).toHaveLength(2);
  });
});

describe('packetGrid with TCP', () => {
  it('lists the TCP header fields', () => {
    const frame = direct().events.find((event) => event.action === 'tcp-data')!.frame!;
    const labels = packetGrid(frame).rows.map((row) => row.label);
    for (const label of ['Seq', 'Ack', 'Flags', 'Window', 'Length']) expect(labels).toContain(label);
  });

  it('adds fragment fields only when a packet has them', () => {
    const frame: Frame = { srcMac: 'a', dstMac: 'b', payload: { kind: 'ip', src: 1, dst: 2, ttl: 9, id: 1, length: 996, offset: 0, more: true, payload: { kind: 'udp', srcPort: 1, dstPort: 2, data: 'x' } } };
    expect(packetGrid(frame).rows.map((row) => row.label)).toEqual(expect.arrayContaining(['Total length', 'Offset', 'More fragments']));
    expect(packetGrid(routed().events.find((event) => event.frame?.payload.kind === 'ip')!.frame!).rows.map((row) => row.label)).not.toContain('Offset');
  });
});

describe('roundSteps', () => {
  const longRun = (queue: number, bytes: number) => {
    const { client, server, devices, links } = tcpPath({ queue });
    return simulate({
      devices,
      links,
      watch: ['client'],
      maxEvents: 20000,
      commands: [
        { at: 0, device: 'server', run: () => server.listen(80) },
        { at: 1, device: 'client', run: (_, ctx) => client.write(ctx, client.connect(ctx, server.address(), 80), bytes) },
      ],
    });
  };
  const cwnd = (event: SimEvent) => Number(event.tables.client?.[3]?.rows[0]?.[1] ?? 0);
  const options = { series: (event: SimEvent) => [{ label: 'cwnd', value: cwnd(event) / 1000 }], title: 'Window', yLabel: 'Segments', watchTable: 'client' };
  const chart = (step: Step) => panels(step).find((panel) => panel.label === 'Chart')!.view as ChartView;

  it('gives one step per loss signal, and stays within the cap', () => {
    const run = longRun(4, 150000);
    const steps = roundSteps(run, CODE, LINES, options);
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS + 1);
    const retransmits = run.events.filter((event) => event.action === 'fast-retransmit' || event.action === 'timeout');
    expect(retransmits.length).toBeGreaterThan(0);
    for (const event of retransmits) expect(steps.some((step) => step.title === event.title)).toBe(true);
  });

  it('moves the chart along by one point per step', () => {
    const steps = roundSteps(longRun(10, 40000), CODE, LINES, options);
    expect(steps.map((step) => chart(step).now)).toEqual(steps.map((_, i) => i));
    expect(chart(steps[0]!).lines[0]!.points).toHaveLength(steps.length);
  });

  it('doubles cwnd per round in slow start', () => {
    const steps = roundSteps(longRun(40, 12000), CODE, LINES, options);
    expect(chart(steps[0]!).lines[0]!.points.slice(0, 4)).toEqual([1, 2, 4, 8]);
  });

  it('lays out at most 3 panels', () => {
    expect(Math.max(...roundSteps(longRun(10, 40000), CODE, LINES, options).map((step) => panels(step).length))).toBeLessThanOrEqual(3);
  });

  it('folds past the cap into one summary', () => {
    const steps = roundSteps(longRun(3, 1500000), CODE, LINES, options);
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS + 1);
  });
});

describe('new packet fields', () => {
  const asFrame = (data: Dns | Quic): Frame => ({ srcMac: 'a', dstMac: 'b', payload: { kind: 'ip', src: 1, dst: 2, ttl: 64, id: 1, payload: { kind: 'udp', srcPort: 1, dstPort: 53, data } } });
  const dns = (over: Partial<Dns>): Dns => ({ proto: 'dns', id: 7, name: 'www.example.com', response: false, rcode: 'NOERROR', answers: [], authority: [], ...over });
  const rowsOf = (frame: Frame) => packetGrid(frame).rows.map((row) => [row.label, row.cells[0]!.value]);
  const label = (frame: Frame) => {
    const run: SimResult = { events: [{ action: 'x', title: 't', why: 'w', time: 0, device: 'a', frame, hops: [{ from: 'a', to: 'b' }], tables: {}, badges: {}, down: [], stopped: [], queues: {} }], cut: false, devices: [], links: [] };
    return networkView(run, run.events[0]!, []).messages[0]!.label;
  };

  it('labels DNS by what it says', () => {
    expect(label(asFrame(dns({})))).toBe('DNS www.example.com');
    const a = { name: 'www.example.com', type: 'A' as const, value: '192.0.2.1', ttl: 60 };
    expect(label(asFrame(dns({ response: true, answers: [a] })))).toBe('DNS answer');
    expect(label(asFrame(dns({ response: true, authority: [{ ...a, type: 'NS', value: 'ns.example.com' }] })))).toBe('DNS referral');
    expect(label(asFrame(dns({ response: true, rcode: 'NXDOMAIN' })))).toBe('DNS NXDOMAIN');
  });

  it('lists the DNS fields', () => {
    const answer = { name: 'www.example.com', type: 'A' as const, value: '192.0.2.1', ttl: 60 };
    expect(rowsOf(asFrame(dns({ response: true, answers: [answer] })))).toEqual(expect.arrayContaining([['DNS name', 'www.example.com'], ['Rcode', 'NOERROR'], ['Answer', 'www.example.com A 192.0.2.1 TTL 60']]));
  });

  it('keeps packet rows unique when records repeat', () => {
    const record = { name: 'example.com', type: 'NS' as const, value: 'ns.example.com', ttl: 60 };
    const labels = rowsOf(asFrame(dns({ response: true, authority: [record, record] }))).map(([name]) => name);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('labels and lists QUIC', () => {
    const data: Quic = { proto: 'quic', number: 5, space: '1rtt', frames: [{ stream: 4, offset: 1000, length: 1000 }], acks: [[1, 3], [5, 5]] };
    expect(label(asFrame(data))).toBe('QUIC #5 stream 4');
    expect(rowsOf(asFrame(data))).toEqual(expect.arrayContaining([['Packet number', '5'], ['Space', '1rtt'], ['Stream', '4 at 1000, 1000 bytes'], ['ACK ranges', '1–3, 5–5']]));
    expect(label(asFrame({ ...data, frames: [] }))).toBe('QUIC ACK 1–3, 5–5');
    expect(label(asFrame({ ...data, frames: [], acks: [], space: 'initial' }))).toBe('QUIC initial #5');
  });

  it('labels and lists BGP', () => {
    const frame: Frame = { srcMac: 'a', dstMac: 'b', payload: { kind: 'bgp', type: 'UPDATE', network: ip('203.0.113.0'), prefix: 24, path: [65002, 65001] } };
    expect(label(frame)).toBe('BGP UPDATE 203.0.113.0/24');
    expect(rowsOf(frame)).toEqual(expect.arrayContaining([['BGP', 'UPDATE'], ['Prefix', '203.0.113.0/24'], ['AS_PATH', '65002 65001']]));
  });
});
