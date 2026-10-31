import { formatIp } from './address';
import type { Tcp } from './packet';
import { renoDupAck, renoNewAck, renoTimeout, startReno } from './reno';
import { formatTime, type Ctx, type Note, type TableSnapshot } from './sim';

export const CLIENT_ISN = 1000;
export const SERVER_ISN = 5000;
export const TIME_WAIT_MS = 2000;
const FIRST_CLIENT_PORT = 49152;
const DEFAULT_BUFFER = 64000;
export const INITIAL_RTO_MS = 1000;
const MIN_RTO_MS = 200;
export const MAX_RETRIES = 5;
const READ_TICK_MS = 10;
/** A paused reader wakes here, so every run ends. */
const RESUME_AT_MS = 2000;
const RESUME_RATE = 200;
const CONNECTIONS_TABLE = 2;
const IP_TCP_HEADERS = 40;
const SENDING: TcpState[] = ['ESTABLISHED', 'CLOSE_WAIT', 'FIN_WAIT_1', 'LAST_ACK'];

export type TcpState = 'CLOSED' | 'LISTEN' | 'SYN_SENT' | 'SYN_RCVD' | 'ESTABLISHED' | 'FIN_WAIT_1' | 'FIN_WAIT_2' | 'CLOSE_WAIT' | 'LAST_ACK' | 'TIME_WAIT';

export interface TcpOptions {
  ssthreshMss?: number;
  /** In segments. Replaces `cwnd`, so congestion control can't hide what a lesson teaches. */
  fixedWindow?: number;
  bufferBytes?: number;
  /** Bytes per ms; 0 is paused. With none, the program reads everything at once. */
  readRate?: number;
  onData?: (bytes: number) => void;
}

export interface Conn {
  id: string;
  state: TcpState;
  mss: number;
  cwnd: number;
  ssthresh: number;
  inFlight: number;
  sent: number;
  acked: number;
  peerWindow: number;
  rto: number;
}

/** What a host lends its TCP: the network stays on the far side of this. */
export interface TcpHost {
  ip(): number;
  mss(): number;
  transmit(ctx: Ctx, dst: number, tcp: Tcp, note: Note): void;
}

interface Socket extends Conn {
  remote: number;
  localPort: number;
  remotePort: number;
  options: TcpOptions;
  iss: number;
  /** Oldest byte not yet acknowledged, next byte to send, and the end of what was written. */
  una: number;
  nxt: number;
  dataEnd: number;
  /** Highest `nxt` so far: a timeout winds `nxt` back. */
  max: number;
  rcvNxt: number;
  /** Byte ranges that arrived ahead of a gap. */
  held: [start: number, end: number][];
  /** Where the peer's FIN sits, if it arrived ahead of a gap. */
  peerFin?: number;
  /** close() was called; it takes effect once the connection is up. */
  closing: boolean;
  dupAcks: number;
  recovering: boolean;
  retries: number;
  /** The one segment being timed; retransmitting clears it (Karn). */
  timed?: { end: number; at: number };
  srtt?: number;
  rttvar: number;
  /** The latest round trip measured. */
  rtt: number;
  /** Bumped to cancel the running timer. */
  timer: number;
  timing: boolean;
  /** Bytes in order that the program hasn't read yet. */
  unread: number;
  reading: boolean;
  advertised: number;
}

