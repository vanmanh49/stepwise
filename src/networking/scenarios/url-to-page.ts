import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { lookup } from '../app/dns';
import { dropResponse, httpClient, httpServer, type Fetch, type HttpVersion, type Resource } from '../app/http';
import { simulate, type SimEvent, type SimResult, type TableSnapshot } from '../sim';
import { EMPTY, endWith, pageSpans, traceSteps } from '../steps';
import { streamsPanel } from './http-2';
import { HIDE } from './http-1-1';
import { pagePath, RESOLVER_IP, SERVER_PORT } from './topology';

export const urlToPageCode = `// the browser
address = cached, or lookup(name)

open a connection:
  HTTP/1.1, HTTP/2: TCP handshake, then TLS
  HTTP/3: one QUIC handshake

GET /index.html
read it, and find what else the page needs
GET each resource
show the page`;

export const PROTOCOLS: HttpVersion[] = ['HTTP/1.1', 'HTTP/2', 'HTTP/3'];
export const DNS_MODES = ['Cold', 'Cached'];
export const LOST = ['None', 'Packet 3'];

const LINES = {
  'dns-query': 'address = cached, or lookup(name)',
  'tcp-syn': 'HTTP/1.1, HTTP/2: TCP handshake, then TLS',
  'tls-client-hello': 'HTTP/1.1, HTTP/2: TCP handshake, then TLS',
  'quic-initial': 'HTTP/3: one QUIC handshake',
  'http-first-byte': 'read it, and find what else the page needs',
  'http-done': 'show the page',
};

const TITLE = "Can't load this page";
const NAME = 'www.example.com';
const PAGE: Resource = { path: '/index.html', bytes: 2000 };
const FILES: Resource[] = ['/a.js', '/b.css', '/c.png'].map((path) => ({ path, bytes: 8000 }));
const BROWSER_CONNECTIONS = 6;
const LOST_PACKET = 3;
const PAGE_HIDE = [...HIDE, 'quic-data', 'quic-ack'];

const timeOf = (run: SimResult, action: string, device = 'client') => run.events.find((event) => event.action === action && event.device === device)?.time;

/** The phases of the load, worked out from what the run did. A row with no end is left out until it starts. */
function phasesOf(run: SimResult, dnsDoneAt: number | undefined, fetches: Fetch[]) {
  const phases: { name: string; start: number; end: number }[] = [];
  const add = (name: string, start: number | undefined, end: number | undefined) => {
    if (start !== undefined && end !== undefined) phases.push({ name, start, end });
  };
  add('DNS', timeOf(run, 'dns-query'), dnsDoneAt);
  add('TCP', timeOf(run, 'tcp-syn'), timeOf(run, 'tcp-established'));
  add('TLS', timeOf(run, 'tls-client-hello'), timeOf(run, 'tls-finished'));
  add('QUIC', timeOf(run, 'quic-initial'), run.events.findLast(({ action, device }) => action === 'quic-handshake' && device === 'client')?.time);
  for (const { path, startedAt, doneAt } of fetches) add(path, startedAt, doneAt);
  return phases;
}

export function urlToPageSteps(values: Record<string, string>): Step[] {
  const protocol = readChoice(values, 'protocol', 'Protocol', PROTOCOLS);
  if (!protocol.ok) return refusal(TITLE, protocol.why, EMPTY);
  const dns = readChoice(values, 'dns', 'DNS', DNS_MODES);
  if (!dns.ok) return refusal(TITLE, dns.why, EMPTY);
  const lost = readChoice(values, 'lost', 'Lost', LOST);
  if (!lost.ok) return refusal(TITLE, lost.why, EMPTY);

  const version = protocol.value as HttpVersion;
  const tls = version !== 'HTTP/3';
  const { client, server, devices, links } = pagePath();
  httpServer(server, { port: SERVER_PORT, resources: [PAGE, ...FILES], version, tls });
  const http = httpClient(client, {
    server: server.address(),
    port: SERVER_PORT,
    version,
    tls,
    connections: BROWSER_CONNECTIONS,
    onDone(ctx, { path }) {
      if (path === PAGE.path) http.get(ctx, FILES.map((file) => file.path));
    },
  });
  let dnsDoneAt: number | undefined;
  const run = simulate({
    devices,
    links,
    watch: ['client'],
    maxEvents: 20000,
    faults: lost.value === LOST[1] ? [dropResponse(server, LOST_PACKET)] : [],
    commands: [{
      at: 0,
      device: client.id,
      run: (_, ctx) => {
        if (dns.value === DNS_MODES[1]) return http.get(ctx, [PAGE.path]);
        lookup(ctx, client, RESOLVER_IP, NAME, () => {
          dnsDoneAt = ctx.now;
          http.get(ctx, [PAGE.path]);
        });
      },
    }],
  });

  const phases = phasesOf(run, dnsDoneAt, http.fetches);
  const finished = Math.max(0, ...http.fetches.map(({ doneAt = 0 }) => doneAt));
  const tableAt = (now: number): TableSnapshot => ({
    title: 'Page',
    columns: ['Phase', 'Start', 'Ms'],
    rows: phases.filter(({ start }) => start <= now).map(({ name, start, end }) => [name, String(start), end <= now ? String(end - start) : '']),
  });
  const steps = traceSteps(run, urlToPageCode, LINES, {
    hide: PAGE_HIDE,
    panel: streamsPanel,
    spans: (event: SimEvent) => pageSpans(tableAt(event.time), event.time, finished),
  });
  const firstByte = http.fetches[0]?.firstByteAt ?? 0;
  const loaded = http.fetches.filter(({ status }) => status === 200).length;
  return endWith(steps, {
    title: `The page loaded in ${finished} ms on ${version}`,
    why: `The first byte of the page came at ${firstByte} ms, and everything else builds on that. ${lost.value === LOST[1] ? `Packet ${LOST_PACKET} was lost and sent again, and the waterfall shows what that cost. ` : ''}Read the bars from the top: each one had to wait for the one before.`,
    variables: { finished, firstByte, loaded, cut: run.cut ? 'yes' : 'no' },
  });
}
