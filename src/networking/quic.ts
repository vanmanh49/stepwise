import { formatIp } from './address';
import type { Host } from './devices';
import type { Mark, Quic, QuicFrame, Udp } from './packet';
import { INITIAL_RTO_MS, MAX_RETRIES, renoDupAck, renoLoss, renoNewAck, renoTimeout, sampleRtt, startReno, type Reno, type RttState } from './reno';
import { formatTime, type Ctx, type Note, type TableSnapshot } from './sim';

const MSS = 1000;
/** Headers inside the UDP datagram. With IP and UDP that makes 1040 on the wire, the same as a TCP segment. */
const HEADER_BYTES = 12;
export const HANDSHAKE_SIZES = { initial: 1200, server: 3000, finished: 100 };
/** The server's flight fits its first window, as it does on TCP with TLS. */
const SERVER_WINDOW_SEGMENTS = 3;
const LOSS_THRESHOLD = 3;
const FIRST_CLIENT_PORT = 49152;

export interface QuicOptions {
  /** Has a saved key from an earlier visit, so data can go in the first flight. */
  returning?: boolean;
  onData?: (ctx: Ctx, conn: QuicConn, stream: number, bytes: number, marks: unknown[]) => void;
  /** Once the handshake is done on a client; once a client appears on a server. */
  onConnection?: (ctx: Ctx, conn: QuicConn) => void;
  onClosed?: (ctx: Ctx, conn: QuicConn) => void;
}

export interface QuicConn {
  id: string;
  state: 'INITIAL' | 'HANDSHAKE' | 'ESTABLISHED' | 'CLOSED';
  cwnd: number;
  ssthresh: number;
  rto: number;
  /** Streams holding bytes behind a gap. Each waits alone. */
  gaps: number[];
}

/** What a packet carries, kept so a lost one can go again under a new number. */
interface Payload {
  space: Quic['space'];
  size: number;
  frames: QuicFrame[];
  /** Handshake flights go at once, whatever the window. */
  windowed: boolean;
  /** How many TCP segments this stands for, so a window grows alike on both. */
  segments: number;
}

interface Sent extends Payload {
  number: number;
  at: number;
}

interface Outgoing {
  written: number;
  sent: number;
  marks: Mark[];
}

interface Incoming {
  next: number;
  held: [start: number, end: number][];
  marks: Mark[];
}

interface Session extends QuicConn, Reno, RttState {
  remote: number;
  localPort: number;
  remotePort: number;
  options: QuicOptions;
  client: boolean;
  nextNumber: number;
  sentPackets: Map<number, Sent>;
  /** Everything of ours the peer has acknowledged. */
  ackedNumbers: Set<number>;
  /** What the peer sent us that needs acknowledging. */
  received: Set<number>;
  ackDue: boolean;
  lost: Payload[];
  out: Map<number, Outgoing>;
  in: Map<number, Incoming>;
  turn: number;
  /** The newest packet sent when recovery began; anything older can't start another cut. */
  recoveryEnd?: number;
  retries: number;
  timer: number;
  timing: boolean;
}

function ranges(numbers: Set<number>): Quic['acks'] {
  const list: Quic['acks'] = [];
  for (const number of [...numbers].toSorted((a, b) => a - b)) {
    const last = list.at(-1);
    if (last && last[1] === number - 1) last[1] = number;
    else list.push([number, number]);
  }
  return list;
}

const flight = (session: Session) => [...session.sentPackets.values()].reduce((sum, { windowed, size }) => sum + (windowed ? size : 0), 0);
const canSend = (session: Session) => session.state === 'ESTABLISHED' || session.state === 'HANDSHAKE' || (session.state === 'INITIAL' && session.options.returning === true);

