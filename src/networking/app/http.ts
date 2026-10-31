import type { Host } from '../devices';
import { createQuic, type QuicConn } from '../quic';
import { formatTime, type Ctx, type Fault, type TableSnapshot } from '../sim';
import type { Conn } from '../tcp';
import { tlsClient, TLS_FLIGHT_SEGMENTS, tlsMark, tlsServer, type TlsMark } from './tls';

export type HttpVersion = 'HTTP/1.1' | 'HTTP/2' | 'HTTP/3';

export interface Resource {
  path: string;
  bytes: number;
  /** How long the server thinks before it answers. */
  delayMs?: number;
}

export interface Fetch {
  path: string;
  startedAt: number;
  firstByteAt?: number;
  doneAt?: number;
  status: number;
  bytes: number;
  stream?: number;
  headers?: Record<string, string>;
  /** On HTTP/2 and HTTP/3: what the request's headers cost after compression. */
  headerBytes?: number;
}

/** The label on the byte stream that tells HTTP where a message ends. */
export interface HttpMark {
  type: 'request' | 'head' | 'data';
  path: string;
  /** What a ladder row says. */
  label?: string;
  stream?: number;
  headers?: Record<string, string>;
  status?: number;
  bytes?: number;
  /** The last byte of this response. */
  end?: boolean;
}

const REQUEST_BYTES = 400;
const HEAD_BYTES = 200;
const FRAME_BYTES = 1000;
const HOST_NAME = 'www.example.com';
const STATUS_TEXT: Record<number, string> = { 200: 'OK', 404: 'Not Found' };
const CONTENT_TYPES: Record<string, string> = { js: 'text/javascript', css: 'text/css', png: 'image/png', html: 'text/html' };

const contentType = (path: string) => CONTENT_TYPES[path.split('.').at(-1) ?? ''] ?? 'text/html';
const requestHeaders = (keepAlive: boolean) => ({ Host: HOST_NAME, 'User-Agent': 'stepwise', Accept: '*/*', Connection: keepAlive ? 'keep-alive' : 'close' });
const muxRequestHeaders = (path: string) => ({ ':method': 'GET', ':path': path, ':scheme': 'https', ':authority': HOST_NAME, 'user-agent': 'stepwise', accept: '*/*' });

const REPEATED_HEADER_BYTES = 2;
const HEADER_OVERHEAD = 2;

/** A small real header table: a field seen before on this connection costs 2 bytes. */
function headerBytes(table: Set<string>, headers: Record<string, string>) {
  let total = 0;
  for (const [name, value] of Object.entries(headers)) {
    const field = `${name}: ${value}`;
    total += table.has(field) ? REPEATED_HEADER_BYTES : field.length + HEADER_OVERHEAD;
    table.add(field);
  }
  return total;
}

/** A response waiting its turn: its headers, then DATA frames. */
interface Outgoing {
  head?: { bytes: number; mark: HttpMark };
  path: string;
  stream: number;
  left: number;
}

function nextFrame(out: Outgoing): [bytes: number, mark: HttpMark] {
  if (out.head) {
    const { bytes, mark } = out.head;
    delete out.head;
    return [bytes, mark];
  }
  const size = Math.min(out.left, FRAME_BYTES);
  out.left -= size;
  return [size, { type: 'data', path: out.path, stream: out.stream, label: `DATA ${out.stream}`, bytes: size, end: out.left === 0 }];
}

function headFor(table: Set<string>, request: HttpMark, status: number, bytes: number): Outgoing {
  const { path, stream = 0 } = request;
  const headers = { ':status': String(status), 'content-type': contentType(path), 'content-length': String(bytes) };
  const mark: HttpMark = { type: 'head', path, stream, label: `${status} ${STATUS_TEXT[status]}`, status, headers, end: bytes === 0 };
  return { head: { bytes: headerBytes(table, headers), mark }, path, stream, left: bytes };
}

/** One connection's streams on a server. */
interface Mux {
  streams: Outgoing[];
  table: Set<string>;
  thinking: boolean;
  /** Bytes the transport can take now. QUIC takes all of it and shares packets out itself. */
  room(): number;
  write(ctx: Ctx, stream: number, bytes: number, mark: HttpMark): void;
}

