import { arpCode, arpSteps, CACHE_OPTIONS, TARGETS } from '../../networking/scenarios/arp';
import type { LessonContent } from '../../types/lesson';

const defaults = { target: TARGETS[0]!, cache: CACHE_OPTIONS[0]! };
const steps = arpSteps(defaults);
const asked = steps.find((step) => step.title.startsWith('Who has'))!;

const content: LessonContent = {
  overview:
    'A host knows the IP address it wants to reach, but a frame can only be addressed to a MAC. ARP, the Address Resolution Protocol, fills that gap by simply asking everyone on the network. This lesson runs it with an empty cache, a full cache, and a target that doesn\'t exist.',
  concept: [
    'IP addresses identify machines across the internet, while Ethernet only delivers to MAC addresses. So before a host can put a packet on the wire, it must find the MAC address that goes with the next IP on the path.',
    'ARP asks the whole network. The host broadcasts "who has 10.0.0.2? Tell 10.0.0.1", and the switch floods that to everyone. Every host reads it, and only the owner of that address replies, directly to the asker.',
    'The packet waits while this happens. Once the reply arrives, the host saves the answer in its ARP cache and sends the waiting packet. The cache means the next packet goes straight out, with no question at all.',
    'If nobody answers, the host gives up after a short wait and drops the packet. This is the "Destination Host Unreachable" you can see when pinging a machine that is off, on your own network.',
    'This simulation waits one second and doesn\'t retry, and its cache entries never expire. Real hosts retry a few times, and drop entries after minutes or less. IPv6 does the same job with a protocol called Neighbor Discovery.',
    'To see this on a real machine, run ip neigh on Linux or arp -a on Windows and macOS. Both print the cache, and a new entry appears right after you ping a neighbour.',
  ],
  howItWorks: [
    'The host looks up the IP in its ARP cache.',
    'On a miss, it holds the packet and broadcasts a question.',
    'The switch floods it, and only the owner of that IP replies.',
    'The host saves the MAC and sends the waiting packet.',
    'With no reply in time, it gives up and drops the packet.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'target', label: 'A pings', type: 'choice', sample: defaults.target, options: TARGETS, help: 'Nobody has 10.0.0.9.' },
      { name: 'cache', label: 'ARP cache', type: 'choice', sample: defaults.cache, options: CACHE_OPTIONS, help: 'Whether hosts already know each other.' },
    ],
    presets: [
      { label: 'Cache miss', values: defaults },
      { label: 'Cache hit', values: { ...defaults, cache: CACHE_OPTIONS[1]! } },
      { label: 'Nobody home', values: { ...defaults, target: TARGETS[2]! } },
    ],
    generate: arpSteps,
    codeLabel: 'Pseudocode',
  },
  code: arpCode,
  prosCons: {
    pros: ['Needs no setup or central server', 'The cache makes later packets immediate', 'Simple enough to run on the smallest device'],
    cons: ['Every miss interrupts every host on the network', 'The first packet waits for an answer', 'Anyone can answer, because replies aren\'t checked'],
    useWhen: ['Delivering IPv4 packets on a local network'],
    avoidWhen: ['Reaching a host beyond your subnet: you ARP for the gateway, not the destination'],
  },
  applications: [
    'Every IPv4 host uses ARP before sending to a neighbour or its gateway',
    'Failover systems send an unprompted ARP reply when an address moves to a new machine',
    'Network scanners find live hosts on a subnet by sending ARP requests',
  ],
  commonMistakes: [
    'Trusting ARP. Any host can send a false reply and receive someone else\'s traffic, an attack known as ARP spoofing.',
    'Thinking you ARP for a remote server. For anything off your subnet, you ARP for the gateway.',
    'Blaming the network when one first ping is slow. That extra time is often ARP.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'A has broadcast "who has 10.0.0.2?". The switch floods it to B, C and D. Who answers?',
      view: asked.view,
      options: ['B only', 'B, C and D', 'The switch', 'Nobody, A must retry'],
      answer: 0,
      explanation: 'Every host reads the question, but only the owner of 10.0.0.2 replies.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Your laptop sends a packet to a server in another country. Whose MAC address does it look up?',
      options: ['The default gateway\'s', 'The server\'s', 'The DNS server\'s', 'Its own'],
      answer: 0,
      explanation: 'The frame only crosses the local link, so its destination is the gateway. The IP header still names the server.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes every later packet to this IP skip the broadcast?',
      options: ['cache[ip] = reply.mac', 'broadcast("who has ip?")', 'hold(packet)', 'if (no reply): give up'],
      answer: 0,
      explanation: 'The asker keeps the answer, so it doesn\'t need to ask again while the entry lasts.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What happens to the packet while ARP is waiting for an answer?',
      options: ['It is held, then sent or dropped', 'It goes out with a blank MAC', 'It is broadcast to everyone', 'It goes to the gateway'],
      answer: 0,
      explanation: 'Without a destination MAC there is no frame to send, so the packet waits.',
    },
  ],
  summary: [
    'ARP finds the MAC address for an IP on the local network.',
    'It broadcasts a question, and only the owner replies.',
    'Answers go in a cache, so later packets don\'t ask.',
    'ARP replies aren\'t checked, which is why spoofing works.',
  ],
};

export default content;
