import { describe, expect, it } from 'vitest';
import { ipv4 } from './address';
import { createHost, type Host } from './devices';
import type { Frame, Tcp } from './packet';
import { macOf } from './scenarios/topology';
import { simulate, type Command, type Ctx, type Fault, type Link, type SimEvent, type SimResult } from './sim';

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
