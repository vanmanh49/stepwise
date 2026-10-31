import type { Host } from '../devices';
import { formatTime, type Ctx } from '../sim';
import type { Conn } from '../tcp';

export const PING_MS = 1000;
const MISSED_PONGS = 2;
const UPGRADE_BYTES = 300;
const SWITCHING_BYTES = 150;
const CONTROL_BYTES = 6;
// shortcut: the key and accept value are RFC 6455's own example, since nothing here is hashed; compute them if a lesson ever shows the hash.
const KEY = 'dGhlIHNhbXBsZSBub25jZQ==';
const ACCEPT = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';

interface WsMark {
  type: 'upgrade' | 'switching' | 'frame' | 'ping' | 'pong' | 'close';
  label: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface WebSocketEnd {
  send(ctx: Ctx, text: string, bytes: number): void;
  close(ctx: Ctx): void;
  received: string[];
}

interface Live extends WebSocketEnd {
  read(ctx: Ctx, mark: WsMark): void;
  pongs: number;
}

function createEnd(host: Host, conn: Conn, isServer: boolean): Live {
  const write = (ctx: Ctx, bytes: number, mark: WsMark) => host.write(ctx, conn, bytes, mark);
  let closing = false;
  const closeFrame = (ctx: Ctx, why: string) => {
    ctx.note({ action: 'ws-close', title: `${host.label} sends a close frame`, why });
    write(ctx, CONTROL_BYTES, { type: 'close', label: 'WS close' });
  };
  return {
    received: [],
    pongs: 0,
    send(ctx, text, bytes) {
      ctx.note({ action: 'ws-frame', title: `${host.label} sends "${text}"`, why: `One frame of ${bytes} bytes, with a few bytes of header. Either side can send at any moment, with no request first.` });
      write(ctx, bytes, { type: 'frame', label: `WS "${text}"`, text });
    },
    close(ctx) {
      closing = true;
      closeFrame(ctx, 'Either side can end the conversation. The other answers with its own close frame, so neither loses a message in flight.');
    },
    read(ctx, mark) {
      if (mark.type === 'frame') this.received.push(mark.text ?? '');
      if (mark.type === 'pong') this.pongs++;
      if (mark.type === 'ping') {
        ctx.note({ action: 'ws-pong', title: `${host.label} answers the ping`, why: 'A pong proves this side is still alive, which a quiet TCP connection can\'t.' });
        write(ctx, CONTROL_BYTES, { type: 'pong', label: 'WS pong' });
      }
      if (mark.type !== 'close') return;
      if (!closing) {
        closing = true;
        closeFrame(ctx, 'It heard a close frame, so it answers with one.');
      }
      if (isServer) host.close(ctx, conn);
    },
  };
}

export function wsServer(host: Host, port: number, onOpen: (ctx: Ctx, socket: WebSocketEnd) => void) {
  const ends = new Map<Conn, Live>();
  host.listen(port, {
    onData(_, marks, ctx, conn) {
      for (const mark of marks as WsMark[]) {
        if (mark.type !== 'upgrade') {
          ends.get(conn)?.read(ctx, mark);
          continue;
        }
        ctx.note({ action: 'ws-switching', title: '101 Switching Protocols', why: 'The server agrees, and proves it read the request by answering the key. From here on this connection carries frames, not HTTP.' });
        host.write(ctx, conn, SWITCHING_BYTES, { type: 'switching', label: '101 Switching Protocols', headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Accept': ACCEPT } } satisfies WsMark);
        const end = createEnd(host, conn, true);
        ends.set(conn, end);
        onOpen(ctx, end);
      }
    },
  });
}

/** Pings every second, and calls the peer dead after 2 pings in a row go unanswered. */
function heartbeat(ctx: Ctx, host: Host, conn: Conn, end: Live) {
  let pinged = 0;
  const tick = () => {
    if (conn.state !== 'ESTABLISHED') return;
    if (pinged - end.pongs >= MISSED_PONGS) {
      ctx.note({ action: 'ws-dead', title: `No pong after ${MISSED_PONGS} pings`, why: `${formatTime(MISSED_PONGS * PING_MS)} of silence means the peer is gone. TCP alone would have kept quiet, because nothing was being sent.` });
      host.close(ctx, conn);
      return;
    }
    pinged++;
    ctx.note({ action: 'ws-ping', title: `${host.label} sends a ping`, why: `Every ${formatTime(PING_MS)}, so a peer that died silently is noticed.` });
    host.write(ctx, conn, CONTROL_BYTES, { type: 'ping', label: 'WS ping' } satisfies WsMark);
    ctx.after(PING_MS, tick);
  };
  ctx.after(PING_MS, tick);
}

export function wsClient(ctx: Ctx, host: Host, server: number, port: number, onOpen: (ctx: Ctx, socket: WebSocketEnd) => void) {
  let end: Live | undefined;
  host.connect(ctx, server, port, {
    onConnection(at, conn) {
      at.note({ action: 'ws-upgrade', title: 'GET /chat with Upgrade: websocket', why: 'A WebSocket starts life as an ordinary HTTP request, so it passes through anything that understands HTTP.' });
      host.write(at, conn, UPGRADE_BYTES, { type: 'upgrade', label: 'GET /chat Upgrade', headers: { Host: 'www.example.com', Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': KEY, 'Sec-WebSocket-Version': '13' } } satisfies WsMark);
    },
    onData(_, marks, at, conn) {
      for (const mark of marks as WsMark[]) {
        if (mark.type === 'switching') {
          end = createEnd(host, conn, false);
          heartbeat(at, host, conn, end);
          onOpen(at, end);
        } else {
          end?.read(at, mark);
        }
      }
    },
  });
}
