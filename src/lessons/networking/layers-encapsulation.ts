import { CORRUPT_OPTIONS, layersEncapsulationCode, layersEncapsulationSteps } from '../../networking/scenarios/layers-encapsulation';
import type { LessonContent } from '../../types/lesson';

const defaults = { message: 'hello', corrupt: CORRUPT_OPTIONS[0]! };
const steps = layersEncapsulationSteps(defaults);
const beforeIp = steps[1]!;

const content: LessonContent = {
  overview:
    'A message never crosses a network on its own. Each layer of software wraps it in a header of its own, and the other side unwraps those headers in reverse order. This lesson wraps your message in real UDP, IP and Ethernet layers, works out the real IPv4 checksum, then corrupts a byte to show what the checksum is for.',
  concept: [
    'Networking is split into layers so that each one solves a single problem. Ethernet moves a frame across one wire. IP moves a packet between any two machines on earth. UDP and TCP deliver data to the right program. The application decides what the data means.',
    'Each layer treats everything it gets from above as an opaque payload and puts its own header in front. This is called encapsulation. IP doesn\'t read the UDP datagram inside its packet, and Ethernet doesn\'t read the IP packet inside its frame. Each keeps one small field naming what it carries, so the other side knows which layer to hand it to.',
    'The receiver undoes this in reverse. Each layer reads only its own header, removes it, and passes the rest up. That means one layer can change without touching the others: Wi-Fi replaces Ethernet, and IP and everything above carry on as before.',
    'The IPv4 header carries a checksum: the header\'s 16-bit words added up and inverted. Run the same sum at the other end, with the checksum included, and a clean header gives 0. It covers the header only, so the layers above must protect the payload. It catches accidents, not attackers.',
    'This simulation shows one exchange with fixed addresses. Its IPv4 header is real, byte for byte, while the UDP and Ethernet headers are described and not encoded. It leaves out the Ethernet frame check, the UDP checksum and IP options.',
    'To see this on a real machine, run tcpdump or open Wireshark. Both show every captured packet split into these same layers, with each header\'s fields spelled out.',
  ],
  howItWorks: [
    'The application hands its message to the transport layer.',
    'UDP adds ports, IP adds addresses and a TTL, and Ethernet adds MAC addresses.',
    'The sender works out the IP header\'s checksum and stores it in the header.',
    'The frame crosses the wire as plain bytes.',
    'The receiver removes each header in reverse order, and IP checks the sum on its way.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'message', label: 'Message', type: 'text', sample: defaults.message, help: 'Up to 32 bytes.' },
      { name: 'corrupt', label: 'Corrupt a byte on the wire', type: 'choice', sample: defaults.corrupt, options: CORRUPT_OPTIONS, help: 'Flips one bit of the TTL byte in the IP header.' },
    ],
    presets: [
      { label: 'Clean', values: defaults },
      { label: 'Corrupted byte', values: { ...defaults, corrupt: CORRUPT_OPTIONS[1]! } },
    ],
    generate: layersEncapsulationSteps,
    codeLabel: 'Pseudocode',
  },
  code: layersEncapsulationCode,
  prosCons: {
    pros: ['Each layer can change without touching the others', 'Any application can run over any network', 'Each layer stays simple because it has one job'],
    cons: ['Every header adds bytes to every packet', 'Hiding details can cost speed', 'Problems can be hard to place when layers hide each other'],
    useWhen: ['Working out where a network fault sits', 'Reading a packet capture'],
    avoidWhen: ['Treating the layers as strict walls: real systems such as TLS and QUIC blur them'],
  },
  applications: [
    'Packet captures in Wireshark are laid out by layer',
    'Wi-Fi and Ethernet carry the same IP packets, unchanged',
    'VPNs put a whole IP packet inside another packet\'s payload',
  ],
  commonMistakes: [
    'Thinking the IP checksum protects the data. It covers the header only.',
    'Reading "layer 3" as a real thing in the code. Layers are a way of organising, and the 7-layer OSI model doesn\'t match real stacks exactly.',
    'Forgetting header overhead when working out how much data fits in a packet.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'UDP has just added its header to the message. Which layer acts next, and what does it add?',
      view: beforeIp.view,
      options: ['IP adds source and destination IP addresses', 'Ethernet adds MAC addresses', 'The application adds a port', 'UDP adds a second header'],
      answer: 0,
      explanation: 'The stack runs top to bottom: application, UDP, IP, Ethernet. IP takes the UDP datagram as its payload.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does the IP layer not need to know that UDP is inside its packet?',
      options: ['It treats everything from above as a payload', 'UDP removes itself before IP runs', 'IP only carries text', 'Routers read UDP for it'],
      answer: 0,
      explanation: 'Encapsulation means each layer adds a header and leaves what it was given alone. That is what makes layers replaceable.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'In the pseudocode, which line makes a damaged header stop here?',
      options: ['if (sum(packet.header) != 0) drop(packet)', 'frame = ethernetHeader + packet', 'datagram = udpHeader + data', 'deliver(data)'],
      answer: 0,
      explanation: 'A clean header gives 0 with its stored checksum included, so any other result means a byte changed on the way.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'One byte of the message itself is damaged, and the IP header is fine. What does the IPv4 checksum do?',
      options: ['Nothing: it covers the header only', 'It drops the packet', 'It repairs the byte', 'It asks for a resend'],
      answer: 0,
      explanation: 'The IPv4 checksum only covers the header. Protecting the payload is left to the layers above.',
    },
  ],
  summary: [
    'Each layer adds a header going down and removes it coming up.',
    'A layer treats everything from above as a payload it doesn\'t read.',
    'Layers can be swapped without touching the others.',
    'The IPv4 checksum catches a damaged header, and nothing else.',
  ],
};

export default content;
