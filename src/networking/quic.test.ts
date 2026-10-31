import { describe, expect, it } from 'vitest';
import { rng } from '../data-structures/random.testutil';
import type { Frame, Quic } from './packet';
import { createQuic, type QuicConn, type QuicOptions } from './quic';
import { twoHosts } from './scenarios/topology';
import { simulate, type Ctx, type Fault, type SimEvent } from './sim';

const PORT = 443;
const quicOf = (frame: Frame | undefined): Quic | undefined => {
  const inner = frame?.payload.kind === 'ip' ? frame.payload.payload : undefined;
  return inner?.kind === 'udp' && typeof inner.data === 'object' && 'proto' in inner.data && inner.data.proto === 'quic' ? inner.data : undefined;
};
const dataFrom = (run: { events: SimEvent[] }, device: string) => run.events.filter((event) => event.device === device && (quicOf(event.frame)?.frames.length ?? 0) > 0);

interface Setup {
  writes?: [stream: number, bytes: number, mark?: unknown][];
  serverWrites?: [stream: number, bytes: number, mark?: unknown][];
  client?: QuicOptions;
  server?: QuicOptions;
  faults?: (macs: { client: string; server: string }) => Fault[];
}

function connect({ writes = [], serverWrites = [], client: clientOptions = {}, server: serverOptions = {}, faults }: Setup) {
  const net = twoHosts();
  const clientQuic = createQuic(net.client);
  const serverQuic = createQuic(net.server);
  net.client.addTable(clientQuic.table);
  const got: { side: string; stream: number; bytes: number; marks: unknown[]; at: number }[] = [];
  const record = (side: string): NonNullable<QuicOptions['onData']> => (ctx, _, stream, bytes, marks) => got.push({ side, stream, bytes, marks, at: ctx.now });
  let conn: QuicConn | undefined;
  serverQuic.listen(PORT, {
    onData: record('server'),
    onConnection: (ctx: Ctx, accepted: QuicConn) => serverWrites.forEach(([stream, bytes, mark]) => serverQuic.send(ctx, accepted, stream, bytes, mark)),
    ...serverOptions,
  });
  const run = simulate({
    devices: net.devices,
    links: net.links,
    faults: faults?.({ client: net.client.mac, server: net.server.mac }) ?? [],
    maxEvents: 20000,
    commands: [{ at: 0, device: 'client', run: (_, ctx) => {
      conn = clientQuic.connect(ctx, net.server.address(), PORT, { onData: record('client'), ...clientOptions });
      writes.forEach(([stream, bytes, mark]) => clientQuic.send(ctx, conn!, stream, bytes, mark));
    } }],
  });
  return { run, got, conn: conn!, clientQuic, serverQuic, actions: run.events.map(({ action }) => action) };
}

const isData = (mac: string) => (frame: Frame) => frame.srcMac === mac && (quicOf(frame)?.frames.length ?? 0) > 0;
const dropData = (side: 'client' | 'server', ...nths: number[]) => (macs: { client: string; server: string }): Fault[] => nths.map((nth) => ({ kind: 'dropPacket', nth, matches: isData(macs[side]) }));

