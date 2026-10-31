import { describe, expect, it } from 'vitest';
import { rng } from '../data-structures/random.testutil';
import { ipv4 } from './address';
import { createHost, type Host } from './devices';
import type { Frame, Tcp } from './packet';
import { macOf } from './scenarios/topology';
import { simulate, type Command, type Ctx, type Fault, type Link, type SimEvent, type SimResult } from './sim';
import type { Conn, TcpOptions } from './tcp';

const CLIENT = ipv4('10.0.0.1');
const SERVER = ipv4('10.0.0.2');
const PORT = 80;

function pair({ clientMtu, serverMtu }: { clientMtu?: number; serverMtu?: number } = {}) {
  const client = createHost({ id: 'c', label: 'Client', column: 0, mac: macOf(1), ip: CLIENT, prefix: 24, arp: { [SERVER]: macOf(2) }, ...(clientMtu ? { mtu: clientMtu } : {}) });
  const server = createHost({ id: 's', label: 'Server', column: 1, mac: macOf(2), ip: SERVER, prefix: 24, arp: { [CLIENT]: macOf(1) }, ...(serverMtu ? { mtu: serverMtu } : {}) });
  const links: Link[] = [{ a: ['c', 'eth0'], b: ['s', 'eth0'] }];
  return { client, server, links };
}

const on = (device: Host, at: number, run: (ctx: Ctx) => void): Command => ({ at, device: device.id, run: (_, ctx) => run(ctx) });
const segment = (event: SimEvent): Tcp | undefined => {
  const payload = event.frame?.payload;
  return payload?.kind === 'ip' && payload.payload.kind === 'tcp' ? payload.payload : undefined;
};
const segmentOf = (frame: Frame): Tcp | undefined => (frame.payload.kind === 'ip' && frame.payload.payload.kind === 'tcp' ? frame.payload.payload : undefined);
const segments = (run: SimResult, device?: string) => run.events.filter((event) => segment(event) && (!device || event.device === device)).map((event) => segment(event)!);
const brief = ({ flags, seq, ack }: Tcp) => `${flags.join(' ')} ${seq} ${ack}`;
/** The states a device's first connection went through, in order. */
function states(run: SimResult, device: string) {
  const seen: string[] = [];
  for (const event of run.events) {
    const state = event.tables[device]?.[2]?.rows[0]?.[1];
    if (state && seen.at(-1) !== state) seen.push(state);
  }
  return seen;
}

