import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import { readBytes } from '../../security/steps';
import { utf8 } from '../../security/crypto/bytes';
import type { GridView, Role, Step } from '../../types/visualization';
import { checksum, ipv4Header } from '../bytes';
import { EMPTY } from '../steps';

export const layersEncapsulationCode = `// sender: each layer wraps what the layer above gave it
data = "hello"
segment = udpHeader + data
packet = ipHeader + segment
ipHeader.checksum = sum(ipHeader)
frame = ethernetHeader + packet
send(frame)

// receiver: each layer unwraps its own header
packet = frame.payload
if (sum(packet.header) != 0) drop(packet)
segment = packet.payload
data = segment.payload
deliver(data)`;

export const CORRUPT_OPTIONS = ['No', 'Yes'];

const TITLE = "Can't send this message";
const SRC = 0x0a000001;
const DST = 0x0a000002;
const UDP_PROTOCOL = 17;
const UDP_HEADER = 8;
const IP_HEADER = 20;
const ETHERNET_HEADER = 14;
const TTL_BYTE = 8;
const CHECKSUM_BYTES = [10, 11];

const line = (snippet: string) => lineOf(layersEncapsulationCode, snippet);
const hex = (value: number, width: number) => `0x${value.toString(16).padStart(width, '0')}`;

/** One row per layer, down the stack. The acting layer is highlighted. */
function stackGrid(shown: string[], active: number): GridView {
  const names = ['Application', 'UDP', 'IP', 'Ethernet'];
  return {
    kind: 'grid',
    rows: names.map((label, i) => ({ label, cells: [{ id: `layer-${i}`, value: shown[i] ?? '–', role: (i === active ? 'active' : 'default') as Role }] })),
  };
}

/** The header as RFC 791 draws it: 4 bytes across. */
function headerGrid(header: Uint8Array, role: (index: number) => Role): GridView {
  return {
    kind: 'grid',
    rows: [0, 4, 8, 12, 16].map((start) => ({
      cells: [0, 1, 2, 3].map((i) => ({ id: `byte-${start + i}`, value: header[start + i]!.toString(16).padStart(2, '0'), role: role(start + i) })),
    })),
  };
}

