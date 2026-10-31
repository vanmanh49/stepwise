import { describe, expect, it } from 'vitest';
import type { Host } from '../devices';
import { fourHosts, SERVER_PORT, tcpPath } from '../scenarios/topology';
import { simulate, type Command, type Fault, type SimEvent, type SimResult } from '../sim';
import { dropResponse, httpClient, httpServer, type HttpMark, type HttpVersion, type Resource } from './http';

const RESOURCES: Resource[] = [
  { path: '/a.js', bytes: 3000 },
  { path: '/b.css', bytes: 3000 },
  { path: '/c.png', bytes: 3000 },
];

interface Setup {
  version?: HttpVersion;
  tls?: boolean;
  keepAlive?: boolean;
  connections?: number;
  resources?: Resource[];
  paths?: string[];
  faults?: Fault[];
  net?: ReturnType<typeof tcpPath>;
  returning?: boolean;
}

function fetchAll({ net = tcpPath(), version = 'HTTP/1.1', tls = false, keepAlive = true, connections = 1, resources = RESOURCES, paths = resources.map(({ path }) => path), faults = [], returning = false }: Setup = {}) {
  httpServer(net.server, { port: SERVER_PORT, resources, version, tls });
  const client = httpClient(net.client, { server: net.server.address(), port: SERVER_PORT, version, tls, keepAlive, connections, returning });
  const commands: Command[] = [{ at: 0, device: 'client', run: (_, ctx) => client.get(ctx, paths) }];
  const run = simulate({ devices: net.devices, links: net.links, commands, faults, maxEvents: 20000 });
  const actions = run.events.map(({ action }) => action);
  return { ...net, client: net.client, http: client, run, actions, fetches: client.fetches };
}

/** tcpPath's propagation: 1 ms and 20 ms each way, before any bytes take time to send. */
const RTT = 42;

describe('TLS', () => {
  it('runs hello, hello, finished, then the request', () => {
    const { actions } = fetchAll({ tls: true, paths: ['/a.js'] });
    const order = ['tls-client-hello', 'tls-server-hello', 'tls-finished', 'http-request', 'http-done'].map((action) => actions.indexOf(action));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect(order).toEqual(order.toSorted((a, b) => a - b));
  });

  it('costs one round trip more than no TLS', () => {
    const plain = fetchAll({ paths: ['/a.js'] });
    const secured = fetchAll({ tls: true, paths: ['/a.js'] });
    const extra = secured.fetches[0]!.firstByteAt! - plain.fetches[0]!.firstByteAt!;
    expect(extra).toBeGreaterThanOrEqual(RTT);
    expect(extra).toBeLessThan(2 * RTT);
  });
});

describe('HTTP/1.1', () => {
  it('fetches each resource whole', () => {
    const { fetches } = fetchAll();
    expect(fetches.map(({ path, status, bytes }) => [path, status, bytes])).toEqual(RESOURCES.map(({ path, bytes }) => [path, 200, bytes]));
  });

  it('opens one connection per resource without keep-alive', () => {
    const { http, fetches } = fetchAll({ keepAlive: false });
    expect(http.opened()).toBe(3);
    expect(fetches.every(({ doneAt }) => doneAt !== undefined)).toBe(true);
  });

  it('reuses one connection with keep-alive', () => {
    expect(fetchAll().http.opened()).toBe(1);
  });

  it('never overlaps requests on one connection', () => {
    const { fetches } = fetchAll();
    const overlaps = fetches.slice(1).filter((fetch, i) => fetch.startedAt < fetches[i]!.doneAt!);
    expect(overlaps).toEqual([]);
  });

  it('opens only what it needs out of 6 connections', () => {
    expect(fetchAll({ connections: 6 }).http.opened()).toBe(3);
    expect(fetchAll({ connections: 6, paths: ['/a.js'] }).http.opened()).toBe(1);
  });

  it('lets a slow response block everything behind it on 1 connection, and only itself on 6', () => {
    const delayed = RESOURCES.map((resource, i) => (i === 0 ? { ...resource, delayMs: 100 } : resource));
    const late = (connections: number, resources: Resource[]) => fetchAll({ connections, resources }).fetches[1]!.doneAt!;
    expect(late(1, delayed) - late(1, RESOURCES)).toBe(100);
    expect(late(6, delayed)).toBeLessThanOrEqual(late(6, RESOURCES));
  });

  it('answers 404 for an unknown path', () => {
    const { fetches } = fetchAll({ paths: ['/nope'] });
    expect(fetches[0]).toMatchObject({ status: 404, bytes: 0 });
    expect(fetches[0]!.doneAt).toBeDefined();
  });

  it('shows real headers on the request and response', () => {
    const { run } = fetchAll({ paths: ['/a.js'] });
    const marks = run.events.flatMap(({ frame }) => (frame?.payload.kind === 'ip' && frame.payload.payload.kind === 'tcp' ? frame.payload.payload.marks ?? [] : []));
    const headers = marks.flatMap(({ mark }) => Object.keys((mark as { headers?: Record<string, string> }).headers ?? {}));
    expect(headers).toEqual(expect.arrayContaining(['Host', 'User-Agent', 'Connection', 'Content-Type', 'Content-Length']));
  });

  it('lists each resource in the Streams table', () => {
    const { client } = fetchAll();
    const table = client.tables()[4]!;
    expect(table.columns).toEqual(['Stream', 'Path', 'Bytes', 'State']);
    expect(table.rows).toEqual(RESOURCES.map(({ path, bytes }) => ['–', path, String(bytes), 'done']));
  });
});

