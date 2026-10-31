import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { ipv4 } from '../address';
import { simulate, type Command } from '../sim';
import { EMPTY, tableGrid, traceSteps } from '../steps';
import { QUIET } from './ip-routing';
import { homeNetwork } from './topology';

export const natCode = `// going out
key = (inside ip, inside port)
if no mapping for key:
  port = inside port, or the next free one if taken
  table[port] = key
packet.source = (public ip, port)
send(packet)

// coming back
key = table[packet.destination port]
if no key:
  drop(packet)
packet.destination = key
send(packet)`;

export const SCENES = ['One host', 'Same port on two hosts', 'Unsolicited inbound', 'Mapping expired'];

const LINES = {
  'nat-out': 'table[port] = key',
  'nat-new-port': 'port = inside port, or the next free one if taken',
  'nat-in': 'key = table[packet.destination port]',
  'nat-drop': 'drop(packet)',
  'forward-hop': 'send(packet)',
};

const TITLE = "Can't run this";
const SERVER = ipv4('203.0.113.5');
const PUBLIC = ipv4('198.51.100.1');
const INSIDE_PORT = 5000;
const SERVICE_PORT = 7;
const SECOND_SEND_MS = 100;

export function natSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const port = readInt(values, 'port', "Host B's inside port", { min: 1024, max: 65535 });
  if (!port.ok) return refusal(TITLE, port.why, EMPTY);
  const timeout = readInt(values, 'timeout', 'Mapping timeout', { min: 1, max: 300 });
  if (!timeout.ok) return refusal(TITLE, timeout.why, EMPTY);

  const expired = scene.value === SCENES[3];
  const { a, b, server, devices, links } = homeNetwork({ timeoutS: timeout.value, echoDelayMs: expired ? timeout.value * 1000 : 0 });
  const commands: Command[] =
    scene.value === SCENES[2]
      ? [{ at: 0, device: server.id, run: (_, ctx) => server.udp(ctx, PUBLIC, SERVICE_PORT, INSIDE_PORT, 'hi') }]
      : [{ at: 0, device: a.id, run: (_, ctx) => a.udp(ctx, SERVER, INSIDE_PORT, SERVICE_PORT, 'hi') }];
  if (scene.value === SCENES[1]) commands.push({ at: SECOND_SEND_MS, device: b.id, run: (_, ctx) => b.udp(ctx, SERVER, port.value, SERVICE_PORT, 'hi') });

  const run = simulate({ devices, links, commands });
  return traceSteps(run, natCode, LINES, {
    hide: [...QUIET, 'learn', 'flood', 'forward', 'route-match'],
    panel: (event) => {
      const table = event.tables.nat?.[2];
      const row = event.device === 'nat' ? event.table?.row : undefined;
      return table && { label: 'NAT table', view: tableGrid(table, 'nat', event.table?.index === 2 ? row : undefined) };
    },
  });
}
