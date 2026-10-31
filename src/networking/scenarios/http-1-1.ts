import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { httpClient, httpServer, type Resource } from '../app/http';
import { simulate } from '../sim';
import { EMPTY, endWith, tableGrid, traceSteps } from '../steps';
import { SERVER_PORT, WEB_QUIET, webPath } from './topology';

export const http11Code = `// the browser, for each resource
while resources are waiting:
  if a connection is idle: use it
  else if fewer than the limit are open: open another
  else: wait

// on one connection
send GET path
wait for the whole response      // nothing else can use it
if Connection: close: the server closes it
else: keep it for the next request`;

export const CONNECTIONS = ['1', '6'];
export const YES_NO = ['Yes', 'No'];

const LINES = {
  'tcp-syn': 'else if fewer than the limit are open: open another',
  'http-request': 'send GET path',
  'http-first-byte': 'wait for the whole response      // nothing else can use it',
  'http-done': 'else: keep it for the next request',
  'http-close': 'if Connection: close: the server closes it',
};

const TITLE = "Can't fetch this page";
const RESOURCE_BYTES = 8000;
const SLOW_MS = 100;
const STREAMS_TABLE = 4;
export const HIDE = [...WEB_QUIET, 'tcp-data', 'tcp-ack', 'tcp-accepted', 'tcp-fin', 'tcp-last-fin', 'tcp-fin-acked', 'tcp-closed', 'time-wait', 'time-wait-over'];

export function http11Steps(values: Record<string, string>): Step[] {
  const resources = readInt(values, 'resources', 'Resources', { min: 1, max: 8 });
  if (!resources.ok) return refusal(TITLE, resources.why, EMPTY);
  const connections = readChoice(values, 'connections', 'Connections', CONNECTIONS);
  if (!connections.ok) return refusal(TITLE, connections.why, EMPTY);
  const keepAlive = readChoice(values, 'keepAlive', 'Keep-alive', YES_NO);
  if (!keepAlive.ok) return refusal(TITLE, keepAlive.why, EMPTY);

  const { client, server, devices, links } = webPath();
  const files: Resource[] = Array.from({ length: resources.value }, (_, i) => ({ path: `/${i + 1}.js`, bytes: RESOURCE_BYTES, ...(i === 0 ? { delayMs: SLOW_MS } : {}) }));
  httpServer(server, { port: SERVER_PORT, resources: files, version: 'HTTP/1.1' });
  const http = httpClient(client, { server: server.address(), port: SERVER_PORT, version: 'HTTP/1.1', keepAlive: keepAlive.value === 'Yes', connections: Number(connections.value) });
  const run = simulate({
    devices,
    links,
    maxEvents: 20000,
    commands: [{ at: 0, device: client.id, run: (_, ctx) => http.get(ctx, files.map(({ path }) => path)) }],
  });
  const steps = traceSteps(run, http11Code, LINES, {
    hide: HIDE,
    ladderSkip: ['tcp-data', 'tcp-ack'],
    ladder: [{ id: client.id, label: client.label, ip: client.address() }, { id: server.id, label: server.label, ip: server.address() }],
    panel: (event) => {
      const streams = event.tables.client?.[STREAMS_TABLE];
      return streams && { label: 'Resources', view: tableGrid(streams, 'client') };
    },
  });
  const finished = Math.max(...http.fetches.map(({ doneAt = 0 }) => doneAt));
  const opened = http.opened();
  return endWith(steps, {
    title: `${resources.value} resources in ${finished} ms on ${opened} connection${opened === 1 ? '' : 's'}`,
    why: `Each new connection paid for a handshake first. The first resource took an extra ${SLOW_MS} ms to produce${opened === 1 && resources.value > 1 ? ', and everything behind it on the one connection had to wait' : opened > 1 ? ', and the other connections kept working around it' : ''}.`,
    variables: { finished, connections: opened, cut: run.cut ? 'yes' : 'no' },
  });
}