describe('HTTP/2', () => {
  const FOUR: Resource[] = ['/a.js', '/b.css', '/c.png', '/d.png'].map((path) => ({ path, bytes: 3000 }));
  const h2 = (setup: Setup = {}) => fetchAll({ version: 'HTTP/2', tls: true, resources: FOUR, ...setup });
  const responseMarks = (run: SimResult) => run.events.flatMap(({ device, frame }) => (device === 'server' && frame?.payload.kind === 'ip' && frame.payload.payload.kind === 'tcp' ? frame.payload.payload.marks ?? [] : [])).map(({ mark }) => mark as HttpMark).filter(({ type }) => type === 'head' || type === 'data');
  const rowsAt = (event: SimEvent) => event.tables.client![4]!.rows;

  it('shares one connection', () => {
    const { http, fetches } = h2();
    expect(http.opened()).toBe(1);
    expect(fetches.map(({ stream, status, bytes }) => [stream, status, bytes])).toEqual([[1, 200, 3000], [3, 200, 3000], [5, 200, 3000], [7, 200, 3000]]);
  });

  it('takes turns across streams, 1000 bytes a frame', () => {
    const data = responseMarks(h2().run).filter(({ type }) => type === 'data');
    expect(data.slice(0, 8).map(({ stream }) => stream)).toEqual([1, 3, 5, 7, 1, 3, 5, 7]);
    expect(data.every(({ bytes }) => bytes === 1000)).toBe(true);
  });

  it('shrinks headers as the table fills', () => {
    const { fetches } = h2();
    expect(fetches[1]!.headerBytes).toBeLessThan(fetches[0]!.headerBytes!);
  });

  it('charges 2 bytes for a repeated header', () => {
    expect(h2({ paths: ['/a.js', '/a.js'] }).fetches[1]!.headerBytes).toBe(6 * 2);
  });

  it('stalls every unfinished stream on one lost segment, then finishes them all', () => {
    const net = tcpPath();
    const { run, fetches } = h2({ net, faults: [dropResponse(net.server, 3)] });
    const holds = run.events.filter(({ action, device }) => action === 'tcp-hold' && device === 'client');
    expect(holds.length).toBeGreaterThan(0);
    for (const event of holds) {
      const unfinished = rowsAt(event).filter((row) => row[3] !== 'done');
      expect(unfinished.length).toBeGreaterThan(0);
      expect(unfinished.every((row) => row[3] === 'stalled')).toBe(true);
    }
    expect(fetches.map(({ bytes }) => bytes)).toEqual([3000, 3000, 3000, 3000]);
  });

  it('still finishes when the very last response segment is lost, through the timer', () => {
    const net = tcpPath();
    const { fetches, actions } = h2({ net, paths: ['/a.js'], faults: [dropResponse(net.server, 4)] });
    expect(actions).toContain('timeout');
    expect(fetches[0]!.bytes).toBe(3000);
  });

  it('counts the nth response packet the same on HTTP/1.1 and HTTP/2, skipping TLS and resends', () => {
    for (const version of ['HTTP/1.1', 'HTTP/2'] as const) {
      const net = tcpPath();
      const { run } = fetchAll({ net, version, tls: true, resources: FOUR, connections: 1, faults: [dropResponse(net.server, 3)] });
      const carrying = run.events.filter(({ device, frame }) => device === 'server' && frame?.payload.kind === 'ip' && frame.payload.payload.kind === 'tcp' && frame.payload.payload.length > 0);
      const responses = carrying.slice(3);
      expect(responses[2]!.hops[0]!.lost, version).toBe(true);
      expect(carrying.filter(({ hops }) => hops[0]!.lost)).toHaveLength(1);
    }
  });
});

