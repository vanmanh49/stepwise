import { describe, expect, it } from 'vitest';
import type { Host } from '../devices';
import { fourHosts, SERVER_PORT, tcpPath } from '../scenarios/topology';
import { simulate, type Command, type Fault } from '../sim';
import { httpClient, httpServer, type HttpVersion, type Resource } from './http';

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
}

function fetchAll({ version = 'HTTP/1.1', tls = false, keepAlive = true, connections = 1, resources = RESOURCES, paths = resources.map(({ path }) => path), faults = [] }: Setup = {}) {
  const net = tcpPath();
  httpServer(net.server, { port: SERVER_PORT, resources, version, tls });
  const client = httpClient(net.client, { server: net.server.address(), port: SERVER_PORT, version, tls, keepAlive, connections });
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
    for (const [i, fetch] of fetches.entries()) {
      if (i > 0) expect(fetch.startedAt).toBeGreaterThanOrEqual(fetches[i - 1]!.doneAt!);
    }
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
