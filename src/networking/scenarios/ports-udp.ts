import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { GridView, Role, Step } from '../../types/visualization';
import type { Frame } from '../packet';
import { simulate, type Command, type Fault, type SimEvent } from '../sim';
import { EMPTY, traceSteps } from '../steps';
import { QUIET } from './ip-routing';
import { CLIENT_IP, SERVER_IP, twoHosts } from './topology';

export const portsUdpCode = `// the sender needs no connection
socket = bind(50000)
socket.send(data, serverIp, port)

// the receiving host picks a program by port
on datagram:
  program = bound[dstPort]
  if no program: send Port Unreachable
  else: program.receive(data, srcIp, srcPort)

// the program answers to the port it came from
socket.send(answer, srcIp, srcPort)`;

export const SCENES = ['Port picks the program', 'Two programs', 'Closed port', 'Lost datagram'];

const LINES = {
  send: 'socket.send(data, serverIp, port)',
  'udp-received': 'else: program.receive(data, srcIp, srcPort)',
  'port-unreachable': 'if no program: send Port Unreachable',
};

const TITLE = "Can't send this datagram";
const CLIENT_PORT = 50000;
const ANSWER_MS = 50;
const PROGRAMS: [port: number, label: string][] = [
  [53, 'dns'],
  [7, 'echo'],
];
const HIDE = [...QUIET, 'local', 'arp-hit'];

const isPort = (port: number) => (event: SimEvent) => {
  const payload = event.frame?.payload;
  const inner = payload?.kind === 'ip' ? payload.payload : undefined;
  return inner?.kind === 'udp' && inner.dstPort === port;
};

function portsGrid(event: SimEvent): GridView {
  return {
    kind: 'grid',
    colLabels: ['Port', 'Program'],
    rows: PROGRAMS.map(([port, label]) => ({
      cells: [String(port), label].map((value, c) => ({ id: `port-${port}-${c}`, value, role: (isPort(port)(event) ? 'active' : 'default') as Role })),
    })),
  };
}

const programOn = (port: number) => PROGRAMS.find(([each]) => each === port)?.[1];

const ending = (scene: string, port: number) => {
  const program = programOn(port);
  if (scene === SCENES[1]) return { title: 'One address, two programs', why: 'Both datagrams went to the same IP address. The port number alone sent each one to its own program.' };
  if (scene === SCENES[3]) return { title: 'Nobody was told', why: 'UDP has no acknowledgements and no retries. The sender thinks it worked, and the receiver never knew. If the program cares, it has to notice and try again itself.' };
  if (scene === SCENES[2] && program) return { title: `Port ${port} is open`, why: `${program} is bound to port ${port}, so there is no error here. Pick a port with no program, such as 9999, to see one.` };
  if (program) return { title: `${program} answered`, why: `The answer goes back to port ${CLIENT_PORT}, the source port it arrived with. That is how the reply finds the right program on the client.` };
  return { title: 'The sender heard about the closed port', why: 'That ICMP message is a courtesy. A firewall in the way would drop it, and the sender would hear nothing at all.' };
};

export function portsUdpSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const port = readInt(values, 'port', 'Port', { min: 1, max: 65535 });
  if (!port.ok) return refusal(TITLE, port.why, EMPTY);

  const { client, server, devices, links } = twoHosts();
  for (const [each, label] of PROGRAMS) server.bindUdp(each, label);
  const targets = scene.value === SCENES[1] ? PROGRAMS.map(([each]) => each) : [port.value];
  const lost = scene.value === SCENES[3];
  const commands: Command[] = targets.flatMap((target, i): Command[] => [
    { at: i * 2 * ANSWER_MS, device: client.id, run: (_, ctx) => client.udp(ctx, SERVER_IP, CLIENT_PORT + i, target, 'hello') },
    { at: i * 2 * ANSWER_MS + ANSWER_MS, device: server.id, run: (_, ctx) => void (programOn(target) && !lost && server.udp(ctx, CLIENT_IP, target, CLIENT_PORT + i, 'hi back')) },
  ]);
  if (lost) commands.push({ at: ANSWER_MS, device: client.id, run: (_, ctx) => ctx.note({ action: 'silence', title: 'Nothing has come back', why: 'The client can\'t tell a lost datagram from a slow answer. UDP gives it nothing to go on.' }) });
  const isDatagram = (frame: Frame) => frame.payload.kind === 'ip' && frame.payload.payload.kind === 'udp';
  const faults: Fault[] = lost ? [{ kind: 'dropPacket', matches: isDatagram, nth: 1 }] : [];
  const run = simulate({ devices, links, commands, faults });
  const steps = traceSteps(run, portsUdpCode, LINES, { hide: HIDE, panel: (event) => ({ label: 'Server ports', view: portsGrid(event) }) });
  steps.push({ ...steps.at(-1)!, ...ending(scene.value, port.value) });
  return steps;
}
