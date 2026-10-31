import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { ipv4 } from '../address';
import { lookup } from '../app/dns';
import { httpClient, httpServer, type Fetch } from '../app/http';
import { simulate, type Command, type Ctx, type Fault, type SimEvent } from '../sim';
import { EMPTY, endWith, tableGrid, traceSteps } from '../steps';
import { HIDE } from './http-1-1';
import { cdnNet, RESOLVER_IP, SERVER_PORT } from './topology';

export const cdnAnycastCode = `// DNS gives the one shared address
address = lookup(name)

// routers send it to the nearest edge alive
route = lowest metric to that address, on a link that is up

// the edge
if a fresh copy is cached: answer with Age and X-Cache: HIT
else:
  fetch it from the origin
  keep it for its TTL
  answer with X-Cache: MISS

// a client whose edge vanished
on RST: send the request again`;

export const SCENES = ['Cache miss', 'Cache hit', 'Nearest edge', 'Edge fails'];
export const MOMENTS = ['During a transfer', 'Between requests'];

const LINES = {
  'dns-query': 'address = lookup(name)',
  'tcp-syn': 'route = lowest metric to that address, on a link that is up',
  'cache-hit': 'if a fresh copy is cached: answer with Age and X-Cache: HIT',
  'cache-miss': 'fetch it from the origin',
  'http-done': 'answer with X-Cache: MISS',
  'tcp-rst': 'on RST: send the request again',
  'http-retry': 'on RST: send the request again',
};

const TITLE = "Can't fetch this page";
const NAME = 'www.example.com';
const PATH = '/index.html';
const PAGE_BYTES = 8000;
const TTL_S = 60;
const ANYCAST_TEXT = '198.51.100.10';
const SECOND_VISIT_MS = 5000;
/** The first byte reaches the Client here, so its ACK crosses the Router just after the route moves. */
const MID_TRANSFER_MS = 812;
const AFTER_FIRST_MS = 2000;
const CACHE_TABLE = 5;
const ROUTES_TABLE = 0;
const CDN_HIDE = [...HIDE, 'tcp-established'];

const headerOf = (fetch: Fetch | undefined, name: string) => fetch?.headers?.[name] ?? '–';

function closing(scene: string, moment: string, fetch: Fetch | undefined, reset: boolean) {
  const variables = { status: fetch?.status ?? 0, xCache: headerOf(fetch, 'X-Cache'), age: headerOf(fetch, 'Age') };
  if (scene === SCENES[0]) return { title: 'A miss went all the way to the origin', why: 'The first visitor pays for the long trip, and the edge keeps a copy for the next one.', variables };
  if (scene === SCENES[1]) return { title: `A hit, with Age ${variables.age}`, why: 'The second visitor got the edge\'s copy, so nothing went to the origin. Age says how many seconds it has been held.', variables };
  if (scene === SCENES[2]) return { title: 'The Near edge answered', why: `Both edges hold ${ANYCAST_TEXT}. The Router has a route to each, and metric 1 beat metric 2. Nothing told the Client which edge it reached.`, variables };
  if (moment === MOMENTS[1]) return { title: 'The next request simply went to the Far edge', why: `No connection was open, so nothing broke. Routing moved the address, and the Far edge had no copy, so this was a miss.`, variables };
  return { title: reset ? 'The Far edge reset the connection, and the retry worked' : 'The transfer finished', why: 'Routing moved the address mid-transfer. The Far edge had never heard of this connection, so it sent RST, and the Client asked again from scratch. Anycast moves packets, not connections.', variables };
}

export function cdnAnycastSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const moment = readChoice(values, 'moment', 'When the edge fails', MOMENTS);
  if (!moment.ok) return refusal(TITLE, moment.why, EMPTY);

  const { client, edges, origin, devices, links, nearLink } = cdnNet();
  httpServer(origin, { port: SERVER_PORT, resources: [{ path: PATH, bytes: PAGE_BYTES }], version: 'HTTP/1.1' });
  for (const edge of edges) httpServer(edge, { port: SERVER_PORT, resources: [], version: 'HTTP/1.1', edge: { origin: origin.address(), ttlS: TTL_S } });
  const http = { current: undefined as ReturnType<typeof httpClient> | undefined };
  const visit = (at: number): Command => ({
    at,
    device: client.id,
    run: (_, ctx: Ctx) => lookup(ctx, client, RESOLVER_IP, NAME, (address) => {
      http.current ??= httpClient(client, { server: ipv4(address ?? '0.0.0.0'), port: SERVER_PORT, version: 'HTTP/1.1', keepAlive: false });
      http.current.get(ctx, [PATH]);
    }),
  });
  const fails = scene.value === SCENES[3];
  const between = moment.value === MOMENTS[1];
  const commands = [visit(0), ...(scene.value === SCENES[1] ? [visit(SECOND_VISIT_MS)] : []), ...(fails && between ? [visit(AFTER_FIRST_MS + 1000)] : [])];
  const failAt = between ? AFTER_FIRST_MS : MID_TRANSFER_MS;
  const faults: Fault[] = fails ? [{ at: failAt, kind: 'linkDown', link: nearLink }, { at: failAt, kind: 'stopDevice', device: edges[0]!.id }] : [];
  const run = simulate({ devices, links, commands, faults, maxEvents: 20000 });

  const panel = (event: SimEvent) => {
    if (scene.value === SCENES[2]) {
      const routes = event.tables.router?.[ROUTES_TABLE];
      return routes && { label: 'Router routes', view: tableGrid(routes, 'router', routes.rows.findIndex(([network]) => network === `${ANYCAST_TEXT}/32`)) };
    }
    const cache = event.tables[event.device]?.[CACHE_TABLE];
    return cache && { label: cache.title, view: tableGrid(cache, event.device) };
  };
  const steps = traceSteps(run, cdnAnycastCode, LINES, { hide: CDN_HIDE, panel });
  const reset = run.events.some(({ action, device }) => action === 'tcp-rst' && device === client.id);
  return endWith(steps, closing(scene.value, moment.value, http.current?.fetches.at(-1), reset));
}