describe('TCP connections', () => {
  function handshake(extra: Command[] = [], { faults, ...sizes }: { faults?: Fault[]; clientMtu?: number; serverMtu?: number } = {}) {
    const { client, server, links } = pair(sizes);
    const commands = [on(server, 0, () => server.listen(PORT)), on(client, 1, (ctx) => client.connect(ctx, SERVER, PORT)), ...extra.map((each) => ({ ...each, device: each.device === 'client' ? 'c' : 's' }))];
    return { client, server, run: simulate({ devices: [client, server], links, commands, ...(faults ? { faults } : {}) }) };
  }
  const closeBy = (who: 'client' | 'server', at = 20): Command => ({
    at,
    device: who,
    run: (device, ctx) => {
      const host = device as Host;
      host.close(ctx, host.connections()[0]!);
    },
  });

  it('opens with three segments, numbered from 1000 and 5000', () => {
    const { run } = handshake();
    expect(segments(run).map(brief)).toEqual(['SYN 1000 0', 'SYN ACK 5000 1001', 'ACK 1001 5001']);
    expect(states(run, 'c')).toEqual(['SYN_SENT', 'ESTABLISHED']);
    expect(states(run, 's')).toEqual(['SYN_RCVD', 'ESTABLISHED']);
  });

  it('walks both sides through a client close, with TIME_WAIT on the client', () => {
    const { run, client } = handshake([closeBy('client')]);
    expect(states(run, 'c')).toEqual(['SYN_SENT', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSED']);
    expect(states(run, 's')).toEqual(['SYN_RCVD', 'ESTABLISHED', 'CLOSE_WAIT', 'LAST_ACK', 'CLOSED']);
    expect(segments(run).slice(3).map(brief)).toEqual(['FIN ACK 1001 5001', 'ACK 5001 1002', 'FIN ACK 5001 1002', 'ACK 1002 5002']);
    const timeWait = run.events.find((event) => event.action === 'time-wait')!;
    const closed = run.events.find((event) => event.action === 'time-wait-over' && event.device === 'c')!;
    expect(closed.time - timeWait.time).toBe(2000);
    expect(client.connections()[0]!.state).toBe('CLOSED');
  });

  it('mirrors a server close, with TIME_WAIT on the server', () => {
    const { run } = handshake([closeBy('server')]);
    expect(states(run, 's')).toEqual(['SYN_RCVD', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSED']);
    expect(states(run, 'c')).toEqual(['SYN_SENT', 'ESTABLISHED', 'CLOSE_WAIT', 'LAST_ACK', 'CLOSED']);
  });

  it('answers a SYN to a closed port with RST', () => {
    const { client, server, links } = pair();
    const run = simulate({ devices: [client, server], links, commands: [on(client, 1, (ctx) => client.connect(ctx, SERVER, 81))] });
    expect(segments(run).map(({ flags }) => flags.join(' '))).toEqual(['SYN', 'RST ACK']);
    expect(client.connections()[0]!.state).toBe('CLOSED');
    expect(run.events.some((event) => event.action === 'tcp-rst' && event.device === 'c')).toBe(true);
  });

  it('gives a second connection the next client port', () => {
    const { client, server, links } = pair();
    const ports: number[] = [];
    simulate({
      devices: [client, server],
      links,
      commands: [on(server, 0, () => server.listen(PORT)), on(client, 1, (ctx) => client.connect(ctx, SERVER, PORT)), on(client, 2, (ctx) => client.connect(ctx, SERVER, PORT))],
      faults: [{ kind: 'dropPacket', matches: (frame) => { const tcp = segmentOf(frame); if (tcp?.flags.includes('SYN') && !tcp.flags.includes('ACK')) ports.push(tcp.srcPort); return false; }, nth: 0 }],
    });
    expect(ports).toEqual([49152, 49153]);
  });

  it('advertises an MSS both ways and uses the smaller', () => {
    const { run, client, server } = handshake([], { clientMtu: 1500, serverMtu: 1400 });
    const [syn, synAck] = segments(run);
    expect([syn!.mss, synAck!.mss]).toEqual([1460, 1360]);
    expect([client.connections()[0]!.mss, server.connections()[0]!.mss]).toEqual([1360, 1360]);
  });
});

const isData = (seq: number) => (frame: Frame) => { const tcp = segmentOf(frame); return tcp !== undefined && tcp.length > 0 && tcp.seq === seq; };
const isAck = (ack: number) => (frame: Frame) => { const tcp = segmentOf(frame); return tcp !== undefined && tcp.length === 0 && tcp.flags.join() === 'ACK' && tcp.ack === ack; };
const dropEach = (matches: (frame: Frame) => boolean, ...nths: number[]): Fault[] => nths.map((nth) => ({ kind: 'dropPacket', matches, nth }));

/** Connects at 1 ms, writes at once, and optionally closes. */
function transfer({ bytes, options = {}, serverOptions = {}, faults = [], close = false, sizes = {}, extra = () => [] }: {
  bytes: number;
  options?: TcpOptions;
  serverOptions?: TcpOptions;
  faults?: Fault[];
  close?: boolean;
  sizes?: { clientMtu?: number; serverMtu?: number };
  extra?: (conn: () => Conn) => Command[];
}) {
  const { client, server, links } = pair(sizes);
  const got: number[] = [];
  let conn: Conn | undefined;
  const commands: Command[] = [
    on(server, 0, () => server.listen(PORT, { ...serverOptions, onData: (count) => got.push(count) })),
    on(client, 1, (ctx) => {
      conn = client.connect(ctx, SERVER, PORT, options);
      client.write(ctx, conn, bytes);
      if (close) client.close(ctx, conn);
    }),
    ...extra(() => conn!),
  ];
  const run = simulate({ devices: [client, server], links, commands, faults, maxEvents: 20000 });
  const sent = (action: string) => run.events.filter((event) => event.action === action);
  return { client, server, run, got, total: got.reduce((sum, each) => sum + each, 0), conn: conn!, sent };
}
const dataSeqs = (run: SimResult) => segments(run, 'c').filter(({ length }) => length > 0).map(({ seq }) => seq);

describe('reliable delivery', () => {
  it('sends a window of numbered segments, each acknowledged', () => {
    const { run, total } = transfer({ bytes: 4000, options: { fixedWindow: 4 } });
    expect(dataSeqs(run)).toEqual([1001, 2001, 3001, 4001]);
    expect(segments(run, 's').at(-1)!.ack).toBe(5001);
    expect(total).toBe(4000);
  });

  it('counts bytes, so the last short segment is short', () => {
    const { run } = transfer({ bytes: 2500, options: { fixedWindow: 4 } });
    expect(segments(run, 'c').filter(({ length }) => length > 0).map(({ length }) => length)).toEqual([1000, 1000, 500]);
  });

  it('retransmits on the third duplicate ACK, before the timer', () => {
    const { run, total, sent } = transfer({ bytes: 5000, options: { fixedWindow: 4 }, faults: dropEach(isData(2001), 1) });
    expect(sent('tcp-dup-ack')).toHaveLength(3);
    expect(sent('tcp-dup-ack').map((event) => segment(event)!.ack)).toEqual([2001, 2001, 2001]);
    expect(sent('tcp-hold')).toHaveLength(3);
    expect(sent('fast-retransmit')).toHaveLength(1);
    expect(segment(sent('fast-retransmit')[0]!)!.seq).toBe(2001);
    expect(sent('timeout')).toHaveLength(0);
    expect(segments(run, 's').at(-1)!.ack).toBe(6001);
    expect(total).toBe(5000);
  });

  it('needs the timer for a lost last segment, and doubles it each time', () => {
    const { run, sent, total } = transfer({ bytes: 1000, options: { fixedWindow: 4 }, faults: dropEach(isData(1001), 1, 2) });
    const first = run.events.find((event) => segment(event)?.seq === 1001 && segment(event)!.length > 0)!;
    expect(sent('timeout').map((event) => event.time - first.time)).toEqual([1000, 3000]);
    expect(total).toBe(1000);
  });

  it('takes no RTT sample from a retransmitted segment', () => {
    const { conn } = transfer({ bytes: 1000, options: { fixedWindow: 4 }, faults: dropEach(isData(1001), 1) });
    expect(conn.rto).toBe(2000);
  });

  it('takes an RTT sample from a clean segment, down to the 200 ms minimum', () => {
    expect(transfer({ bytes: 1000 }).conn.rto).toBe(200);
  });

  it('covers a lost ACK with the next one', () => {
    const { run, sent, total } = transfer({ bytes: 4000, options: { fixedWindow: 4 }, faults: dropEach(isAck(2001), 1) });
    expect(dataSeqs(run)).toEqual([1001, 2001, 3001, 4001]);
    expect(sent('timeout')).toHaveLength(0);
    expect(total).toBe(4000);
  });

  it('holds out-of-order bytes and hands them over once, in order', () => {
    const { got } = transfer({ bytes: 3000, options: { fixedWindow: 4 }, faults: dropEach(isData(1001), 1) });
    expect(got).toEqual([3000]);
  });

  it('aborts with RST after 5 retries with no progress', () => {
    const { sent, conn, server } = transfer({ bytes: 1000, faults: dropEach(isData(1001), 1, 2, 3, 4, 5, 6) });
    expect(sent('timeout')).toHaveLength(5);
    expect(sent('abort')).toHaveLength(1);
    expect(segment(sent('abort')[0]!)!.flags).toContain('RST');
    expect(conn.state).toBe('CLOSED');
    expect(server.connections()[0]!.state).toBe('CLOSED');
  });

  it('resends a lost SYN after 1000 ms', () => {
    const { sent, total } = transfer({ bytes: 1000, faults: dropEach((frame) => segmentOf(frame)?.flags.join() === 'SYN', 1) });
    expect(sent('timeout').map((event) => event.time)).toEqual([1001]);
    expect(total).toBe(1000);
  });

  it('holds a FIN that arrives after a gap, so no missing byte is ever delivered', () => {
    const { run, got, total, sent } = transfer({ bytes: 3000, options: { fixedWindow: 4 }, close: true, faults: dropEach(isData(2001), 1) });
    expect(dataSeqs(run).filter((seq) => seq === 2001)).toHaveLength(2);
    expect(sent('tcp-dup-ack').length).toBeGreaterThan(0);
    expect(got[0]).toBe(1000);
    expect(total).toBe(3000);
  });

  it('survives a lost FIN and a lost last ACK', () => {
    const fin = (frame: Frame) => segmentOf(frame)?.flags.includes('FIN') === true;
    const { client, server } = transfer({ bytes: 1000, close: true, faults: [...dropEach(fin, 1), ...dropEach(isAck(5002), 1)] });
    expect(client.connections()[0]!.state).toBe('CLOSED');
    expect(server.connections()[0]!.state).toBe('CLOSED');
  });

  it('delivers every byte once and in order under seeded loss, or aborts', () => {
    const anySegment = (frame: Frame) => segmentOf(frame) !== undefined;
    for (let seed = 1; seed <= 50; seed++) {
      const random = rng(seed);
      const nths = Array.from({ length: 400 }, (_, i) => i + 1).filter(() => random() < 0.2);
      const { total, run, sent, conn } = transfer({ bytes: 12500, options: seed % 2 ? { fixedWindow: 1 + (seed % 5) } : {}, close: true, faults: dropEach(anySegment, ...nths) });
      const aborted = sent('abort').length > 0 || sent('tcp-rst').length > 0;
      expect(run.cut, `seed ${seed}`).toBe(false);
      expect(total, `seed ${seed}`).toBeLessThanOrEqual(12500);
      // Counted from what crossed the wire, so bytes TCP only claims to have can't pass.
      const arrived = new Set(run.events.filter((event) => event.device === 'c' && event.hops.some((hop) => !hop.lost)).flatMap((event) => { const tcp = segment(event); return tcp ? Array.from({ length: tcp.length }, (_, i) => tcp.seq + i) : []; }));
      expect(total, `seed ${seed}`).toBeLessThanOrEqual(arrived.size);
      if (!aborted) {
        expect(total, `seed ${seed}`).toBe(12500);
        expect(conn.state, `seed ${seed}`).toBe('CLOSED');
      }
    }
  });
});

/** Client cwnd and ssthresh, in bytes, as of this event. */
const congestion = (event: SimEvent) => {
  const [, cwnd, ssthresh] = event.tables.c![3]!.rows[0]!;
  return { cwnd: Number(cwnd), ssthresh: Number(ssthresh) };
};

describe('Reno', () => {
  const samples = (ms: number, read: (conn: Conn) => number, into: number[]) => (conn: () => Conn) => Array.from({ length: ms }, (_, i) => ({ at: i + 2, device: 'c', run: () => void into.push(read(conn())) }));
  const distinct = (values: number[]) => values.filter((value, i) => value !== values[i - 1]);

  it('doubles cwnd each round in slow start', () => {
    const windows: number[] = [];
    transfer({ bytes: 200000, extra: samples(12, (conn) => conn.cwnd, windows) });
    expect(distinct(windows).slice(0, 5)).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('grows cwnd by about one MSS a round from ssthresh', () => {
    const windows: number[] = [];
    transfer({ bytes: 200000, options: { ssthreshMss: 8 }, extra: samples(20, (conn) => conn.cwnd, windows) });
    const rounds = distinct(windows);
    expect(rounds.slice(0, 4)).toEqual([1000, 2000, 4000, 8000]);
    for (let i = 4; i < 8; i++) {
      const growth = rounds[i]! - rounds[i - 1]!;
      expect(growth).toBeGreaterThan(800);
      expect(growth).toBeLessThan(1100);
    }
  });

  it('halves on three duplicate ACKs, inflates, then deflates on the new ACK', () => {
    const { sent, run, total } = transfer({ bytes: 40000, serverOptions: { bufferBytes: 10000 }, faults: dropEach(isData(20001), 1) });
    const retransmit = sent('fast-retransmit')[0]!;
    expect(congestion(retransmit)).toEqual({ cwnd: 8000, ssthresh: 5000 });
    const after = run.events.find((event) => event.time > retransmit.time && event.device === 'c' && event.action === 'tcp-data')!;
    expect(congestion(after)).toEqual({ cwnd: 5000, ssthresh: 5000 });
    expect(total).toBe(40000);
  });

  it('adds one MSS for each further duplicate ACK', () => {
    const windows: number[] = [];
    const { sent } = transfer({
      bytes: 29000,
      serverOptions: { bufferBytes: 10000 },
      faults: dropEach(isData(20001), 1, 2),
      extra: (conn) => [{ at: 100, device: 'c', run: () => void windows.push(conn().cwnd) }],
    });
    expect(sent('tcp-dup-ack')).toHaveLength(9);
    expect(windows).toEqual([14000]);
  });

  it('restarts from one MSS on a timeout', () => {
    const { sent } = transfer({ bytes: 8000, faults: dropEach(isData(8001), 1) });
    expect(congestion(sent('timeout')[0]!)).toEqual({ cwnd: 1000, ssthresh: 2000 });
  });

  it('never lets a fixed window use cwnd', () => {
    const { run } = transfer({ bytes: 4000, options: { fixedWindow: 4 } });
    const times = run.events.filter((event) => event.action === 'tcp-data').map((event) => event.time);
    expect(new Set(times).size).toBe(1);
  });
});

describe('flow control', () => {
  const acks = (run: SimResult) => segments(run, 's').filter(({ flags }) => flags.join() === 'ACK');

  it('advertises the free buffer', () => {
    const { run } = transfer({ bytes: 4000, options: { fixedWindow: 4 }, serverOptions: { bufferBytes: 4000, readRate: 0 } });
    expect(acks(run).slice(0, 4).map(({ window }) => window)).toEqual([3000, 2000, 1000, 0]);
  });

  it('stops the sender at the peer window', () => {
    const { run } = transfer({ bytes: 6000, options: { fixedWindow: 8 }, serverOptions: { bufferBytes: 2000, readRate: 0 } });
    const early = run.events.filter((event) => event.time < 100 && event.action === 'tcp-data');
    expect(early.map((event) => segment(event)!.seq)).toEqual([1001, 2001]);
  });

  it('probes a zero window once per RTO, then resumes on a window update', () => {
    const { sent, total, conn } = transfer({ bytes: 6000, options: { fixedWindow: 8 }, serverOptions: { bufferBytes: 2000, readRate: 0 } });
    expect(sent('zero-window').length).toBeGreaterThan(0);
    const probes = sent('probe');
    expect(probes.length).toBeGreaterThan(3);
    expect(probes.every((event) => segment(event)!.length === 1)).toBe(true);
    const gaps = probes.slice(1).map((event, i) => event.time - probes[i]!.time);
    expect(new Set(gaps)).toEqual(new Set([conn.rto]));
    expect(sent('window-update')[0]!.time).toBeGreaterThanOrEqual(2000);
    expect(total).toBe(6000);
  });

  it('lets a slow reader pace the sender', () => {
    const { run, total } = transfer({ bytes: 20000, options: { fixedWindow: 16 }, serverOptions: { bufferBytes: 8000, readRate: 20 } });
    const windows = acks(run).map(({ window }) => window);
    expect(Math.min(...windows)).toBeLessThan(2000);
    expect(total).toBe(20000);
    expect(run.events.at(-1)!.time).toBeGreaterThan(500);
  });

  it('ends with every byte read when the smallest buffer is paused', () => {
    const { total, run } = transfer({ bytes: 8000, options: { fixedWindow: 64 }, close: true, serverOptions: { bufferBytes: 2000, readRate: 0 } });
    expect(total).toBe(8000);
    expect(run.cut).toBe(false);
  });

  it('never loses bytes when the window is smaller than a segment', () => {
    const { total } = transfer({ bytes: 3000, options: { fixedWindow: 8 }, serverOptions: { bufferBytes: 500, readRate: 200 } });
    expect(total).toBe(3000);
  });
});