export function layersEncapsulationSteps(values: Record<string, string>): Step[] {
  const message = readBytes(values, 'message', 'Message', { min: 1, max: 32 });
  if (!message.ok) return refusal(TITLE, message.why, EMPTY);
  const corrupt = readChoice(values, 'corrupt', 'Corrupt a byte', CORRUPT_OPTIONS);
  if (!corrupt.ok) return refusal(TITLE, corrupt.why, EMPTY);

  const text = message.value;
  const dataBytes = utf8(text).length;
  const segmentBytes = UDP_HEADER + dataBytes;
  const packetBytes = IP_HEADER + segmentBytes;
  const frameBytes = ETHERNET_HEADER + packetBytes;
  const sent = ipv4Header({ src: SRC, dst: DST, ttl: 64, id: 1, protocol: UDP_PROTOCOL, totalLength: packetBytes });
  const received = sent.slice();
  if (corrupt.value === 'Yes') received[TTL_BYTE]! ^= 1;
  const result = checksum(received);

  const steps: Step[] = [];
  const data = `"${text}" (${dataBytes} bytes)`;
  const udp = `ports 5000 → 7 (${UDP_HEADER} bytes)`;
  const ip = `10.0.0.1 → 10.0.0.2, TTL 64 (${IP_HEADER} bytes)`;
  const ethernet = `aa:…:01 → aa:…:02 (${ETHERNET_HEADER} bytes)`;

  steps.push({
    title: `The application hands over ${data}`,
    why: 'An application only wants its message delivered. It knows nothing about cables, routers or addresses on the wire.',
    next: 'Each layer below adds its own header.',
    codeLine: line('data = "hello"'),
    view: stackGrid([data], 0),
  });
  steps.push({
    title: `UDP adds ${UDP_HEADER} bytes: ports`,
    why: 'Ports say which program on each machine this is for. The message is now the payload of a UDP segment.',
    codeLine: line('segment = udpHeader + data'),
    view: stackGrid([data, udp], 1),
  });
  steps.push({
    title: `IP adds ${IP_HEADER} bytes: addresses and a TTL`,
    why: 'IP names the two machines, wherever they are in the world. The UDP segment is now the payload of an IP packet.',
    codeLine: line('packet = ipHeader + segment'),
    view: stackGrid([data, udp, ip], 2),
  });
  steps.push({
    title: `The IP header gets its checksum: ${hex((sent[10]! << 8) | sent[11]!, 4)}`,
    why: 'The sender adds up the header as 16-bit words and stores the inverted sum. Bytes on real links do get damaged, and this is how the next device notices.',
    codeLine: line('ipHeader.checksum = sum(ipHeader)'),
    view: { kind: 'panels', panels: [{ label: 'IPv4 header', view: headerGrid(sent, (i) => (CHECKSUM_BYTES.includes(i) ? 'active' : 'default')) }, { label: 'Stack', view: stackGrid([data, udp, ip], 2) }] },
  });
  steps.push({
    title: `Ethernet adds ${ETHERNET_HEADER} bytes: MAC addresses`,
    why: 'Ethernet only cares about the next device on this wire, so its header names local hardware addresses. It is the outermost wrapper.',
    codeLine: line('frame = ethernetHeader + packet'),
    view: stackGrid([data, udp, ip, ethernet], 3),
  });
  steps.push({
    title: `${frameBytes} bytes go on the wire`,
    why: corrupt.value === 'Yes' ? `${dataBytes} bytes of message became ${frameBytes} bytes of frame. On the way, one bit of the TTL byte flips.` : `${dataBytes} bytes of message became ${frameBytes} bytes of frame. Everything above Ethernet is just payload to the wire.`,
    codeLine: line('send(frame)'),
    view: stackGrid([data, udp, ip, ethernet], 3),
  });
  steps.push({
    title: 'Ethernet removes its header',
    why: 'The frame was addressed to this machine, so Ethernet strips its header and passes the rest up.',
    codeLine: line('packet = frame.payload'),
    view: stackGrid([data, udp, ip], 2),
  });

  const variables = { checksum: result };
  if (result !== 0) {
    steps.push({
      title: `IP checksum failed: ${hex(result, 4)} instead of 0, so the packet is dropped`,
      why: 'A valid header sums to 0 here. This one does not, so a field can no longer be trusted, and IP drops the packet without telling anyone. Fixing that is a job for a higher layer.',
      codeLine: line('if (sum(packet.header) != 0) drop(packet)'),
      variables,
      view: { kind: 'panels', panels: [{ label: 'IPv4 header', view: headerGrid(received, (i) => (i === TTL_BYTE ? 'discarded' : 'default')) }] },
    });
    return steps;
  }
  steps.push({
    title: 'IP checks the header: the sum is 0, so it is intact',
    why: 'Summing the header with its stored checksum gives 0 only if nothing changed.',
    codeLine: line('if (sum(packet.header) != 0) drop(packet)'),
    variables,
    view: { kind: 'panels', panels: [{ label: 'IPv4 header', view: headerGrid(received, () => 'found') }] },
  });
  steps.push({
    title: 'IP removes its header',
    why: 'The destination address is this machine, and the protocol field says UDP, so the payload goes up to UDP.',
    codeLine: line('segment = packet.payload'),
    variables,
    view: stackGrid([data, udp], 1),
  });
  steps.push({
    title: 'UDP removes its header',
    why: 'Port 7 says which program gets the data.',
    codeLine: line('data = segment.payload'),
    variables,
    view: stackGrid([data], 0),
  });
  steps.push({
    title: `"${text}" reaches the application`,
    why: 'Each layer read only its own header and treated the rest as payload. That is the whole idea of layering.',
    codeLine: line('deliver(data)'),
    variables,
    view: stackGrid([data], 0),
  });
  return steps;
}