describe('QUIC', () => {
  it('sends a first connection\'s data after one round trip', () => {
    const { run, got } = connect({ writes: [[0, 400, 'request']] });
    const [first] = dataFrom(run, 'client');
    expect(first!.time).toBe(20);
    expect(got.find(({ side }) => side === 'server')!.marks).toEqual(['request']);
  });

  it('puts a returning client\'s data in the first flight', () => {
    const { run, actions } = connect({ writes: [[0, 400, 'request']], client: { returning: true } });
    const [first] = dataFrom(run, 'client');
    expect(first!.time).toBe(0);
    expect(actions).toContain('quic-0rtt');
    expect(quicOf(first!.frame)!.space).toBe('0rtt');
  });

  it('runs the handshake as 1200, 3000 and 100 bytes', () => {
    const { run } = connect({});
    const sizes = run.events.filter(({ action }) => action === 'quic-initial' || action === 'quic-handshake').map(({ frame }) => (frame!.payload as { length: number }).length - 28);
    expect(sizes).toEqual([1200, 3000, 100]);
  });

  it('carries data in 1040-byte packets on the wire', () => {
    const { run } = connect({ writes: [[0, 2500]] });
    expect(dataFrom(run, 'client').map(({ frame }) => (frame!.payload as { length: number }).length)).toEqual([1040, 1040, 540]);
  });

  it('gives a resent range a new packet number', () => {
    const { run } = connect({ writes: [[0, 1000]], faults: dropData('client', 1) });
    const [lost, resent] = dataFrom(run, 'client').map(({ frame }) => quicOf(frame)!);
    expect(resent!.number).toBeGreaterThan(lost!.number);
    expect(resent!.frames[0]).toMatchObject({ stream: 0, offset: 0, length: 1000 });
  });

  it('calls a packet lost once 3 later ones are acknowledged', () => {
    const { actions } = connect({ writes: [[0, 8000]], faults: dropData('client', 2) });
    expect(actions).toContain('quic-lost');
    expect(actions).not.toContain('quic-timeout');
  });

  it('needs the timer for the last packet', () => {
    const { actions, got } = connect({ writes: [[0, 1000]], faults: dropData('client', 1) });
    expect(actions).toContain('quic-timeout');
    expect(got.filter(({ side }) => side === 'server').reduce((sum, { bytes }) => sum + bytes, 0)).toBe(1000);
  });

  it('holds a gap on one stream while the others deliver', () => {
    const snapshots: number[][] = [];
    const got: number[] = [];
    let conn: QuicConn | undefined;
    const { run } = connect({
      writes: [[0, 8000], [4, 8000], [8, 8000]],
      server: {
        onConnection: (_, accepted) => { conn = accepted; },
        onData: (_, __, stream) => { got.push(stream); snapshots.push(conn!.gaps); },
      },
      faults: dropData('client', 2),
    });
    expect(run.cut).toBe(false);
    expect(snapshots.some((gaps) => gaps.length === 1 && gaps[0] === 4)).toBe(true);
    expect(got.filter((_, i) => snapshots[i]!.includes(4) && got[i] !== 4).length).toBeGreaterThan(0);
  });

  it('lists ACK ranges around a gap', () => {
    const { run } = connect({ writes: [[0, 8000]], faults: dropData('client', 2) });
    const ranges = run.events.filter(({ device }) => device === 'server').flatMap(({ frame }) => quicOf(frame)?.acks ?? []);
    const split = run.events.filter(({ device }) => device === 'server').map(({ frame }) => quicOf(frame)?.acks ?? []).find((acks) => acks.length > 1);
    expect(split).toBeDefined();
    expect(split![0]![1]).toBeLessThan(split![1]![0] - 1);
    expect(ranges.length).toBeGreaterThan(0);
  });

  it('halves cwnd on a loss through Reno', () => {
    const { run } = connect({ writes: [[0, 40000]], faults: dropData('client', 8) });
    const row = (event: SimEvent) => event.tables.client![4]!.rows[0]!.map(Number);
    const lost = run.events.find(({ action }) => action === 'quic-lost')!;
    const [, , cwnd, ssthresh] = row(lost);
    expect(ssthresh).toBeLessThan(64000);
    expect(cwnd).toBe(ssthresh! + 3000);
    const [, , after, sameThreshold] = row(run.events.at(-1)!);
    expect(sameThreshold).toBe(ssthresh);
    expect(after).toBeGreaterThanOrEqual(ssthresh!);
  });

  it('gives up after 5 retries', () => {
    const { actions, conn } = connect({ writes: [[0, 1000]], faults: dropData('client', 1, 2, 3, 4, 5, 6, 7) });
    expect(actions.filter((action) => action === 'quic-timeout')).toHaveLength(5);
    expect(actions).toContain('quic-abort');
    expect(conn.state).toBe('CLOSED');
  });

  it('delivers each stream whole, once and in order under seeded loss, or aborts', () => {
    const SIZES: [number, number][] = [[0, 5200], [4, 3100], [8, 4400]];
    const isQuic = (frame: Frame) => quicOf(frame) !== undefined;
    for (let seed = 1; seed <= 50; seed++) {
      const random = rng(seed);
      const nths = Array.from({ length: 400 }, (_, i) => i + 1).filter(() => random() < 0.2);
      const marked = SIZES.map(([stream, bytes]): [number, number, string] => [stream, bytes, `end-${stream}`]);
      const { got, run, actions } = connect({ writes: marked, serverWrites: marked, faults: () => nths.map((nth) => ({ kind: 'dropPacket', nth, matches: isQuic })) });
      expect(run.cut, `seed ${seed}`).toBe(false);
      const aborted = actions.includes('quic-abort');
      for (const [side, sender] of [['server', 'client'], ['client', 'server']] as const) {
        for (const [stream, size] of SIZES) {
          const parts = got.filter((each) => each.side === side && each.stream === stream);
          const total = parts.reduce((sum, { bytes }) => sum + bytes, 0);
          // Counted from what crossed the wire, so bytes QUIC only claims to have can't pass.
          const arrived = new Set(run.events.filter((event) => event.device === sender && event.hops.some((hop) => !hop.lost)).flatMap(({ frame }) => (quicOf(frame)?.frames ?? []).filter((each) => each.stream === stream).flatMap(({ offset, length }) => Array.from({ length }, (_, i) => offset + i))));
          expect(total, `seed ${seed}`).toBeLessThanOrEqual(arrived.size);
          expect(parts.flatMap(({ marks }) => marks).length, `seed ${seed}`).toBeLessThanOrEqual(1);
          if (!aborted) {
            expect(total, `seed ${seed} ${side} ${stream}`).toBe(size);
            expect(parts.flatMap(({ marks }) => marks), `seed ${seed}`).toEqual([`end-${stream}`]);
          }
        }
      }
    }
  });
});
