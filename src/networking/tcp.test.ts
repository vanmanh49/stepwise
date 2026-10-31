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
    const closed = run.events.find((event) => event.action === 'tcp-closed' && event.device === 'c')!;
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
      const { total, run, sent, conn } = transfer({ bytes: 12500, options: { fixedWindow: 1 + (seed % 5) }, close: true, faults: dropEach(anySegment, ...nths) });
      const aborted = sent('abort').length > 0 || sent('tcp-rst').length > 0;
      expect(run.cut, `seed ${seed}`).toBe(false);
      expect(total, `seed ${seed}`).toBeLessThanOrEqual(12500);
      if (!aborted) {
        expect(total, `seed ${seed}`).toBe(12500);
        expect(conn.state, `seed ${seed}`).toBe('CLOSED');
      }
    }
  });
});
