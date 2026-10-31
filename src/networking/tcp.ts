import { formatIp } from './address';
import type { Tcp } from './packet';
import { formatTime, type Ctx, type Note, type TableSnapshot } from './sim';

export const CLIENT_ISN = 1000;
export const SERVER_ISN = 5000;
export const TIME_WAIT_MS = 2000;
const FIRST_CLIENT_PORT = 49152;
const DEFAULT_BUFFER = 64000;
const CONNECTIONS_TABLE = 2;

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
  rcvNxt: number;
  /** close() was called; it takes effect once the connection is up. */
  closing: boolean;
}

export function createTcp(host: TcpHost) {
  const listeners = new Map<number, TcpOptions>();
  const conns: Socket[] = [];
  let nextPort = FIRST_CLIENT_PORT;

  const noteFor = (conn: Socket, action: string, title: string, why: string): Note => ({ action, title, why, table: { index: CONNECTIONS_TABLE, row: conns.indexOf(conn) } });
  const free = (conn: Socket) => conn.options.bufferBytes ?? DEFAULT_BUFFER;

  function open(remote: number, localPort: number, remotePort: number, state: TcpState, iss: number, options: TcpOptions): Socket {
    const mss = host.mss();
    const conn: Socket = {
      id: `:${localPort} ↔ ${formatIp(remote)}:${remotePort}`,
      state,
      mss,
      cwnd: mss,
      ssthresh: 0,
      peerWindow: 0,
      rto: 0,
      remote,
      localPort,
      remotePort,
      options,
      iss,
      una: iss,
      nxt: iss + 1,
      dataEnd: iss + 1,
      rcvNxt: 0,
      closing: false,
      get inFlight() {
        return this.nxt - this.una;
      },
      get sent() {
        return Math.max(0, Math.min(this.nxt, this.dataEnd) - this.iss - 1);
      },
      get acked() {
        return Math.max(0, Math.min(this.una, this.dataEnd) - this.iss - 1);
      },
    };
    conns.push(conn);
    return conn;
  }

  function emit(ctx: Ctx, conn: Socket, fields: Pick<Tcp, 'seq' | 'flags'> & Partial<Tcp>, note: Note) {
    host.transmit(ctx, conn.remote, { kind: 'tcp', srcPort: conn.localPort, dstPort: conn.remotePort, ack: conn.rcvNxt, window: free(conn), length: 0, ...fields }, note);
  }

  const sendSyn = (ctx: Ctx, conn: Socket) =>
    emit(ctx, conn, { seq: conn.iss, flags: ['SYN'], ack: 0, mss: host.mss() }, noteFor(conn, 'tcp-syn', `SYN from port ${conn.localPort}, seq ${conn.iss}`, `The client picks a starting sequence number and offers an MSS of ${host.mss()} bytes.`));

  const sendSynAck = (ctx: Ctx, conn: Socket) =>
    emit(ctx, conn, { seq: conn.iss, flags: ['SYN', 'ACK'], mss: host.mss() }, noteFor(conn, 'tcp-syn-ack', `SYN ACK, seq ${conn.iss}, ack ${conn.rcvNxt}`, `The ACK says "next I expect byte ${conn.rcvNxt}". The SYN sends the server's own starting number, and an MSS of ${host.mss()} bytes.`));

  function sendAck(ctx: Ctx, conn: Socket, note: Note) {
    emit(ctx, conn, { seq: conn.nxt, flags: ['ACK'] }, note);
  }

  /** The FIN follows the last byte written. */
  function pump(ctx: Ctx, conn: Socket) {
    const closed = conn.state === 'FIN_WAIT_1' || conn.state === 'LAST_ACK';
    if (!closed || conn.nxt !== conn.dataEnd) return;
    const seq = conn.nxt;
    conn.nxt++;
    emit(ctx, conn, { seq, flags: ['FIN', 'ACK'] }, noteFor(conn, 'tcp-fin', `FIN, seq ${seq}`, 'This side has nothing more to send. A FIN takes up one sequence number, so it can be acknowledged like data.'));
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
    conn.cwnd = conn.mss;
  }

  function finish(ctx: Ctx, conn: Socket, title: string, why: string) {
    conn.state = 'CLOSED';
    ctx.note(noteFor(conn, 'tcp-closed', title, why));
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
    sendSynAck(ctx, conn);
  }

  function onAck(ctx: Ctx, conn: Socket, segment: Tcp) {
    conn.peerWindow = segment.window;
    if (segment.ack <= conn.una) return;
    conn.una = segment.ack;
    const finAcked = conn.una === conn.dataEnd + 1;
    if (conn.state === 'SYN_RCVD') {
      establish(conn, undefined);
      ctx.note(noteFor(conn, 'tcp-established', 'The server is connected', 'The ACK proves the client heard the SYN ACK, so both directions work.'));
      applyClose(ctx, conn);
    } else if (conn.state === 'FIN_WAIT_1' && finAcked) {
      conn.state = 'FIN_WAIT_2';
      ctx.note(noteFor(conn, 'tcp-fin-acked', 'The FIN was acknowledged', 'This direction is done. The other side may still send, so this side waits for its FIN.'));
    } else if (conn.state === 'LAST_ACK' && finAcked) {
      finish(ctx, conn, 'The connection is closed', 'The last ACK arrived, so nothing more is expected and this side forgets the connection.');
    }
  }

  function onFin(ctx: Ctx, conn: Socket) {
    conn.rcvNxt++;
    if (conn.state === 'ESTABLISHED') {
      conn.state = 'CLOSE_WAIT';
      sendAck(ctx, conn, noteFor(conn, 'tcp-ack', `ACK ${conn.rcvNxt} for the FIN`, 'The other side has finished sending. Its program sees the end of the stream and closes too.'));
      conn.closing = true;
      applyClose(ctx, conn);
      return;
    }
    if (conn.state !== 'FIN_WAIT_2') return;
    conn.state = 'TIME_WAIT';
    sendAck(ctx, conn, noteFor(conn, 'time-wait', `ACK ${conn.rcvNxt}, then TIME_WAIT for ${formatTime(TIME_WAIT_MS)}`, 'This ACK could be lost, and only this side can answer a repeated FIN. So the side that closed first waits, and keeps the connection in mind.'));
    ctx.after(TIME_WAIT_MS, () => finish(ctx, conn, 'TIME_WAIT is over', `After ${formatTime(TIME_WAIT_MS)} no repeated FIN can still arrive, so the connection is forgotten.`));
  }

  function connected(ctx: Ctx, conn: Socket, segment: Tcp) {
    conn.una = segment.ack;
    conn.rcvNxt = segment.seq + 1;
    conn.peerWindow = segment.window;
    establish(conn, segment.mss);
    sendAck(ctx, conn, noteFor(conn, 'tcp-established', `ACK ${conn.rcvNxt}: the client is connected`, 'The server\'s SYN is acknowledged, so the client has heard both directions work. It can send data from here on.'));
    applyClose(ctx, conn);
  }

  return {
    listen(port: number, options: TcpOptions = {}) {
      listeners.set(port, options);
    },
    connect(ctx: Ctx, dst: number, port: number, options: TcpOptions = {}): Conn {
      const conn = open(dst, nextPort++, port, 'SYN_SENT', CLIENT_ISN, options);
      sendSyn(ctx, conn);
      return conn;
    },
    write(_ctx: Ctx, conn: Conn, bytes: number) {
      (conn as Socket).dataEnd += bytes;
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
        ctx.note(noteFor(conn, 'tcp-rst', `RST from ${formatIp(src)}`, 'The other side has no such connection, so this one ends at once.'));
        return;
      }
      if (conn.state === 'SYN_SENT') {
        if (flags.includes('SYN') && flags.includes('ACK')) connected(ctx, conn, segment);
        return;
      }
      if (flags.includes('ACK')) onAck(ctx, conn, segment);
      if (flags.includes('FIN')) onFin(ctx, conn);
    },
    lowerMss(_ctx: Ctx, _dst: number, _mtu: number) {},
    connections: (): Conn[] => conns,
    table: (): TableSnapshot => ({
      title: 'Connections',
      columns: ['Connection', 'State', 'Sent', 'Acked', 'Window'],
      rows: conns.map((conn) => [conn.id, conn.state, String(conn.sent), String(conn.acked), String(free(conn))]),
    }),
  };
}
