import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { dropResponse, httpClient, httpServer, type HttpVersion, type Resource } from '../app/http';
import { simulate, type SimEvent, type SimResult } from '../sim';
import { EMPTY, endWith, streamGrid, traceSteps } from '../steps';
import { HIDE } from './http-1-1';
import { SERVER_PORT, webPath } from './topology';

export const http2Code = `// the client
open one connection, then TLS
for each resource:
  stream = next odd number
  send HEADERS, compressed by the table

// the server
for each stream, in turn:
  send its HEADERS, then one DATA frame of 1000 bytes

// TCP underneath sees one stream of bytes
if a segment is lost: hold everything after it`;

export const LOST = ['None', ...Array.from({ length: 8 }, (_, i) => `Segment ${i + 1}`)];

const LINES = {
  'tcp-syn': 'open one connection, then TLS',
  'tls-client-hello': 'open one connection, then TLS',
  'http-request': 'send HEADERS, compressed by the table',
  'http-first-byte': 'send its HEADERS, then one DATA frame of 1000 bytes',
  'http-done': 'for each stream, in turn:',
  'tcp-hold': 'if a segment is lost: hold everything after it',
};

const TITLE = "Can't fetch this page";
const RESOURCE_BYTES = 8000;
const STREAMS_TABLE = 4;

export interface MuxOptions {
  resources: number;
  /** Which response packet to lose; 0 for none. */
  lost: number;
  returning?: boolean;
}

/** One page over one connection. `lost` is the same nth packet on HTTP/2 and HTTP/3, so the two compare fairly. */
export function runMux(version: HttpVersion, { resources, lost, returning = false }: MuxOptions) {
  const { client, server, devices, links } = webPath();
  const files: Resource[] = Array.from({ length: resources }, (_, i) => ({ path: `/${i + 1}.js`, bytes: RESOURCE_BYTES }));
  const tls = version === 'HTTP/2';
  httpServer(server, { port: SERVER_PORT, resources: files, version, tls });
  const http = httpClient(client, { server: server.address(), port: SERVER_PORT, version, tls, returning });
  const run = simulate({
    devices,
    links,
    watch: ['client'],
    maxEvents: 20000,
    faults: lost > 0 ? [dropResponse(server, lost)] : [],
    commands: [{ at: 0, device: client.id, run: (_, ctx) => http.get(ctx, files.map(({ path }) => path)) }],
  });
  const firstByte = Math.min(...http.fetches.map(({ firstByteAt = Infinity }) => firstByteAt));
  const finished = Math.max(...http.fetches.map(({ doneAt = 0 }) => doneAt));
  return { run, http, client, server, firstByte, finished };
}

export const lostNumber = (lost: string) => Number(lost.split(' ')[1] ?? 0);

/** The most stream rows stalled at any one moment. */
export const mostStalled = (run: SimResult) => Math.max(0, ...run.events.map((event: SimEvent) => event.tables.client?.[STREAMS_TABLE]?.rows.filter((row) => row[3] === 'stalled').length ?? 0));

export const streamsPanel = (event: SimEvent) => {
  const table = event.tables.client?.[STREAMS_TABLE];
  return table && { label: 'Streams', view: streamGrid(table) };
};

export function http2Steps(values: Record<string, string>): Step[] {
  const resources = readInt(values, 'resources', 'Resources', { min: 2, max: 6 });
  if (!resources.ok) return refusal(TITLE, resources.why, EMPTY);
  const lost = readChoice(values, 'lost', 'Lost', LOST);
  if (!lost.ok) return refusal(TITLE, lost.why, EMPTY);

  const { run, http, client, server, finished } = runMux('HTTP/2', { resources: resources.value, lost: lostNumber(lost.value) });
  const steps = traceSteps(run, http2Code, LINES, {
    hide: HIDE,
    ladderSkip: ['tcp-data', 'tcp-ack'],
    ladder: [{ id: client.id, label: client.label, ip: client.address() }, { id: server.id, label: server.label, ip: server.address() }],
    panel: streamsPanel,
  });
  const [first, second] = http.fetches;
  const stalled = mostStalled(run);
  return endWith(steps, {
    title: `${resources.value} resources in ${finished} ms on 1 connection`,
    why: stalled > 0
      ? `One lost segment stalled ${stalled} streams at once. TCP can't tell them apart: it only sees a gap in one stream of bytes, so the data for every stream behind it waited.`
      : `The headers cost ${first!.headerBytes} bytes on the first request and ${second!.headerBytes} on the second, because the table already held the fields that repeat.`,
    variables: { finished, stalled, cut: run.cut ? 'yes' : 'no' },
  });
}