type Reply = (ctx: Ctx, status: number, bytes: number, extra?: Record<string, string>) => void;

/** So requests sent together are scheduled together, though they arrive a few ms apart. */
const THINK_MS = 10;

/** The nth packet from the server carrying response data, counting first sends only and skipping TLS. */
export function dropResponse(server: Host, n: number): Fault {
  const seen = new Set<string>();
  const firstSend = (key: string) => !seen.has(key) && seen.add(key).size > 0;
  return {
    kind: 'dropPacket',
    nth: n,
    matches({ srcMac, payload }) {
      if (srcMac !== server.mac || payload.kind !== 'ip') return false;
      const inner = payload.payload;
      if (inner.kind === 'tcp') return (inner.marks ?? []).some(({ mark }) => !tlsMark(mark)) && firstSend(`${inner.seq}`);
      if (inner.kind !== 'udp' || typeof inner.data !== 'object' || !('proto' in inner.data) || inner.data.proto !== 'quic') return false;
      const [frame] = inner.data.frames;
      return frame !== undefined && firstSend(`${frame.stream}:${frame.offset}`);
    },
  };
}

export interface HttpServerOptions {
  port: number;
  resources: Resource[];
  version: HttpVersion;
  tls?: boolean;
  /** Makes this a cache in front of an origin: a CDN edge. */
  edge?: { origin: number; ttlS: number };
}

