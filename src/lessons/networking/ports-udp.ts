import { portsUdpCode, portsUdpSteps, SCENES } from '../../networking/scenarios/ports-udp';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, port: '53' };
const closed = portsUdpSteps({ scene: SCENES[2]!, port: '9999' });
const refused = closed.find((step) => step.title.startsWith('A UDP datagram'))!;

const content: LessonContent = {
  overview:
    'An IP address gets a packet to a machine, but a machine runs many programs. Ports say which one the data is for. UDP is the thinnest possible way to use them: a source port, a destination port, and your data. This lesson sends datagrams to one server and watches what happens when a port is open, closed, or the datagram disappears.',
  concept: [
    'A port is a number from 1 to 65535 on one IP address. A program binds a port to claim it, and the operating system then hands it every datagram that names that port. Well-known services have agreed numbers: DNS uses 53, and echo uses 7.',
    'Every datagram carries two ports. The destination port picks the program, and the source port says where the answer should go. A client usually gets a high, temporary port. Here it is 50000.',
    'UDP adds almost nothing to IP. There is no connection, no order, and no acknowledgement. The sender sends and moves on. That makes it fast and simple, and it suits a DNS question, a game update, or a voice packet, where a late answer is no use anyway.',
    'If no program holds the port, the host throws the datagram away and sends back an ICMP Port Unreachable. It is only a courtesy. A firewall may drop the datagram or the ICMP, and then the sender hears nothing.',
    'If the datagram is lost on the way, nobody is told. The sender can\'t tell a lost datagram from a slow one. A program on UDP has to set its own timer and retry, if it cares at all.',
    'This simulation leaves out the UDP checksum and buffers, and each server program sends one short answer. Port numbers and the ICMP error work as shown. To see this on a real machine, use nc to send and listen on UDP ports, and ss -u to list the ports in use.',
  ],
  howItWorks: [
    'The client binds a source port and sends a datagram to an address and a port.',
    'The server\'s operating system reads the destination port.',
    'If a program is bound to it, the datagram goes to that program.',
    'If not, the host drops it and sends an ICMP Port Unreachable.',
    'The program answers by swapping the two ports, so the reply reaches the right client program.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES },
      { name: 'port', label: 'Destination port', type: 'number', sample: defaults.port, help: 'From 1 to 65535. The server has programs on 53 and 7. Two programs uses both.' },
    ],
    presets: [
      { label: 'Port picks the program', values: defaults },
      { label: 'Two programs', values: { ...defaults, scene: SCENES[1]! } },
      { label: 'Closed port', values: { scene: SCENES[2]!, port: '9999' } },
      { label: 'Lost datagram', values: { ...defaults, scene: SCENES[3]! } },
    ],
    generate: portsUdpSteps,
    codeLabel: 'Pseudocode',
  },
  code: portsUdpCode,
  prosCons: {
    pros: ['No connection setup, so the first datagram can carry data', 'Very little overhead per packet', 'One socket can talk to many peers'],
    cons: ['Nothing is resent if it is lost', 'Datagrams can arrive out of order', 'A closed port may give no sign at all'],
    useWhen: ['A late answer is worthless, as in voice and games', 'Short questions a program can simply ask again, such as DNS'],
    avoidWhen: ['Every byte must arrive, such as a file transfer, unless you add your own recovery'],
  },
  applications: [
    'DNS asks most questions over UDP port 53',
    'Video calls and online games send media and state over UDP',
    'QUIC builds a reliable transport on top of UDP',
  ],
  commonMistakes: [
    'Thinking an IP address identifies a program. It identifies a machine, and the port finishes the job.',
    'Treating silence as success. With UDP, no error doesn\'t mean the data arrived.',
    'Expecting a closed UDP port to always answer. Firewalls often drop the ICMP.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This datagram is going to port 9999, and the server has programs on 53 and 7 only. What happens next?',
      view: refused.view,
      options: ['The server sends an ICMP Port Unreachable', 'The dns program gets it instead', 'The client resends it after a timeout', 'The server sends a TCP RST'],
      answer: 0,
      explanation: 'No program holds the port, so the host drops the datagram and reports it with ICMP.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A UDP datagram is lost between two hosts. Who finds out?',
      options: ['Neither side, unless a program checks', 'The sender, through an ACK that never comes', 'The receiver, through a gap in the numbers', 'The router that lost it tells the sender'],
      answer: 0,
      explanation: 'UDP has no sequence numbers or acknowledgements. Noticing a loss is up to the programs.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line decides which program gets a datagram?',
      options: ['program = bound[dstPort]', 'socket = bind(50000)', 'socket.send(data, serverIp, port)', 'socket.send(answer, srcIp, srcPort)'],
      answer: 0,
      explanation: 'The host looks up the destination port among the bound programs.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does a datagram carry a source port as well as a destination port?',
      options: ['So the answer can reach the right program', 'So routers can pick a path', 'So the host can check the length', 'So the data can be put in order'],
      answer: 0,
      explanation: 'The answer swaps the two ports, and its destination is the sending program\'s port.',
    },
  ],
  summary: [
    'An IP address finds the machine, and a port finds the program.',
    'UDP is ports plus data, with no connection and no recovery.',
    'A closed port may answer with ICMP Port Unreachable, or with silence.',
    'A lost datagram stays lost unless a program sends it again.',
  ],
};

export default content;
