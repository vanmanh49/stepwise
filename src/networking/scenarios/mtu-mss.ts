import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { simulate, type Command } from '../sim';
import { connectionPanel, EMPTY, endWith, traceSteps } from '../steps';
import { QUIET } from './ip-routing';
import { mtuPath, SERVER_PORT } from './topology';

export const mtuMssCode = `// each side offers what its own link can carry
mss = mtu - 40
on SYN: mss = min(mine, theirs)

// a router, before it sends
if packet.length <= linkMtu: send it
else if packet.dontFragment:
  if silent: drop it and say nothing
  send Fragmentation Needed(linkMtu)
else: split it, with offsets in eights

// the destination
join the fragments by id and offset

// the sender
on Fragmentation Needed: mss = mtu - 40, send again
on timer: send again, or give up after 5 retries`;

export const SCENES = ['MSS agreed', 'Fragmented datagram', 'Fragmentation Needed', 'Black hole'];
export const MTUS = ['576', '1000', '1500'];

const LINES = {
  'tcp-syn': 'mss = mtu - 40',
  'tcp-syn-ack': 'on SYN: mss = min(mine, theirs)',
  'forward-hop': 'if packet.length <= linkMtu: send it',
  'black-hole': 'if silent: drop it and say nothing',
  'frag-needed': 'send Fragmentation Needed(linkMtu)',
  fragment: 'else: split it, with offsets in eights',
  reassembled: 'join the fragments by id and offset',
  'mss-lowered': 'on Fragmentation Needed: mss = mtu - 40, send again',
  timeout: 'on timer: send again, or give up after 5 retries',
  abort: 'on timer: send again, or give up after 5 retries',
};

const TITLE = "Can't run this";
const COLUMNS = [
  { id: 'client', label: 'Client' },
  { id: 'r1', label: 'R1' },
  { id: 'r2', label: 'R2' },
  { id: 'server', label: 'Server' },
];
const HIDE = [...QUIET, 'route-match', 'local', 'via-gateway', 'arp-hit'];
const DATAGRAM_DATA = 1372;
const DATAGRAM_TOTAL = 1400;
const AGREED_MSS = 1360;
const TCP_BYTES = 2000;
const DNS_PORT = 53;
const CLIENT_PORT = 50000;

export function mtuMssSteps(values: Record<string, string>): Step[] {
  const scene = readChoice(values, 'scene', 'Scene', SCENES);
  if (!scene.ok) return refusal(TITLE, scene.why, EMPTY);
  const mtu = readChoice(values, 'mtu', 'Middle link MTU', MTUS);
  if (!mtu.ok) return refusal(TITLE, mtu.why, EMPTY);

  const hole = scene.value === SCENES[3];
  const { client, server, devices, links } = mtuPath({ mtu: Number(mtu.value), silent: hole });
  const fits = Number(mtu.value) >= DATAGRAM_TOTAL;
  let received = 0;
  const commands: Command[] = [
    {
      at: 0,
      device: server.id,
      run: () => {
        server.listen(SERVER_PORT, { onData: (count) => { received += count; } });
        server.bindUdp(DNS_PORT, 'dns');
      },
    },
  ];
  if (scene.value === SCENES[1]) {
    commands.push({ at: 0, device: client.id, run: (_, ctx) => client.udp(ctx, server.address(), CLIENT_PORT, DNS_PORT, 'big', { size: DATAGRAM_DATA }) });
  } else {
    const bytes = scene.value === SCENES[0] ? 0 : TCP_BYTES;
    commands.push({ at: 0, device: client.id, run: (_, ctx) => client.write(ctx, client.connect(ctx, server.address(), SERVER_PORT), bytes) });
  }
  const run = simulate({ devices, links, commands });
  const steps = traceSteps(run, mtuMssCode, LINES, { hide: HIDE, ladder: COLUMNS, panel: connectionPanel });

  if (scene.value === SCENES[0]) return endWith(steps, { title: `Both sides use an MSS of ${AGREED_MSS} bytes`, why: `The client offered 1460 and the server 1360, and the smaller wins. With 40 bytes of headers that makes a ${AGREED_MSS + 40}-byte packet. Neither side knows about links in the middle yet.` });
  if (fits) return endWith(steps, { title: 'Nothing was too big', why: `Every packet here is at most ${DATAGRAM_TOTAL} bytes, and the middle link carries ${mtu.value}. Pick 1000 or 576 to see what happens when one doesn't fit.` });
  if (scene.value === SCENES[1]) return endWith(steps, { title: `${DATAGRAM_TOTAL} bytes arrived in pieces`, why: 'The packet could be split, so it was. If one fragment is lost, the whole datagram is lost, which is why modern traffic avoids this.' });
  if (hole) return endWith(steps, { title: 'The connection died with no error', why: 'Small packets got through, so the handshake worked. Every full-size segment vanished, and nobody said why. This is a path MTU black hole, and it looks like a connection that hangs on large transfers only.' });
  return endWith(steps, { title: `All ${received} bytes arrived`, why: `One Fragmentation Needed told the client the size that fits, so it sent ${Number(mtu.value) - 40}-byte segments from there on. That is path MTU discovery.` });
}