describe('HTTP/3', () => {
  const FOUR: Resource[] = ['/a.js', '/b.css', '/c.png', '/d.png'].map((path) => ({ path, bytes: 3000 }));
  const h3 = (setup: Setup = {}) => fetchAll({ version: 'HTTP/3', resources: FOUR, ...setup });
  const h2 = (setup: Setup = {}) => fetchAll({ version: 'HTTP/2', tls: true, resources: FOUR, ...setup });
  const firstByte = (setup: ReturnType<typeof fetchAll>) => setup.fetches[0]!.firstByteAt!;

  it('fetches everything on one connection, on streams 0, 4, 8 and 12', () => {
    const { fetches, http } = h3();
    expect(http.opened()).toBe(1);
    expect(fetches.map(({ stream, status, bytes }) => [stream, status, bytes])).toEqual([[0, 200, 3000], [4, 200, 3000], [8, 200, 3000], [12, 200, 3000]]);
  });

  it('reaches the first byte about one round trip before HTTP/2 on TLS', () => {
    const gained = firstByte(h2()) - firstByte(h3());
    expect(gained).toBeGreaterThanOrEqual(RTT * 0.75);
    expect(gained).toBeLessThanOrEqual(RTT * 1.5);
  });

  it('reaches it a round trip sooner again on a return visit', () => {
    const gained = firstByte(h3()) - firstByte(h3({ returning: true }));
    expect(gained).toBeGreaterThanOrEqual(RTT * 0.75);
    expect(gained).toBeLessThanOrEqual(RTT * 1.5);
  });

  it('finishes the whole page in about the same time as HTTP/2 otherwise', () => {
    const lastDone = (run: ReturnType<typeof fetchAll>) => Math.max(...run.fetches.map(({ doneAt }) => doneAt!));
    const gained = lastDone(h2()) - lastDone(h3());
    expect(gained).toBeGreaterThan(0);
    expect(gained).toBeLessThanOrEqual(RTT * 2);
  });

  it('shares the header table with HTTP/2', () => {
    expect(h3({ paths: ['/a.js', '/a.js'] }).fetches[1]!.headerBytes).toBe(h2({ paths: ['/a.js', '/a.js'] }).fetches[1]!.headerBytes);
  });

  it('picks the same nth response packet as HTTP/2', () => {
    const net = tcpPath();
    const { run } = h3({ net, faults: [dropResponse(net.server, 3)] });
    const carrying = run.events.filter(({ device, frame }) => {
      const inner = device === 'server' && frame?.payload.kind === 'ip' ? frame.payload.payload : undefined;
      return inner?.kind === 'udp' && typeof inner.data === 'object' && 'proto' in inner.data && inner.data.proto === 'quic' && inner.data.frames.length > 0;
    });
    expect(carrying[2]!.hops[0]!.lost).toBe(true);
    expect(carrying.filter(({ hops }) => hops[0]!.lost)).toHaveLength(1);
  });

  it('stalls exactly one stream on the loss that stalls every HTTP/2 stream', () => {
    const stalled = (run: SimResult) => run.events.map((event) => event.tables.client![4]!.rows.filter((row) => row[3] === 'stalled').length);
    const quic = tcpPath();
    const three = h3({ net: quic, faults: [dropResponse(quic.server, 3)] });
    expect(Math.max(...stalled(three.run))).toBe(1);
    expect(three.fetches.map(({ bytes }) => bytes)).toEqual([3000, 3000, 3000, 3000]);
    const tcp = tcpPath();
    expect(Math.max(...stalled(h2({ net: tcp, faults: [dropResponse(tcp.server, 3)] }).run))).toBe(4);
  });
});

describe('a server with an origin behind it', () => {
  function viaEdge(times: number[], ttlS = 60) {
    const { hosts, devices, links } = fourHosts({ known: true });
    const [client, edge, origin] = hosts as [Host, Host, Host];
    httpServer(origin, { port: SERVER_PORT, resources: RESOURCES, version: 'HTTP/1.1' });
    httpServer(edge, { port: SERVER_PORT, resources: [], version: 'HTTP/1.1', edge: { origin: origin.address(), ttlS } });
    const http = httpClient(client, { server: edge.address(), port: SERVER_PORT, version: 'HTTP/1.1', connections: 1 });
    const commands: Command[] = times.map((at) => ({ at, device: client.id, run: (_, ctx) => http.get(ctx, ['/a.js']) }));
    const run = simulate({ devices, links, commands, maxEvents: 20000 });
    const originTraffic = (from: number) => run.events.filter(({ device, time, frame }) => device === 'C' && time >= from && frame !== undefined).length;
    return { run, fetches: http.fetches, originTraffic };
  }

  it('misses, fetches from the origin, and serves the client', () => {
    const { fetches, originTraffic, run } = viaEdge([0]);
    expect(fetches[0]).toMatchObject({ status: 200, bytes: 3000 });
    expect(fetches[0]!.headers?.['X-Cache']).toBe('MISS');
    expect(originTraffic(0)).toBeGreaterThan(0);
    expect(run.events.some(({ action }) => action === 'cache-miss')).toBe(true);
  });

  it('hits next time, with Age set and no origin traffic', () => {
    const { fetches, originTraffic, run } = viaEdge([0, 6000]);
    expect(fetches[1]!.headers).toMatchObject({ 'X-Cache': 'HIT', Age: '5' });
    expect(originTraffic(6000)).toBe(0);
    expect(run.events.filter(({ action }) => action === 'cache-hit')).toHaveLength(1);
  });

  it('asks the origin again once the copy is too old', () => {
    const { fetches, originTraffic } = viaEdge([0, 2000], 1);
    expect(fetches[1]!.headers?.['X-Cache']).toBe('MISS');
    expect(originTraffic(2000)).toBeGreaterThan(0);
  });
});