export function createTcp(host: TcpHost) {
  const listeners = new Map<number, TcpOptions>();
  const conns: Socket[] = [];
  let nextPort = FIRST_CLIENT_PORT;

  const noteFor = (conn: Socket, action: string, title: string, why: string): Note => ({ action, title, why, table: { index: CONNECTIONS_TABLE, row: conns.indexOf(conn) } });
  const free = (conn: Socket) => (conn.options.bufferBytes ?? DEFAULT_BUFFER) - conn.unread;

  function open(remote: number, localPort: number, remotePort: number, state: TcpState, iss: number, options: TcpOptions): Socket {
    const mss = host.mss();
    const conn: Socket = {
      id: `:${localPort} ↔ ${formatIp(remote)}:${remotePort}`,
      state,
      mss,
      cwnd: mss,
      ssthresh: 0,
      peerWindow: 0,
      rto: INITIAL_RTO_MS,
      remote,
      localPort,
      remotePort,
      options,
      iss,
      una: iss,
      nxt: iss + 1,
      dataEnd: iss + 1,
      max: iss + 1,
      rcvNxt: 0,
      held: [],
      closing: false,
      dupAcks: 0,
      recovering: false,
      retries: 0,
      rttvar: 0,
      rtt: 0,
      timer: 0,
      timing: false,
      unread: 0,
      reading: false,
      advertised: 0,
      get inFlight() {
        return this.nxt - this.una;
      },
      get sent() {
        return Math.max(0, Math.min(this.max, this.dataEnd) - this.iss - 1);
      },
      get acked() {
        return Math.max(0, Math.min(this.una, this.dataEnd) - this.iss - 1);
      },
    };
    conns.push(conn);
    return conn;
  }

  function emit(ctx: Ctx, conn: Socket, fields: Pick<Tcp, 'seq' | 'flags'> & Partial<Tcp>, note: Note) {
    conn.advertised = free(conn);
    host.transmit(ctx, conn.remote, { kind: 'tcp', srcPort: conn.localPort, dstPort: conn.remotePort, ack: conn.rcvNxt, window: conn.advertised, length: 0, ...fields }, note);
  }

  function stopTimer(conn: Socket) {
    conn.timer++;
    conn.timing = false;
  }

  function startTimer(ctx: Ctx, conn: Socket) {
    const timer = ++conn.timer;
    conn.timing = true;
    ctx.after(conn.rto, () => {
      if (timer === conn.timer && conn.state !== 'CLOSED') expire(ctx, conn);
    });
  }

  const synNote = (conn: Socket) => noteFor(conn, 'tcp-syn', `SYN from port ${conn.localPort}, seq ${conn.iss}`, `The client picks a starting sequence number and offers an MSS of ${host.mss()} bytes.`);
  const synAckNote = (conn: Socket) => noteFor(conn, 'tcp-syn-ack', `SYN ACK, seq ${conn.iss}, ack ${conn.rcvNxt}`, `The ACK says "next I expect byte ${conn.rcvNxt}". The SYN sends the server's own starting number, and an MSS of ${host.mss()} bytes.`);
  const sendSyn = (ctx: Ctx, conn: Socket, note: Note) => emit(ctx, conn, { seq: conn.iss, flags: ['SYN'], ack: 0, mss: host.mss() }, note);
  const sendSynAck = (ctx: Ctx, conn: Socket, note: Note) => emit(ctx, conn, { seq: conn.iss, flags: ['SYN', 'ACK'], mss: host.mss() }, note);
  const sendAck = (ctx: Ctx, conn: Socket, note: Note) => emit(ctx, conn, { seq: conn.nxt, flags: ['ACK'] }, note);
  const sendFin = (ctx: Ctx, conn: Socket, note: Note) => emit(ctx, conn, { seq: conn.dataEnd, flags: ['FIN', 'ACK'] }, note);
  const finNote = (conn: Socket) => noteFor(conn, conn.state === 'LAST_ACK' ? 'tcp-last-fin' : 'tcp-fin', `FIN, seq ${conn.dataEnd}`, 'This side has nothing more to send. A FIN takes up one sequence number, so it can be acknowledged like data.');

  const sendLimit = (conn: Socket) => Math.min(conn.options.fixedWindow ? conn.options.fixedWindow * conn.mss : conn.cwnd, conn.peerWindow);

  /** Sends whatever the window allows, then the FIN after the last byte. */
  function pump(ctx: Ctx, conn: Socket) {
    if (!SENDING.includes(conn.state)) return;
    for (;;) {
      const whole = Math.min(conn.mss, conn.dataEnd - conn.nxt);
      const length = Math.min(whole, Math.floor(sendLimit(conn) - conn.inFlight));
      if (length <= 0 || (length < whole && conn.inFlight > 0)) break;
      const seq = conn.nxt;
      conn.nxt += length;
      if (seq >= conn.max && !conn.timed) conn.timed = { end: conn.nxt, at: ctx.now };
      conn.max = Math.max(conn.max, conn.nxt);
      emit(ctx, conn, { seq, flags: ['ACK'], length }, noteFor(conn, 'tcp-data', `${length} bytes, seq ${seq}`, `The sequence number counts bytes, so this segment's first byte is number ${seq}, and the next will be ${seq + length}.`));
    }
    if (conn.nxt === conn.dataEnd && (conn.state === 'FIN_WAIT_1' || conn.state === 'LAST_ACK')) {
      sendFin(ctx, conn, finNote(conn));
      conn.nxt++;
      conn.max = Math.max(conn.max, conn.nxt);
    }
    if (!conn.timing && (conn.inFlight > 0 || (conn.peerWindow === 0 && conn.nxt < conn.dataEnd))) startTimer(ctx, conn);
  }

  /** Sends the oldest unacknowledged thing again, whatever it is. */
  function resend(ctx: Ctx, conn: Socket, note: Note) {
    delete conn.timed;
    const seq = conn.una;
    const length = conn.state === 'SYN_SENT' || conn.state === 'SYN_RCVD' ? 0 : Math.min(conn.mss, conn.dataEnd - seq);
    conn.nxt = Math.max(conn.nxt, seq + Math.max(length, 1));
    if (conn.state === 'SYN_SENT') sendSyn(ctx, conn, note);
    else if (conn.state === 'SYN_RCVD') sendSynAck(ctx, conn, note);
    else if (length > 0) emit(ctx, conn, { seq, flags: ['ACK'], length }, note);
    else sendFin(ctx, conn, note);
  }

  function abort(ctx: Ctx, conn: Socket) {
    conn.state = 'CLOSED';
    stopTimer(conn);
    emit(ctx, conn, { seq: conn.nxt, flags: ['RST'] }, noteFor(conn, 'abort', `Giving up after ${MAX_RETRIES} retries`, 'Nothing has been acknowledged for too long, so TCP resets the connection and tells the program it failed.'));
  }

  function expire(ctx: Ctx, conn: Socket) {
    conn.timing = false;
    if (++conn.retries > MAX_RETRIES) return abort(ctx, conn);
    if (conn.inFlight === 0) {
      emit(ctx, conn, { seq: conn.nxt, flags: ['ACK'], length: 1 }, noteFor(conn, 'probe', 'A 1-byte probe', 'The window is 0, and a window update could be lost. So the sender asks again at each timeout, or the two sides could wait for each other forever.'));
      startTimer(ctx, conn);
      return;
    }
    const waited = conn.rto;
    renoTimeout(conn, conn.mss, conn.inFlight);
    conn.rto *= 2;
    conn.nxt = conn.una;
    resend(ctx, conn, noteFor(conn, 'timeout', `No ACK for byte ${conn.una} after ${formatTime(waited)}`, `The timer ran out, so the oldest unacknowledged segment goes again and the timer doubles to ${formatTime(conn.rto)}.`));
    startTimer(ctx, conn);
  }

  function applyClose(ctx: Ctx, conn: Socket) {
    if (!conn.closing) return;
    if (conn.state === 'ESTABLISHED') conn.state = 'FIN_WAIT_1';
    else if (conn.state === 'CLOSE_WAIT') conn.state = 'LAST_ACK';
    pump(ctx, conn);
  }

  function establish(conn: Socket, mss: number | undefined) {
    conn.state = 'ESTABLISHED';
    conn.mss = Math.min(conn.mss, mss ?? conn.mss);
    startReno(conn, conn.mss, conn.options.ssthreshMss);
    conn.rto = INITIAL_RTO_MS;
    conn.retries = 0;
    stopTimer(conn);
  }

  function finish(ctx: Ctx, conn: Socket, action: string, title: string, why: string) {
    conn.state = 'CLOSED';
    stopTimer(conn);
    ctx.note(noteFor(conn, action, title, why));
  }

  function refuse(ctx: Ctx, src: number, segment: Tcp) {
    const seq = segment.flags.includes('ACK') ? segment.ack : 0;
    const ack = segment.seq + segment.length + (segment.flags.includes('SYN') ? 1 : 0);
    host.transmit(ctx, src, { kind: 'tcp', srcPort: segment.dstPort, dstPort: segment.srcPort, seq, ack, flags: ['RST', 'ACK'], window: 0, length: 0 }, {
      action: 'tcp-rst',
      title: `RST: nothing is listening on port ${segment.dstPort}`,
      why: 'With no program on this port, and no connection it could belong to, TCP says so at once.',
    });
  }

  function accept(ctx: Ctx, src: number, segment: Tcp, options: TcpOptions) {
    const conn = open(src, segment.dstPort, segment.srcPort, 'SYN_RCVD', SERVER_ISN, options);
    conn.rcvNxt = segment.seq + 1;
    conn.mss = Math.min(conn.mss, segment.mss ?? conn.mss);
    conn.peerWindow = segment.window;
    sendSynAck(ctx, conn, synAckNote(conn));
    startTimer(ctx, conn);
  }

  function sampleRtt(conn: Socket, rtt: number) {
    conn.rtt = rtt;
    conn.rttvar = conn.srtt === undefined ? rtt / 2 : 0.75 * conn.rttvar + 0.25 * Math.abs(conn.srtt - rtt);
    conn.srtt = conn.srtt === undefined ? rtt : 0.875 * conn.srtt + 0.125 * rtt;
    conn.rto = Math.max(MIN_RTO_MS, Math.ceil(conn.srtt + 4 * conn.rttvar));
  }

  function onNewAck(ctx: Ctx, conn: Socket, segment: Tcp) {
    conn.una = segment.ack;
    conn.nxt = Math.max(conn.nxt, conn.una);
    conn.max = Math.max(conn.max, conn.una);
    conn.retries = 0;
    renoNewAck(conn, conn.mss);
    if (conn.timed && conn.una >= conn.timed.end) {
      sampleRtt(conn, ctx.now - conn.timed.at);
      delete conn.timed;
    }
    const finAcked = conn.una === conn.dataEnd + 1;
    if (conn.state === 'SYN_RCVD') {
      establish(conn, undefined);
      ctx.note(noteFor(conn, 'tcp-accepted', 'The server is connected', 'The ACK proves the client heard the SYN ACK, so both directions work.'));
      applyClose(ctx, conn);
    } else if (conn.state === 'FIN_WAIT_1' && finAcked) {
      conn.state = 'FIN_WAIT_2';
      ctx.note(noteFor(conn, 'tcp-fin-acked', 'The FIN was acknowledged', 'This direction is done. The other side may still send, so this side waits for its FIN.'));
    } else if (conn.state === 'LAST_ACK' && finAcked) {
      finish(ctx, conn, 'tcp-closed', 'The connection is closed', 'The last ACK arrived, so nothing more is expected and this side forgets the connection.');
    }
    if (conn.inFlight > 0) startTimer(ctx, conn);
    else stopTimer(conn);
  }

  function onDupAck(ctx: Ctx, conn: Socket) {
    if (!renoDupAck(conn, conn.mss, conn.inFlight)) return;
    resend(ctx, conn, noteFor(conn, 'fast-retransmit', `Third duplicate ACK for byte ${conn.una}: send it again now`, 'Three later segments arrived, so this one is probably lost, not late. There is no need to wait for the timer.'));
  }

  function onAck(ctx: Ctx, conn: Socket, segment: Tcp) {
    const duplicate = segment.ack === conn.una && segment.length === 0 && !segment.flags.includes('FIN') && segment.window === conn.peerWindow && conn.inFlight > 0;
    if (conn.peerWindow === 0 && segment.window > 0) stopTimer(conn);
    conn.peerWindow = segment.window;
    if (conn.inFlight === 0) conn.retries = 0;
    if (segment.ack > conn.una) onNewAck(ctx, conn, segment);
    else if (duplicate) onDupAck(ctx, conn);
    pump(ctx, conn);
  }

  function read(ctx: Ctx, conn: Socket) {
    conn.reading = false;
    const rate = conn.options.readRate || (ctx.now >= RESUME_AT_MS ? RESUME_RATE : 0);
    const bytes = Math.min(conn.unread, rate * READ_TICK_MS);
    conn.unread -= bytes;
    if (bytes > 0) conn.options.onData?.(bytes);
    if (conn.state === 'ESTABLISHED' && conn.advertised < conn.mss && free(conn) >= conn.mss) {
      sendAck(ctx, conn, noteFor(conn, 'window-update', `Window update: ${free(conn)} bytes free`, 'The program has read enough for at least one full segment, so the receiver tells the sender to carry on.'));
    }
    if (conn.unread > 0) startReading(ctx, conn);
  }

  function startReading(ctx: Ctx, conn: Socket) {
    if (conn.reading) return;
    conn.reading = true;
    ctx.after(READ_TICK_MS, () => read(ctx, conn));
  }

  /** Puts bytes in order, and hands over any held bytes the new ones connect to. */
  function deliver(ctx: Ctx, conn: Socket, end: number) {
    const start = conn.rcvNxt;
    conn.rcvNxt = end;
    for (;;) {
      const next = conn.held.find(([from]) => from <= conn.rcvNxt);
      if (!next) break;
      conn.held.splice(conn.held.indexOf(next), 1);
      conn.rcvNxt = Math.max(conn.rcvNxt, next[1]);
    }
    const bytes = conn.rcvNxt - start;
    if (conn.options.readRate === undefined) {
      conn.options.onData?.(bytes);
      return;
    }
    conn.unread += bytes;
    startReading(ctx, conn);
  }

  function onSegment(ctx: Ctx, conn: Socket, segment: Tcp) {
    const end = segment.seq + segment.length;
    if (segment.flags.includes('FIN')) conn.peerFin = end;
    const before = conn.rcvNxt;
    if (end <= conn.rcvNxt + free(conn)) {
      if (segment.seq > conn.rcvNxt) {
        if (segment.length > 0) {
          conn.held.push([segment.seq, end]);
          ctx.note(noteFor(conn, 'tcp-hold', `Bytes from ${segment.seq} came ahead of a gap`, `Byte ${conn.rcvNxt} is still missing. TCP keeps these bytes, but the program can't have them until the gap is filled.`));
        }
      } else if (end > conn.rcvNxt) {
        deliver(ctx, conn, end);
      }
    }
    if (conn.peerFin === conn.rcvNxt && onFin(ctx, conn)) return;
    if (free(conn) === 0) sendAck(ctx, conn, noteFor(conn, 'zero-window', `ACK ${conn.rcvNxt}, window 0`, 'The buffer is full, because the program has not read it yet. A window of 0 tells the sender to stop.'));
    else if (conn.rcvNxt > before) sendAck(ctx, conn, noteFor(conn, 'tcp-ack', `ACK ${conn.rcvNxt}, window ${free(conn)}`, `Every byte before ${conn.rcvNxt} has arrived, so one number acknowledges them all. The window is the room left in the buffer.`));
    else sendAck(ctx, conn, noteFor(conn, 'tcp-dup-ack', `ACK ${conn.rcvNxt} again`, `The receiver can only say the next byte it needs in order, and that is still ${conn.rcvNxt}.`));
  }

  /** Returns whether it answered. A FIN during FIN_WAIT_1 waits to be sent again. */
  function onFin(ctx: Ctx, conn: Socket) {
    if (conn.state !== 'ESTABLISHED' && conn.state !== 'FIN_WAIT_2') return false;
    delete conn.peerFin;
    conn.rcvNxt++;
    if (conn.state === 'ESTABLISHED') {
      conn.state = 'CLOSE_WAIT';
      sendAck(ctx, conn, noteFor(conn, 'tcp-ack', `ACK ${conn.rcvNxt} for the FIN`, 'The other side has finished sending. Its program sees the end of the stream and closes too.'));
      conn.closing = true;
      applyClose(ctx, conn);
      return true;
    }
    conn.state = 'TIME_WAIT';
    sendAck(ctx, conn, noteFor(conn, 'time-wait', `ACK ${conn.rcvNxt}, then TIME_WAIT for ${formatTime(TIME_WAIT_MS)}`, 'This ACK could be lost, and only this side can answer a repeated FIN. So the side that closed first waits, and keeps the connection in mind.'));
    ctx.after(TIME_WAIT_MS, () => {
      if (conn.state === 'TIME_WAIT') finish(ctx, conn, 'time-wait-over', 'TIME_WAIT is over', `After ${formatTime(TIME_WAIT_MS)} no repeated FIN can still arrive, so the connection is forgotten.`);
    });
    return true;
  }

  function connected(ctx: Ctx, conn: Socket, segment: Tcp) {
    conn.una = segment.ack;
    conn.rcvNxt = segment.seq + 1;
    conn.peerWindow = segment.window;
    establish(conn, segment.mss);
    sendAck(ctx, conn, noteFor(conn, 'tcp-established', `ACK ${conn.rcvNxt}: the client is connected`, 'The server\'s SYN is acknowledged, so the client has heard both directions work. It can send data from here on.'));
    applyClose(ctx, conn);
    pump(ctx, conn);
  }

  return {
    listen(port: number, options: TcpOptions = {}) {
      listeners.set(port, options);
    },
    connect(ctx: Ctx, dst: number, port: number, options: TcpOptions = {}): Conn {
      const conn = open(dst, nextPort++, port, 'SYN_SENT', CLIENT_ISN, options);
      sendSyn(ctx, conn, synNote(conn));
      startTimer(ctx, conn);
      return conn;
    },
    write(ctx: Ctx, conn: Conn, bytes: number) {
      const socket = conn as Socket;
      socket.dataEnd += bytes;
      pump(ctx, socket);
    },
    close(ctx: Ctx, conn: Conn) {
      const socket = conn as Socket;
      socket.closing = true;
      applyClose(ctx, socket);
    },
    receive(ctx: Ctx, src: number, segment: Tcp) {
      const conn = conns.find((each) => each.state !== 'CLOSED' && each.remote === src && each.localPort === segment.dstPort && each.remotePort === segment.srcPort);
      const { flags } = segment;
      if (!conn) {
        const options = listeners.get(segment.dstPort);
        if (options && flags.includes('SYN') && !flags.includes('ACK')) accept(ctx, src, segment, options);
        else if (!flags.includes('RST')) refuse(ctx, src, segment);
        return;
      }
      if (flags.includes('RST')) {
        conn.state = 'CLOSED';
        stopTimer(conn);
        ctx.note(noteFor(conn, 'tcp-rst', `RST from ${formatIp(src)}`, 'The other side ended the connection, or never had it, so this one stops at once.'));
        return;
      }
      if (conn.state === 'SYN_SENT') {
        if (flags.includes('SYN') && flags.includes('ACK')) connected(ctx, conn, segment);
        return;
      }
      if (flags.includes('SYN')) {
        if (conn.state === 'SYN_RCVD') sendSynAck(ctx, conn, synAckNote(conn));
        else sendAck(ctx, conn, noteFor(conn, 'tcp-dup-ack', `ACK ${conn.rcvNxt} again`, 'The other side sent its SYN again, so the earlier reply must have been lost.'));
        return;
      }
      if (flags.includes('ACK')) onAck(ctx, conn, segment);
      if (conn.state !== 'CLOSED' && (segment.length > 0 || flags.includes('FIN'))) onSegment(ctx, conn, segment);
    },
    lowerMss(ctx: Ctx, dst: number, mtu: number) {
      const mss = mtu - IP_TCP_HEADERS;
      for (const conn of conns.filter((each) => each.remote === dst && each.state !== 'CLOSED' && each.mss > mss)) {
        conn.mss = mss;
        conn.nxt = conn.una;
        delete conn.timed;
        ctx.note(noteFor(conn, 'mss-lowered', `MSS lowered to ${mss} bytes`, `A ${mtu}-byte packet is the most this path carries, and ${IP_TCP_HEADERS} of those bytes are headers. Anything unacknowledged goes again in smaller segments.`));
        pump(ctx, conn);
      }
    },
    connections: (): Conn[] => conns,
    table: (): TableSnapshot => ({
      title: 'Connections',
      columns: ['Connection', 'State', 'Sent', 'Acked', 'Window'],
      rows: conns.map((conn) => [conn.id, conn.state, String(conn.sent), String(conn.acked), String(free(conn))]),
    }),
    congestion: (): TableSnapshot => ({
      title: 'Congestion',
      columns: ['Connection', 'cwnd', 'ssthresh', 'In flight', 'RTT', 'RTO'],
      rows: conns.map((conn) => [conn.id, String(Math.floor(conn.cwnd)), String(conn.ssthresh), String(conn.inFlight), String(conn.rtt), formatTime(conn.rto)]),
    }),
  };
}
