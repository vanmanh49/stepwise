import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { httpClient, httpServer } from '../app/http';
import { PING_MS, wsClient, wsServer, type WebSocketEnd } from '../app/websocket';
import { ipLength } from '../packet';
import { simulate, type Command, type Fault, type SimResult } from '../sim';
import { connectionPanel, EMPTY, endWith, traceSteps } from '../steps';
import { HIDE } from './http-1-1';
import { SERVER_PORT, webPath } from './topology';

export const websocketsCode = `// start as HTTP
send GET with Upgrade: websocket
server answers 101 Switching Protocols

// then either side, at any time
send a frame

// the client, every second
if 2 pings in a row went unanswered: the peer is dead
send a ping

// to finish
send a close frame, and wait for one back`;

export const SCENES = ['Upgrade', 'Server push', 'Polling compared', 'Dead peer'];

const LINES = {
  'ws-upgrade': 'send GET with Upgrade: websocket',
  'ws-switching': 'server answers 101 Switching Protocols',
  'ws-frame': 'send a frame',
  'ws-ping': 'send a ping',
  'ws-pong': 'send a ping',
  'ws-dead': 'if 2 pings in a row went unanswered: the peer is dead',
  'ws-close': 'send a close frame, and wait for one back',
};

const TITLE = "Can't run this";
const MESSAGE_MS = [300, 1700, 2600];
const MESSAGE_BYTES = 100;
const QUIET_END_MS = 500;
const PUSH_END_MS = 3100;
const PEER_DIES_MS = 1500;
const DEAD_END_MS = 4500;
const SKIP = ['tcp-data', 'tcp-ack'];
const WS_HIDE = [...HIDE, 'timeout', 'tcp-established'];

/** Every packet either end sent, and what they added up to. */
function traffic(run: SimResult) {
  const sent = run.events.filter(({ device, frame, hops }) => (device === 'client' || device === 'server') && frame !== undefined && hops.length > 0);
  return { packets: sent.length, bytes: sent.reduce((sum, { frame }) => sum + ipLength(frame!.payload), 0) };
}

const mean = (values: number[]) => Math.round(values.reduce((sum, each) => sum + each, 0) / values.length);

function push(endAt: number, faults: Fault[] = [], withMessages = true) {
  const { client, server, devices, links } = webPath();
  let serverEnd: WebSocketEnd | undefined;
  let clientEnd: WebSocketEnd | undefined;
  wsServer(server, SERVER_PORT, (_, end) => { serverEnd = end; });
  const commands: Command[] = [{ at: 0, device: client.id, run: (_, ctx) => wsClient(ctx, client, server.address(), SERVER_PORT, (__, end) => { clientEnd = end; }) }];
  if (withMessages) {
    MESSAGE_MS.forEach((at, i) => commands.push({ at, device: server.id, run: (_, ctx) => serverEnd?.send(ctx, `update ${i + 1}`, MESSAGE_BYTES) }));
  }
  const run = simulate({ devices, links, commands, faults, endAt, maxEvents: 20000 });
  return { run, client, server, arrivals: clientEnd?.arrivals ?? [] };
}

/** The same 3 messages, fetched by asking once a second. */
function poll() {
  const { client, server, devices, links } = webPath();
  httpServer(server, { port: SERVER_PORT, resources: [{ path: '/updates', bytes: MESSAGE_BYTES }], version: 'HTTP/1.1' });
  const http = httpClient(client, { server: server.address(), port: SERVER_PORT, version: 'HTTP/1.1' });
  const commands: Command[] = MESSAGE_MS.map((_, i) => ({ at: (i + 1) * PING_MS, device: client.id, run: (__, ctx) => http.get(ctx, ['/updates']) }));
  const run = simulate({ devices, links, commands, maxEvents: 20000 });
  return { run, doneAt: http.fetches.map(({ doneAt = 0 }) => doneAt) };
}

export function websocketsSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);

  const dead = scene.value === SCENES[3];
  const quiet = scene.value === SCENES[0] || dead;
  const faults: Fault[] = dead ? [{ at: PEER_DIES_MS, kind: 'stopDevice', device: 'server' }] : [];
  const endAt = dead ? DEAD_END_MS : scene.value === SCENES[0] ? QUIET_END_MS : PUSH_END_MS;
  const { run, client, server, arrivals } = push(endAt, faults, !quiet);
  const steps = traceSteps(run, websocketsCode, LINES, {
    hide: WS_HIDE,
    ladderSkip: SKIP,
    ladder: [{ id: client.id, label: client.label, ip: client.address() }, { id: server.id, label: server.label, ip: server.address() }],
    panel: connectionPanel,
  });

  if (scene.value === SCENES[0]) return endWith(steps, { title: '101: this connection now carries frames', why: 'The handshake cost one HTTP request on one TCP connection, and that connection stays open for as long as both sides want it.' });
  if (dead) return endWith(steps, { title: 'The peer is dead, and the client knows', why: `The Server stopped at ${PEER_DIES_MS} ms with no goodbye, and TCP had nothing to report on a quiet connection. Only the unanswered pings gave it away.` });
  if (scene.value === SCENES[1]) return endWith(steps, { title: '3 messages, and no request for any of them', why: 'The Server sent each one the moment it had it. With no request to wait for, the only delay is the path itself.' });

  const polled = poll();
  const pollDelay = mean(polled.doneAt.map((at, i) => at - MESSAGE_MS[i]!));
  const pushDelay = mean(arrivals.map((at, i) => at - MESSAGE_MS[i]!));
  const { packets: pollPackets, bytes: pollBytes } = traffic(polled.run);
  const { packets: pushPackets, bytes: pushBytes } = traffic(run);
  return endWith(steps, {
    title: `Push waited ${pushDelay} ms on average, polling ${pollDelay} ms`,
    why: `Polling every ${PING_MS} ms took ${pollPackets} packets and ${pollBytes} bytes, and each message waited for the next poll. The WebSocket took ${pushPackets} packets and ${pushBytes} bytes, because its pings are tiny next to full HTTP headers, and each message left at once. Polling faster cuts the wait, and costs more of both.`,
    variables: { pollPackets, pushPackets, pollBytes, pushBytes, pollDelay, pushDelay },
  });
}