export function httpServer(host: Host, { port, resources, version, tls, edge }: HttpServerOptions) {
  const muxes = new Map<Conn | QuicConn, Mux>();

  function drain(ctx: Ctx, mux: Mux) {
    while (mux.streams.length > 0 && mux.room() > 0) {
      const out = mux.streams.shift()!;
      const [bytes, mark] = nextFrame(out);
      mux.write(ctx, out.stream, bytes, mark);
      if (out.head || out.left > 0) mux.streams.push(out);
    }
  }

  /** Writes only what the transport can send now, so a stream arriving later still gets its turn. */
  function respondMux(ctx: Ctx, mux: Mux, request: HttpMark, status: number, bytes: number) {
    mux.streams.push(headFor(mux.table, request, status, bytes));
    if (mux.thinking) return;
    mux.thinking = true;
    ctx.after(THINK_MS, () => {
      mux.thinking = false;
      drain(ctx, mux);
    });
  }

  function muxOn(conn: Conn | QuicConn, room: Mux['room'], write: Mux['write']) {
    const mux = muxes.get(conn) ?? { streams: [], table: new Set<string>(), thinking: false, room, write };
    muxes.set(conn, mux);
    return mux;
  }

  function respond(ctx: Ctx, conn: Conn, request: HttpMark, status: number, bytes: number, extra: Record<string, string> = {}) {
    if (version === 'HTTP/2') {
      const mux = muxOn(conn, () => conn.room, (at, _, size, mark) => host.write(at, conn, size, mark));
      return respondMux(ctx, mux, request, status, bytes);
    }
    const { path, headers } = request;
    const close = headers?.Connection === 'close';
    const label = `${status} ${STATUS_TEXT[status]}`;
    const head: HttpMark = { type: 'head', path, label, status, end: bytes === 0, headers: { 'Content-Type': contentType(path), 'Content-Length': String(bytes), Connection: close ? 'close' : 'keep-alive', ...extra } };
    host.write(ctx, conn, HEAD_BYTES, head);
    for (let left = bytes; left > 0; left -= FRAME_BYTES) {
      const size = Math.min(left, FRAME_BYTES);
      host.write(ctx, conn, size, { type: 'data', path, bytes: size, end: left === size } satisfies HttpMark);
    }
    if (!close) return;
    ctx.note({ action: 'http-close', title: 'The server closes the connection', why: 'The request said Connection: close, so this connection ends after one response, and the next request pays for a new handshake.' });
    host.close(ctx, conn);
  }

  const cache = new Map<string, { status: number; bytes: number; storedAt: number }>();
  const waiting = new Map<string, ((ctx: Ctx, status: number, bytes: number) => void)[]>();
  const origin = edge && httpClient(host, {
    server: edge.origin,
    port,
    version: 'HTTP/1.1',
    onDone(ctx, { path, status, bytes }) {
      cache.set(path, { status, bytes, storedAt: ctx.now });
      for (const answer of waiting.get(path) ?? []) answer(ctx, status, bytes);
      waiting.delete(path);
    },
  });
  if (edge) {
    host.addTable((): TableSnapshot => ({ title: 'Edge cache', columns: ['Path', 'Bytes', 'Stored'], rows: [...cache].map(([path, { bytes, storedAt }]) => [path, String(bytes), formatTime(storedAt)]) }));
  }

  function fromOrigin(ctx: Ctx, reply: Reply, request: HttpMark) {
    const { path } = request;
    const copy = cache.get(path);
    if (copy && ctx.now - copy.storedAt < edge!.ttlS * 1000) {
      const age = Math.floor((ctx.now - copy.storedAt) / 1000);
      ctx.note({ action: 'cache-hit', title: `Cache hit for ${path}`, why: `The edge stored this ${formatTime(ctx.now - copy.storedAt)} ago, so the origin isn't asked. Age tells the client how old the copy is.` });
      reply(ctx, copy.status, copy.bytes, { Age: String(age), 'X-Cache': 'HIT' });
      return;
    }
    ctx.note({ action: 'cache-miss', title: `Cache miss for ${path}`, why: 'The edge has no fresh copy, so it fetches one from the origin and keeps it for the next visitor.' });
    const answers = waiting.get(path) ?? [];
    waiting.set(path, [...answers, (at, status, bytes) => reply(at, status, bytes, { 'X-Cache': 'MISS' })]);
    if (answers.length === 0) origin!.get(ctx, [path]);
  }

  function onRequest(ctx: Ctx, reply: Reply, request: HttpMark) {
    if (edge) return fromOrigin(ctx, reply, request);
    const resource = resources.find(({ path }) => path === request.path);
    const answer = (at: Ctx) => reply(at, resource ? 200 : 404, resource?.bytes ?? 0);
    if (resource?.delayMs) ctx.after(resource.delayMs, () => answer(ctx));
    else answer(ctx);
  }

  if (version === 'HTTP/3') {
    const quic = createQuic(host);
    quic.listen(port, {
      onData(ctx, conn, _, __, marks) {
        const mux = muxOn(conn, () => Infinity, (at, stream, size, mark) => quic.send(at, conn, stream, size, mark));
        for (const mark of marks as HttpMark[]) onRequest(ctx, (at, status, bytes) => respondMux(at, mux, mark, status, bytes), mark);
      },
    });
    return;
  }

  host.listen(port, {
    ...(tls ? { initialWindow: TLS_FLIGHT_SEGMENTS } : {}),
    onAcked(ctx, conn) {
      const mux = muxes.get(conn);
      if (mux && !mux.thinking) drain(ctx, mux);
    },
    onData(_, marks, ctx, conn) {
      for (const mark of marks) {
        if (tlsMark(mark)) tlsServer(ctx, host, conn, mark);
        else if ((mark as HttpMark).type === 'request') onRequest(ctx, (at, status, bytes, extra) => respond(at, conn, mark as HttpMark, status, bytes, extra), mark as HttpMark);
      }
    },
  });
}

export interface HttpClientOptions {
  server: number;
  port: number;
  version: HttpVersion;
  tls?: boolean;
  keepAlive?: boolean;
  /** Most connections open at once, on HTTP/1.1. Six is what browsers use. */
  connections?: number;
  /** On HTTP/3: has a saved key, so its requests go in the first flight. */
  returning?: boolean;
  onDone?: (ctx: Ctx, fetch: Fetch) => void;
}

/** One HTTP/1.1 connection: at most one request at a time, and retired once closed. */
interface Slot {
  conn: Conn;
  current?: Fetch;
  live: boolean;
  tls?: (ctx: Ctx, mark: TlsMark) => void;
}

