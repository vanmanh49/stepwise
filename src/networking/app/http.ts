import type { Host } from '../devices';
import { formatTime, type Ctx, type TableSnapshot } from '../sim';
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
}

/** The label on the byte stream that tells HTTP where a message ends. */
export interface HttpMark {
  type: 'request' | 'head' | 'data';
  path: string;
  /** What a ladder row says. */
  label?: string;
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

export interface HttpServerOptions {
  port: number;
  resources: Resource[];
  version: HttpVersion;
  tls?: boolean;
  /** Makes this a cache in front of an origin: a CDN edge. */
  edge?: { origin: number; ttlS: number };
}

export function httpServer(host: Host, { port, resources, version, tls, edge }: HttpServerOptions) {
  function respond(ctx: Ctx, conn: Conn, request: HttpMark, status: number, bytes: number, extra: Record<string, string> = {}) {
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

  function fromOrigin(ctx: Ctx, conn: Conn, request: HttpMark) {
    const { path } = request;
    const copy = cache.get(path);
    if (copy && ctx.now - copy.storedAt < edge!.ttlS * 1000) {
      const age = Math.floor((ctx.now - copy.storedAt) / 1000);
      ctx.note({ action: 'cache-hit', title: `Cache hit for ${path}`, why: `The edge stored this ${formatTime(ctx.now - copy.storedAt)} ago, so the origin isn't asked. Age tells the client how old the copy is.` });
      respond(ctx, conn, request, copy.status, copy.bytes, { Age: String(age), 'X-Cache': 'HIT' });
      return;
    }
    ctx.note({ action: 'cache-miss', title: `Cache miss for ${path}`, why: 'The edge has no fresh copy, so it fetches one from the origin and keeps it for the next visitor.' });
    const answers = waiting.get(path) ?? [];
    waiting.set(path, [...answers, (at, status, bytes) => respond(at, conn, request, status, bytes, { 'X-Cache': 'MISS' })]);
    if (answers.length === 0) origin!.get(ctx, [path]);
  }

  function onRequest(ctx: Ctx, conn: Conn, request: HttpMark) {
    if (edge) return fromOrigin(ctx, conn, request);
    const resource = resources.find(({ path }) => path === request.path);
    const answer = (at: Ctx) => respond(at, conn, request, resource ? 200 : 404, resource?.bytes ?? 0);
    if (resource?.delayMs) ctx.after(resource.delayMs, () => answer(ctx));
    else answer(ctx);
  }

  host.listen(port, {
    ...(tls ? { initialWindow: TLS_FLIGHT_SEGMENTS } : {}),
    onData(_, marks, ctx, conn) {
      for (const mark of marks) {
        if (tlsMark(mark)) tlsServer(ctx, host, conn, mark);
        else if ((mark as HttpMark).type === 'request') onRequest(ctx, conn, mark as HttpMark);
      }
    },
  });
  void version;
}

export interface HttpClientOptions {
  server: number;
  port: number;
  version: HttpVersion;
  tls?: boolean;
  keepAlive?: boolean;
  /** Most connections open at once, on HTTP/1.1. Six is what browsers use. */
  connections?: number;
  onDone?: (ctx: Ctx, fetch: Fetch) => void;
}

/** One HTTP/1.1 connection: at most one request at a time, and retired once closed. */
interface Slot {
  conn: Conn;
  current?: Fetch;
  live: boolean;
  tls?: (ctx: Ctx, mark: TlsMark) => void;
}

export function httpClient(host: Host, { server, port, tls, keepAlive = true, connections = 1, onDone }: HttpClientOptions) {
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

  function onMark(ctx: Ctx, slot: Slot, mark: HttpMark) {
    const fetch = slot.current;
    if (!fetch) return;
    if (mark.type === 'head') {
      fetch.status = mark.status ?? 0;
      fetch.headers = mark.headers ?? {};
      fetch.firstByteAt = ctx.now;
      ctx.note({ action: 'http-first-byte', title: `First byte of ${fetch.path}: ${mark.label}`, why: `It came ${formatTime(ctx.now - fetch.startedAt)} after the request left.` });
    } else {
      fetch.bytes += mark.bytes ?? 0;
    }
    if (!mark.end) return;
    slot.current = undefined;
    if (!keepAlive) slot.live = false;
    finish(ctx, fetch);
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

  host.addTable((): TableSnapshot => ({
    title: 'Streams',
    columns: ['Stream', 'Path', 'Bytes', 'State'],
    rows: fetches.map((fetch) => [fetch.stream === undefined ? '–' : String(fetch.stream), fetch.path, String(fetch.bytes), stateOf(fetch)]),
  }));

  return {
    get(ctx: Ctx, paths: string[]) {
      for (const path of paths) {
        const fetch: Fetch = { path, startedAt: ctx.now, status: 0, bytes: 0 };
        fetches.push(fetch);
        queue.push(fetch);
      }
      dispatch(ctx);
    },
    fetches,
    opened: () => slots.length,
  };
}
