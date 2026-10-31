import { natCode, natSteps, SCENES } from '../../networking/scenarios/nat';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, port: '5000', timeout: '30' };
const steps = natSteps(defaults);
const atServer = steps.find((step) => step.title.includes('replies to'))!;

const content: LessonContent = {
  overview:
    'Your phone, laptop and television all share one public address, and a home router makes that work. It rewrites each packet going out and remembers enough to undo it on the way back. This lesson puts two private hosts behind one address, so you can follow that rewrite, and see why a stranger can\'t reach in.',
  concept: [
    'IPv4 has about 4 billion addresses, far fewer than there are devices. NAT, Network Address Translation, stretches them. Private ranges like 192.168.0.0/16 are reused in every building, and internet routers won\'t carry them, so a private address can never appear on the public internet.',
    'Ports make sharing possible. A port is a number that names a conversation on a machine, and every UDP or TCP packet carries a source and a destination port. The next part of this course covers them properly.',
    'When a packet goes out, the router swaps its private source for the router\'s own public address, and notes the swap in a table. The server only ever sees the router. When the reply arrives at that public port, the router looks up who asked and swaps the address back.',
    'Two inside hosts may pick the same port. Replies are matched on the public port alone, so the router gives the second host a different one. Mappings also time out: a UDP conversation that goes quiet is forgotten, and a late reply has nowhere to go.',
    'A packet that arrives with no mapping is dropped, because the router has no idea who it is for. That is why you can\'t reach a home computer from outside without setting up port forwarding, and why NAT feels like a firewall even though it wasn\'t designed as one. This simulation translates UDP only, and keeps the inside port when it can, as many routers do.',
    'To see this on a real machine, run conntrack -L on a Linux router, which lists every mapping it is holding.',
  ],
  howItWorks: [
    'A host sends a packet from its private address and a port of its own.',
    'The router picks a public port, keeping the inside one if it is free.',
    'It rewrites the source and records the mapping.',
    'The reply arrives at the public address and port.',
    'The router finds the mapping and rewrites the destination back.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES },
      { name: 'port', label: "Host B's inside port", type: 'number', sample: defaults.port, help: 'From 1024 to 65535. Host A always uses 5000.' },
      { name: 'timeout', label: 'Mapping timeout (s)', type: 'number', sample: defaults.timeout, help: 'From 1 to 300.' },
    ],
    presets: SCENES.map((scene) => ({ label: scene, values: { ...defaults, scene } })),
    generate: natSteps,
    codeLabel: 'Pseudocode',
  },
  code: natCode,
  prosCons: {
    pros: ['Many devices share one public address', 'Inside addresses can be anything private', 'Unasked-for inbound traffic is dropped by default'],
    cons: ['Hosts outside can\'t start a connection in', 'The router must keep state for every conversation', 'Peer-to-peer apps need workarounds'],
    useWhen: ['Connecting a private network to the internet with few public addresses'],
    avoidWhen: ['Relying on it for security: use a real firewall'],
  },
  applications: [
    'Every home router does this for the whole household',
    'Cloud NAT gateways let private servers fetch updates without being reachable',
    'Mobile networks share public addresses between thousands of phones',
  ],
  commonMistakes: [
    'Treating NAT as a security control. It only drops what it can\'t match.',
    'Assuming a server sees a client\'s real address. It sees the router\'s.',
    'Forgetting that idle mappings expire, which is why long-lived connections need keep-alives.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The server replies to the address it saw. Which address does the reply go to?',
      view: atServer.view,
      options: ['198.51.100.1, the router\'s public address', '192.168.1.10, host A', '192.168.1.1, the router inside', '203.0.113.1, the next hop'],
      answer: 0,
      explanation: 'The server only saw the rewritten source, so the reply goes to the router, which restores the inside address.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Two inside hosts both send from port 5000. What does the router do?',
      options: ['Gives the second a different public port', 'Drops the second packet', 'Merges them into one', 'Gives the second another public IP'],
      answer: 0,
      explanation: 'Replies are matched on the public port, so no two conversations can share one.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops a stranger\'s packet from reaching the inside?',
      options: ['drop(packet)', 'table[port] = key', 'packet.source = (public ip, port)', 'key = (inside ip, inside port)'],
      answer: 0,
      explanation: 'With no mapping for the port, the router can\'t tell who the packet is for, so it drops it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why can\'t a private address like 192.168.1.10 be used on the public internet?',
      options: ['Thousands of networks reuse it, so it names no one machine', 'It has too many digits for internet routers', 'It is kept for routers and can\'t be given to hosts', 'It would be rejected because it is encrypted'],
      answer: 0,
      explanation: 'Private ranges are reused everywhere, so such an address doesn\'t name one machine, and internet routers drop it.',
    },
  ],
  summary: [
    'NAT lets many private hosts share one public address.',
    'The router rewrites the source and records the swap in a table.',
    'Replies are matched on the public port, so ports may be changed.',
    'Inbound packets with no mapping are dropped, and idle mappings expire.',
  ],
};

export default content;