export function httpClient(host: Host, { server, port, version, tls, keepAlive = true, connections = 1, returning = false, onDone }: HttpClientOptions) {
  const fetches: Fetch[] = [];
  const queue: Fetch[] = [];
  const slots: Slot[] = [];
  const blocked = new Map<Fetch, () => boolean>();
  const retried = new Set<Fetch>();

  const live = () => slots.filter((slot) => slot.live);

  function stateOf(fetch: Fetch) {
    if (fetch.doneAt !== undefined) return 'done';
    const gap = blocked.get(fetch);
    if (!gap) return 'waiting';
    return gap() ? 'stalled' : 'sending';
  }

  function finish(ctx: Ctx, fetch: Fetch) {
    fetch.doneAt = ctx.now;
    ctx.note({ action: 'http-done', title: `${fetch.path} is complete`, why: `All ${fetch.bytes} bytes arrived, ${formatTime(ctx.now - fetch.startedAt)} after the request left.` });
    onDone?.(ctx, fetch);
  }

  function request(ctx: Ctx, slot: Slot) {
    const fetch = slot.current!;
    fetch.startedAt = ctx.now;
    ctx.note({ action: 'http-request', title: `GET ${fetch.path}`, why: `The request is ${REQUEST_BYTES} bytes of text. On HTTP/1.1 this connection can't carry another one until the whole response is back.` });
    host.write(ctx, slot.conn, REQUEST_BYTES, { type: 'request', path: fetch.path, label: `GET ${fetch.path}`, headers: requestHeaders(keepAlive) } satisfies HttpMark);
  }

  function dispatch(ctx: Ctx) {
    for (const slot of live()) {
      if (slot.current || queue.length === 0) continue;
      slot.current = queue.shift()!;
      blocked.set(slot.current, () => slot.conn.gap);
      request(ctx, slot);
    }
    while (queue.length > 0 && live().length < connections) open(ctx);
  }

  /** Returns true once the response is whole. */
  function receive(ctx: Ctx, fetch: Fetch, mark: HttpMark) {
    if (mark.type === 'head') {
      fetch.status = mark.status ?? 0;
      fetch.headers = mark.headers ?? {};
      fetch.firstByteAt = ctx.now;
      ctx.note({ action: 'http-first-byte', title: `First byte of ${fetch.path}: ${mark.label}`, why: `It came ${formatTime(ctx.now - fetch.startedAt)} after the request left.` });
    } else {
      fetch.bytes += mark.bytes ?? 0;
    }
    if (mark.end) finish(ctx, fetch);
    return mark.end === true;
  }

  function onMark(ctx: Ctx, slot: Slot, mark: HttpMark) {
    if (!slot.current || !receive(ctx, slot.current, mark)) return;
    slot.current = undefined;
    if (!keepAlive) slot.live = false;
    dispatch(ctx);
  }

  /** A connection that dies mid-response gets one retry, on a new connection. */
  function onClosed(ctx: Ctx, slot: Slot) {
    slot.live = false;
    const fetch = slot.current;
    slot.current = undefined;
    if (fetch && !retried.has(fetch)) {
      retried.add(fetch);
      blocked.delete(fetch);
      fetch.bytes = 0;
      queue.unshift(fetch);
      ctx.note({ action: 'http-retry', title: `The connection died, so ${fetch.path} is requested again`, why: 'The response never finished, and a GET is safe to repeat, so the client opens a new connection.' });
    } else if (fetch) {
      fetch.status = 0;
      fetch.doneAt = ctx.now;
      ctx.note({ action: 'http-failed', title: `${fetch.path} failed`, why: 'The retry died too, so the program is told the request failed.' });
    }
    dispatch(ctx);
  }

  function open(ctx: Ctx) {
    const fetch = queue.shift()!;
    const slot: Slot = {
      current: fetch,
      live: true,
      conn: host.connect(ctx, server, port, {
        onConnection(at, conn) {
          if (tls) slot.tls = tlsClient(at, host, conn, (later) => request(later, slot));
          else request(at, slot);
        },
        onData(_, marks, at) {
          for (const mark of marks) {
            if (tlsMark(mark)) slot.tls?.(at, mark);
            else onMark(at, slot, mark as HttpMark);
          }
        },
        onClosed: (at) => onClosed(at, slot),
      }),
    };
    slots.push(slot);
    blocked.set(fetch, () => slot.conn.gap);
  }

  const byStream = new Map<number, Fetch>();
  const muxTable = new Set<string>();
  const quic = version === 'HTTP/3' ? createQuic(host) : undefined;
  const streamStep = quic ? 4 : 2;
  let nextStream = quic ? 0 : 1;
  let muxConn: Conn | undefined;
  let quicConn: QuicConn | undefined;
  let muxReady = false;

  const muxWrite = (ctx: Ctx, stream: number, bytes: number, mark: HttpMark) => {
    if (quicConn) quic!.send(ctx, quicConn, stream, bytes, mark);
    else host.write(ctx, muxConn!, bytes, mark);
  };
  const muxGap = (stream: number) => (quicConn ? quicConn.gaps.includes(stream) : muxConn!.gap);

  function muxRequest(ctx: Ctx, fetch: Fetch) {
    const stream = nextStream;
    nextStream += streamStep;
    const headers = muxRequestHeaders(fetch.path);
    const bytes = headerBytes(muxTable, headers);
    Object.assign(fetch, { stream, startedAt: ctx.now, headerBytes: bytes });
    byStream.set(stream, fetch);
    blocked.set(fetch, () => muxGap(stream));
    ctx.note({ action: 'http-request', title: `GET ${fetch.path} on stream ${stream}`, why: `The headers cost ${bytes} bytes, because the table already holds what earlier requests sent. Streams share this one connection.` });
    muxWrite(ctx, stream, bytes, { type: 'request', path: fetch.path, stream, label: `GET ${fetch.path}`, headers });
  }

  function muxFlush(ctx: Ctx) {
    muxReady = true;
    for (const fetch of queue.splice(0)) muxRequest(ctx, fetch);
  }

  function muxClosed(ctx: Ctx) {
    for (const fetch of fetches.filter(({ doneAt }) => doneAt === undefined)) {
      fetch.status = 0;
      fetch.doneAt = ctx.now;
      ctx.note({ action: 'http-failed', title: `${fetch.path} failed`, why: 'Its streams all lived on one connection, and that connection died.' });
    }
  }

  function onMuxMark(ctx: Ctx, mark: HttpMark) {
    const fetch = byStream.get(mark.stream ?? 0);
    if (fetch) receive(ctx, fetch, mark);
  }

  function muxDispatch(ctx: Ctx) {
    if (muxReady) return muxFlush(ctx);
    if (quic) {
      quicConn ??= quic.connect(ctx, server, port, {
        returning,
        onConnection: muxFlush,
        onData(at, _, __, ___, marks) {
          for (const mark of marks) onMuxMark(at, mark as HttpMark);
        },
        onClosed: muxClosed,
      });
      if (returning) muxFlush(ctx);
      return;
    }
    let tlsDone: ((at: Ctx, mark: TlsMark) => void) | undefined;
    muxConn ??= host.connect(ctx, server, port, {
      onConnection(at, conn) {
        if (tls) tlsDone = tlsClient(at, host, conn, muxFlush);
        else muxFlush(at);
      },
      onData(_, marks, at) {
        for (const mark of marks) {
          if (tlsMark(mark)) tlsDone?.(at, mark);
          else onMuxMark(at, mark as HttpMark);
        }
      },
      onClosed: muxClosed,
    });
  }

  host.addTable((): TableSnapshot => ({
    title: 'Streams',
    columns: ['Stream', 'Path', 'Bytes', 'State'],
    rows: fetches.map((fetch) => [fetch.stream === undefined ? '–' : String(fetch.stream), fetch.path, String(fetch.bytes), stateOf(fetch)]),
  }));
  if (quic) host.addTable(quic.table);

  return {
    get(ctx: Ctx, paths: string[]) {
      for (const path of paths) {
        const fetch: Fetch = { path, startedAt: ctx.now, status: 0, bytes: 0 };
        fetches.push(fetch);
        queue.push(fetch);
      }
      if (version === 'HTTP/1.1') dispatch(ctx);
      else muxDispatch(ctx);
    },
    fetches,
    opened: () => (version === 'HTTP/1.1' ? slots.length : 1),
  };
}
