import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Frame } from '../packet';
import { simulate, type Command, type Fault } from '../sim';
import { connectionPanel, EMPTY, traceSteps } from '../steps';
import { HOST_COLUMNS, SERVER_IP, SERVER_PORT, twoHosts } from './topology';

export const tcpConnectionsCode = `// opening
client: send SYN(seq = 1000)         // SYN_SENT
server: on SYN: send SYN ACK         // SYN_RCVD
client: on SYN ACK: send ACK         // ESTABLISHED
server: on ACK                       // ESTABLISHED
server: if nothing listens: send RST
client: no answer in 1 s: send SYN again

// closing: the side that goes first
send FIN                             // FIN_WAIT_1
on ACK of FIN                        // FIN_WAIT_2
on FIN: send ACK, wait 2 s           // TIME_WAIT

// the other side
on FIN: send ACK                     // CLOSE_WAIT
send FIN                             // LAST_ACK
on last ACK                          // CLOSED`;

export const SCENES = ['Handshake and close', 'Refused', 'Lost SYN'];
export const CLOSERS = ['Client', 'Server'];

const LINES = {
  'tcp-syn': 'client: send SYN(seq = 1000)',
  'tcp-syn-ack': 'server: on SYN: send SYN ACK',
  'tcp-established': 'client: on SYN ACK: send ACK',
  'tcp-rst': 'server: if nothing listens: send RST',
  timeout: 'client: no answer in 1 s: send SYN again',
  'tcp-fin': 'send FIN',
  'tcp-fin-acked': 'on ACK of FIN',
  'time-wait': 'on FIN: send ACK, wait 2 s',
  'tcp-ack': 'on FIN: send ACK                     // CLOSE_WAIT',
  'tcp-closed': 'on last ACK',
};

const TITLE = "Can't run this";
const CLOSED_PORT = 81;
const CLOSE_AT_MS = 100;

const isSyn = ({ payload }: Frame) => payload.kind === 'ip' && payload.payload.kind === 'tcp' && payload.payload.flags.join() === 'SYN';

export function tcpConnectionsSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const closer = readChoice(values, 'closer', 'Who closes', CLOSERS);
  if (!closer.ok) return refusal(TITLE, closer.why, EMPTY);

  const { client, server, devices, links } = twoHosts();
  const refused = scene.value === SCENES[1];
  const lost = scene.value === SCENES[2];
  const first = closer.value === CLOSERS[0] ? client : server;
  const commands: Command[] = [
    { at: 0, device: server.id, run: () => server.listen(SERVER_PORT) },
    { at: 0, device: client.id, run: (_, ctx) => void client.connect(ctx, SERVER_IP, refused ? CLOSED_PORT : SERVER_PORT) },
  ];
  if (scene.value === SCENES[0]) commands.push({ at: CLOSE_AT_MS, device: first.id, run: (_, ctx) => first.close(ctx, first.connections()[0]!) });
  const faults: Fault[] = lost ? [{ kind: 'dropPacket', matches: isSyn, nth: 1 }] : [];
  const run = simulate({ devices, links, commands, faults });
  const steps = traceSteps(run, tcpConnectionsCode, LINES, { ladder: HOST_COLUMNS, panel: connectionPanel });
  if (refused) steps.push({ ...steps.at(-1)!, title: 'Connection refused', why: `The program sees "connection refused" at once. An RST is an answer, so it can tell that nothing is listening on port ${CLOSED_PORT} instead of waiting out a timeout.` });
  if (lost) steps.push({ ...steps.at(-1)!, title: 'A lost SYN only costs time', why: 'Nothing had happened yet, so sending the SYN again was enough. The first attempt cost the program a full second, which is why one lost packet at the start of a page load can be so noticeable.' });
  return steps;
}
