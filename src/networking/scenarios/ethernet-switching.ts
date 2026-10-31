import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Host } from '../devices';
import type { Frame } from '../packet';
import { simulate, type Command, type Fault } from '../sim';
import { EMPTY, traceSteps } from '../steps';
import { fourHosts } from './topology';

export const ethernetSwitchingCode = `// a host puts one frame on its wire
send(myMac, dstMac, data)

// every switch runs this for every frame
on frame(src, dst, inPort):
  table[src] = inPort
  if table[dst] is older than agingTime:
    delete table[dst]
  if dst is unknown:
    send out of every port except inPort
  else:
    send out of table[dst]

// a host checks each frame it hears
if dst != myMac: ignore(frame)`;

export const SCENES = ['First frame', 'Reply', 'Aged out', 'Host moved'];
export const HOST_NAMES = ['A', 'B', 'C', 'D'];

const LINES = {
  send: 'send(myMac, dstMac, data)',
  learn: 'table[src] = inPort',
  'aged-out': 'delete table[dst]',
  flood: 'send out of every port except inPort',
  forward: 'send out of table[dst]',
  'not-mine': 'if dst != myMac: ignore(frame)',
};

const TITLE = "Can't send this frame";
const REPLY_MS = 100;
const MOVE_MS = 200;
const AFTER_MOVE_MS = 300;
const AGAIN_MS = 400;

export function ethernetSwitchingSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const sender = readChoice(values, 'sender', 'Sender', HOST_NAMES);
  if (!sender.ok) return refusal(TITLE, sender.why, EMPTY);
  const receiver = readChoice(values, 'receiver', 'Receiver', HOST_NAMES);
  if (!receiver.ok) return refusal(TITLE, receiver.why, EMPTY);
  const aging = readInt(values, 'aging', 'Aging time', { min: 1, max: 600 });
  if (!aging.ok) return refusal(TITLE, aging.why, EMPTY);
  if (sender.value === receiver.value) return refusal(TITLE, `${sender.value} can't send a frame to itself. Pick two different hosts.`, EMPTY);

  const { hosts, devices, links } = fourHosts({ agingS: aging.value, known: true });
  for (const host of hosts) host.bindUdp(7, host.label);
  const a = hosts[HOST_NAMES.indexOf(sender.value)]!;
  const b = hosts[HOST_NAMES.indexOf(receiver.value)]!;
  const frameBetween = (from: Host, to: Host): Frame => ({
    srcMac: from.mac,
    dstMac: to.mac,
    payload: { kind: 'ip', src: from.address(), dst: to.address(), ttl: 64, id: 1, payload: { kind: 'udp', srcPort: 5000, dstPort: 7, data: 'hello' } },
  });
  const send = (at: number, from: Host, to: Host): Command => ({
    at,
    device: from.id,
    run: (_, ctx) => ctx.send(['eth0'], frameBetween(from, to), { action: 'send', title: `${from.label} sends a frame to ${to.label}`, why: `The frame names ${to.mac} as its destination. ${from.label} doesn't know or care where that is.` }),
  });

  const commands = [send(0, a, b)];
  const faults: Fault[] = [];
  if (scene.value !== SCENES[0]) commands.push(send(REPLY_MS, b, a));
  if (scene.value === SCENES[2]) commands.push(send(REPLY_MS + (aging.value + 1) * 1000, a, b));
  if (scene.value === SCENES[3]) {
    faults.push({ at: MOVE_MS, kind: 'moveLink', link: hosts.indexOf(b), to: ['sw', 'p5'] });
    commands.push(send(AFTER_MOVE_MS, b, a), send(AGAIN_MS, a, b));
  }
  return traceSteps(simulate({ devices, links, commands, faults }), ethernetSwitchingCode, LINES);
}