export function createQuic(host: Host) {
  const sessions: Session[] = [];
  let nextPort = FIRST_CLIENT_PORT;

  function open(remote: number, localPort: number, remotePort: number, options: QuicOptions, client: boolean): Session {
    const session: Session = {
      id: `:${localPort} ↔ ${formatIp(remote)}:${remotePort}`,
      state: client ? 'INITIAL' : 'HANDSHAKE',
      cwnd: 0,
      ssthresh: 0,
      dupAcks: 0,
      recovering: false,
      rto: INITIAL_RTO_MS,
      rttvar: 0,
      rtt: 0,
      remote,
      localPort,
      remotePort,
      options,
      client,
      nextNumber: 1,
      sentPackets: new Map(),
      ackedNumbers: new Set(),
      received: new Set(),
      ackDue: false,
      lost: [],
      out: new Map(),
      in: new Map(),
      turn: 0,
      retries: 0,
      timer: 0,
      timing: false,
      get gaps() {
        return [...this.in].filter(([, stream]) => stream.held.length > 0).map(([id]) => id);
      },
    };
    startReno(session, MSS);
    if (!client) session.cwnd = SERVER_WINDOW_SEGMENTS * MSS;
    sessions.push(session);
    return session;
  }

  function stopTimer(session: Session) {
    session.timer++;
    session.timing = false;
  }

  function startTimer(ctx: Ctx, session: Session) {
    const timer = ++session.timer;
    session.timing = true;
    ctx.after(session.rto, () => {
      if (timer === session.timer && session.state !== 'CLOSED') expire(ctx, session);
    });
  }

  function emit(ctx: Ctx, session: Session, packet: Quic, size: number, note: Note) {
    session.ackDue = false;
    host.udp(ctx, session.remote, session.localPort, session.remotePort, packet, { size, note });
  }

  function transmit(ctx: Ctx, session: Session, payload: Payload, note: Note) {
    const number = session.nextNumber++;
    session.sentPackets.set(number, { ...payload, number, at: ctx.now });
    emit(ctx, session, { proto: 'quic', number, space: payload.space, frames: payload.frames, acks: ranges(session.received) }, payload.size, note);
    if (!session.timing) startTimer(ctx, session);
  }

  const sendAck = (ctx: Ctx, session: Session) => {
    const acks = ranges(session.received);
    emit(ctx, session, { proto: 'quic', number: session.nextNumber++, space: '1rtt', frames: [], acks }, HEADER_BYTES, {
      action: 'quic-ack',
      title: `ACK ${acks.map(([from, to]) => `${from}–${to}`).join(', ')}`,
      why: acks.length > 1 ? 'The ACK lists ranges, so a gap is plain to see. TCP can only say the next byte it needs.' : 'Every packet has its own number and every arrival is acknowledged at once.',
    });
  };

  function nextStream(session: Session) {
    const ids = [...session.out.keys()];
    for (let i = 0; i < ids.length; i++) {
      const at = (session.turn + i) % ids.length;
      const id = ids[at]!;
      const stream = session.out.get(id)!;
      if (stream.sent < stream.written) return { id, stream };
    }
    return undefined;
  }

  function nextFrame(session: Session): Payload | undefined {
    const pick = nextStream(session);
    if (!pick) return undefined;
    const { id, stream } = pick;
    const length = Math.min(MSS, stream.written - stream.sent);
    const offset = stream.sent;
    const marks = stream.marks.filter(({ end }) => end > offset && end <= offset + length);
    const frame: QuicFrame = { stream: id, offset, length, ...(marks.length > 0 ? { marks } : {}) };
    return { space: session.state === 'INITIAL' ? '0rtt' : '1rtt', size: length + HEADER_BYTES, frames: [frame], windowed: true, segments: 1 };
  }

  /** Lost packets first, then streams in turn, as far as the window allows. */
  function pump(ctx: Ctx, session: Session) {
    for (;;) {
      const resend = session.lost[0];
      const payload = resend ?? nextFrame(session);
      if (!payload) return;
      const open = !payload.windowed || (canSend(session) && (flight(session) === 0 || flight(session) + payload.size <= session.cwnd));
      if (!open) return;
      if (resend) {
        session.lost.shift();
        const [frame] = payload.frames;
        transmit(ctx, session, payload, {
          action: resend.windowed ? 'quic-data' : 'quic-handshake',
          title: frame ? `Packet ${session.nextNumber} resends stream ${frame.stream} at ${frame.offset}` : `Packet ${session.nextNumber} resends the ${payload.space} flight`,
          why: 'A resend always gets a new number, so its ACK can never be mistaken for the old packet\'s.',
        });
        continue;
      }
      const frame = payload.frames[0]!;
      const stream = session.out.get(frame.stream)!;
      stream.sent += frame.length;
      session.turn = [...session.out.keys()].indexOf(frame.stream) + 1;
      const early = payload.space === '0rtt';
      transmit(ctx, session, payload, {
        action: early ? 'quic-0rtt' : 'quic-data',
        title: `Packet ${session.nextNumber}: stream ${frame.stream}, ${frame.length} bytes at ${frame.offset}`,
        why: early ? 'This client has been here before and kept a key, so its data goes in the first flight, with no round trip first.' : 'Each frame names its stream and offset, so one stream\'s loss says nothing about the others.',
      });
    }
  }

  function close(ctx: Ctx, session: Session, note: Note) {
    session.state = 'CLOSED';
    stopTimer(session);
    ctx.note(note);
    session.options.onClosed?.(ctx, session);
  }

  function expire(ctx: Ctx, session: Session) {
    session.timing = false;
    if (++session.retries > MAX_RETRIES) {
      close(ctx, session, { action: 'quic-abort', title: `Giving up after ${MAX_RETRIES} retries`, why: 'Nothing has been acknowledged for too long, so QUIC ends the connection and tells the program it failed.' });
      return;
    }
    const waited = session.rto;
    renoTimeout(session, MSS, flight(session));
    delete session.recoveryEnd;
    session.rto *= 2;
    const unacked = [...session.sentPackets.values()].toSorted((a, b) => a.number - b.number);
    session.sentPackets.clear();
    session.lost.unshift(...unacked);
    ctx.note({ action: 'quic-timeout', title: `No ACK after ${formatTime(waited)}`, why: `With too few later packets to prove a loss, only the timer can. Everything unacknowledged goes again, and the timer doubles to ${formatTime(session.rto)}.` });
    pump(ctx, session);
    if (!session.timing && session.sentPackets.size > 0) startTimer(ctx, session);
  }

  function detectLoss(ctx: Ctx, session: Session) {
    const before = flight(session);
    for (const packet of [...session.sentPackets.values()]) {
      const later = [...session.ackedNumbers].filter((number) => number > packet.number).length;
      if (later < LOSS_THRESHOLD) continue;
      session.sentPackets.delete(packet.number);
      session.lost.push(packet);
      if (session.recoveryEnd === undefined) {
        renoLoss(session, MSS, before);
        session.recoveryEnd = session.nextNumber - 1;
      }
      ctx.note({ action: 'quic-lost', title: `Packet ${packet.number} is lost`, why: `${later} later packets were acknowledged, so this one isn't just late. Its contents go again under a new number.` });
    }
  }

  function onAcks(ctx: Ctx, session: Session, acks: Quic['acks']) {
    const newly = [...session.sentPackets.values()].filter(({ number }) => acks.some(([from, to]) => number >= from && number <= to));
    if (newly.length === 0) return;
    session.retries = 0;
    sampleRtt(session, ctx.now - newly.at(-1)!.at);
    for (const packet of newly) {
      session.sentPackets.delete(packet.number);
      session.ackedNumbers.add(packet.number);
      for (let i = 0; i < packet.segments; i++) {
        if (session.recoveryEnd !== undefined && packet.number <= session.recoveryEnd) {
          renoDupAck(session, MSS, flight(session));
        } else {
          delete session.recoveryEnd;
          renoNewAck(session, MSS);
        }
      }
    }
    detectLoss(ctx, session);
    stopTimer(session);
    if (session.sentPackets.size > 0) startTimer(ctx, session);
  }

  function deliver(ctx: Ctx, session: Session, { stream, offset, length, marks = [] }: QuicFrame) {
    const incoming = session.in.get(stream) ?? { next: 0, held: [], marks: [] };
    session.in.set(stream, incoming);
    const end = offset + length;
    for (const each of marks) {
      if (each.end > incoming.next && !incoming.marks.includes(each)) incoming.marks.push(each);
    }
    if (end <= incoming.next) return;
    if (offset > incoming.next) {
      incoming.held.push([offset, end]);
      ctx.note({ action: 'quic-hold', title: `Stream ${stream} waits for bytes at ${incoming.next}`, why: 'These bytes came ahead of a gap on this stream, so only this stream waits. Every other stream keeps delivering.' });
      return;
    }
    const start = incoming.next;
    incoming.next = end;
    for (;;) {
      const next = incoming.held.find(([from]) => from <= incoming.next);
      if (!next) break;
      incoming.held.splice(incoming.held.indexOf(next), 1);
      incoming.next = Math.max(incoming.next, next[1]);
    }
    const ready = incoming.marks.filter((each) => each.end <= incoming.next).toSorted((a, b) => a.end - b.end);
    incoming.marks = incoming.marks.filter((each) => each.end > incoming.next);
    session.options.onData?.(ctx, session, stream, incoming.next - start, ready.map(({ mark }) => mark));
  }

  function established(ctx: Ctx, session: Session) {
    session.state = 'ESTABLISHED';
    transmit(ctx, session, { space: 'handshake', size: HANDSHAKE_SIZES.finished, frames: [], windowed: false, segments: 0 }, {
      action: 'quic-handshake',
      title: 'Finished, and the connection is up',
      why: 'The transport and TLS handshake are one exchange here, so one round trip is enough. Requests can go in the same flight as this.',
    });
    session.options.onConnection?.(ctx, session);
  }

  function onPacket(ctx: Ctx, session: Session, packet: Quic) {
    onAcks(ctx, session, packet.acks);
    if (session.state === 'CLOSED') return;
    if (packet.frames.length > 0 || packet.space !== '1rtt') {
      session.received.add(packet.number);
      session.ackDue = true;
    }
    if (packet.space === 'handshake' && session.client && session.state === 'INITIAL') established(ctx, session);
    else if (packet.space === 'handshake' && !session.client) session.state = 'ESTABLISHED';
    for (const frame of packet.frames) deliver(ctx, session, frame);
    pump(ctx, session);
    if (session.ackDue) sendAck(ctx, session);
  }

  function accept(ctx: Ctx, src: number, udp: Udp, packet: Quic, options: QuicOptions) {
    const session = open(src, udp.dstPort, udp.srcPort, options, false);
    session.received.add(packet.number);
    transmit(ctx, session, { space: 'handshake', size: HANDSHAKE_SIZES.server, frames: [], windowed: false, segments: SERVER_WINDOW_SEGMENTS }, {
      action: 'quic-handshake',
      title: `Server handshake flight, ${HANDSHAKE_SIZES.server} bytes`,
      why: 'One flight carries the transport setup, the key share and the certificate. Nothing is really encrypted in this run.',
    });
    options.onConnection?.(ctx, session);
  }

  const quicIn = ({ data }: Udp) => (typeof data === 'object' && 'proto' in data && data.proto === 'quic' ? data : undefined);
  const find = (src: number, udp: Udp) => sessions.find((each) => each.remote === src && each.localPort === udp.dstPort && each.remotePort === udp.srcPort);

  function receive(ctx: Ctx, src: number, udp: Udp, options?: QuicOptions) {
    const packet = quicIn(udp);
    if (!packet) return;
    const session = find(src, udp);
    if (session) onPacket(ctx, session, packet);
    else if (options && packet.space === 'initial') accept(ctx, src, udp, packet, options);
  }

  return {
    listen(port: number, options: QuicOptions = {}) {
      host.bindUdp(port, 'QUIC', (ctx, src, udp) => receive(ctx, src, udp, options));
    },
    connect(ctx: Ctx, dst: number, port: number, options: QuicOptions = {}): QuicConn {
      const localPort = nextPort++;
      host.bindUdp(localPort, 'QUIC', (at, src, udp) => receive(at, src, udp));
      const session = open(dst, localPort, port, options, true);
      transmit(ctx, session, { space: 'initial', size: HANDSHAKE_SIZES.initial, frames: [], windowed: false, segments: 1 }, {
        action: 'quic-initial',
        title: `Initial, ${HANDSHAKE_SIZES.initial} bytes`,
        why: 'The first packet opens the connection and starts TLS at once: there is no separate transport handshake. QUIC runs on UDP, so routers just see datagrams.',
      });
      return session;
    },
    send(ctx: Ctx, conn: QuicConn, stream: number, bytes: number, mark?: unknown) {
      const session = conn as Session;
      const outgoing = session.out.get(stream) ?? { written: 0, sent: 0, marks: [] };
      session.out.set(stream, outgoing);
      outgoing.written += bytes;
      if (mark !== undefined) outgoing.marks.push({ end: outgoing.written, mark });
      pump(ctx, session);
    },
    connections: (): QuicConn[] => sessions,
    table: (): TableSnapshot => ({
      title: 'QUIC',
      columns: ['Connection', 'State', 'cwnd', 'ssthresh', 'In flight', 'RTT', 'RTO'],
      rows: sessions.map((each) => [each.id, each.state, String(Math.floor(each.cwnd)), String(each.ssthresh), String(flight(each)), String(each.rtt), formatTime(each.rto)]),
    }),
  };
}
