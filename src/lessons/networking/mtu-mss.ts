import { MTUS, mtuMssCode, mtuMssSteps, SCENES } from '../../networking/scenarios/mtu-mss';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, mtu: MTUS[1]! };
const needed = mtuMssSteps({ ...defaults, scene: SCENES[2]! });
const refused = needed.find((step) => step.title.includes('Fragmentation Needed') && step.title.startsWith('Fragmentation Needed from'))!;

const content: LessonContent = {
  overview:
    'Every link has a largest packet it can carry, and a path is only as big as its smallest link. TCP tries to avoid the problem by agreeing a segment size, but the two ends can\'t see the middle. This lesson sends packets too big for one link and shows the three things that can happen.',
  concept: [
    'The MTU, or maximum transmission unit, is the largest IP packet a link can carry. Ethernet\'s is 1500 bytes. Tunnels and VPNs add headers, so paths with a smaller MTU are common.',
    'The MSS, or maximum segment size, is the most data TCP puts in one segment. It is the MTU minus 40 bytes of IP and TCP headers. Each side offers its MSS in its SYN, and both use the smaller. That only covers the two ends\' own links.',
    'A packet too big for the next link can be split by a router, if it allows that. Fragment data must be a multiple of 8 bytes, because the offset field counts in eights. Only the destination joins them back up, and one lost fragment loses the whole packet.',
    'Modern TCP sets Don\'t Fragment on its packets. A router that can\'t forward one drops it and sends ICMP Fragmentation Needed with the MTU that fits. The sender lowers its MSS and tries again. That is path MTU discovery.',
    'It depends on the ICMP getting back. If a router or firewall stays silent, the handshake works, because its packets are small, and then every full-size segment vanishes with no error. This is a black hole: a connection that works for small requests and hangs on large ones.',
    'The sizes are round on purpose: the client\'s MTU is 1500, the server\'s 1400, and the middle link\'s one of 576, 1000 or 1500. IPv6 routers never fragment, and clamping the MSS on routers is left out. Packetization-layer discovery, which probes without ICMP, is left out too. To see this on a real machine, run tracepath to find a path\'s MTU, or ping -M do with a size to test one.',
  ],
  howItWorks: [
    'Each side offers its MTU minus 40 as its MSS, and both use the smaller.',
    'A router checks each packet against the next link\'s MTU.',
    'A packet without Don\'t Fragment is split, and the destination joins it back up.',
    'A packet with Don\'t Fragment is dropped, and the sender gets Fragmentation Needed.',
    'The sender lowers its MSS and resends. If no ICMP comes, it times out and finally gives up.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES },
      { name: 'mtu', label: 'Middle link MTU', type: 'choice', sample: defaults.mtu, options: MTUS, help: 'The R1 to R2 link. MSS agreed never reaches it.' },
    ],
    presets: [
      { label: 'MSS agreed', values: defaults },
      { label: 'Fragmented datagram', values: { ...defaults, scene: SCENES[1]! } },
      { label: 'Fragmentation Needed', values: { ...defaults, scene: SCENES[2]! } },
      { label: 'Black hole', values: { ...defaults, scene: SCENES[3]! } },
    ],
    generate: mtuMssSteps,
    codeLabel: 'Pseudocode',
  },
  code: mtuMssCode,
  prosCons: {
    pros: ['Agreeing an MSS avoids most fragmentation', 'Path MTU discovery finds the size without any setup', 'Fragmentation lets a too-big datagram through'],
    cons: ['One lost fragment loses the whole packet', 'Discovery fails if ICMP is blocked', 'A black hole gives no error at all'],
    useWhen: ['Always leave Fragmentation Needed unblocked on firewalls'],
    avoidWhen: ['Relying on fragmentation for a busy service. Keep packets within the path MTU instead'],
  },
  applications: [
    'VPNs and tunnels lower the MTU, so routers often clamp the MSS in the SYN',
    'Jumbo frames raise the MTU to about 9000 inside data centres',
    'DNS keeps UDP answers small to avoid fragments',
  ],
  commonMistakes: [
    'Blocking all ICMP for safety. That breaks path MTU discovery and creates black holes.',
    'Thinking a working handshake proves the path works. Its packets are tiny.',
    'Mixing up MTU and MSS. The MTU counts the headers, and the MSS doesn\'t.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client just got Fragmentation Needed with an MTU of 1000. What does it do next?',
      view: refused.view,
      options: ['Lowers its MSS to 960 and sends again', 'Resets the connection', 'Sends the same segment unchanged', 'Clears Don\'t Fragment and sends again'],
      answer: 0,
      explanation: '1000 minus 40 bytes of headers is 960, so segments of that size will fit.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A site loads its small pages, but large downloads hang forever with no error. What is a likely cause?',
      options: ['ICMP Fragmentation Needed is being blocked', 'The DNS server is down', 'The handshake failed', 'The client\'s MSS is too small'],
      answer: 0,
      explanation: 'Small packets fit, but full-size ones are dropped silently. That is a path MTU black hole.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line picks the size both sides will use?',
      options: ['on SYN: mss = min(mine, theirs)', 'mss = mtu - 40', 'if packet.length <= linkMtu: send it', 'join the fragments by id and offset'],
      answer: 0,
      explanation: 'Each side offers its own MSS in the SYN, and the smaller one wins.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A packet of 1400 bytes crosses an MTU of 1000, with a 20-byte IP header. What is the most data one fragment can hold?',
      options: ['976 bytes', '980 bytes', '1000 bytes', '960 bytes'],
      answer: 0,
      explanation: '1000 minus 20 is 980, and fragment data must be a multiple of 8, which gives 976.',
    },
  ],
  summary: [
    'The MTU is the largest packet a link carries, and the path takes its smallest.',
    'MSS is MTU minus 40, and both sides use the smaller offer.',
    'Without Don\'t Fragment a router splits a packet, and the destination rejoins it.',
    'With it, Fragmentation Needed lowers the MSS. Silence makes a black hole.',
  ],
};

export default content;
