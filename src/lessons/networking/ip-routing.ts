import { ipRoutingCode, ipRoutingSteps, LINK_OPTIONS, ROUTE_OPTIONS } from '../../networking/scenarios/ip-routing';
import type { LessonContent } from '../../types/lesson';

const defaults = { destination: '10.3.0.2', link: LINK_OPTIONS[0]!, routes: ROUTE_OPTIONS[0]! };
const steps = ipRoutingSteps(defaults);
const atR1 = steps.find((step) => step.title.includes('matches'))!;

const content: LessonContent = {
  overview:
    'A router reads the destination of each packet, looks it up in a table, and passes it one hop closer. That is all routing is, and it is done again from scratch at every router on the way. This lesson sends a packet through three routers, so you can watch the table decide, and see what breaks when a link fails or a table is wrong.',
  concept: [
    'A routing table lists networks and where to send packets for them. A row like 10.3.0.0/24 via 10.12.0.2 means "for that network, hand the packet to that neighbour". No router knows the whole path. Each one only knows the next hop.',
    'Several rows can match one destination, so the most specific wins. This is longest prefix match. A /24 beats a /8, which beats 0.0.0.0/0, the default route that matches everything. If two rows have the same prefix, the lower metric wins.',
    'At each hop, the router builds a new Ethernet frame for the next link, so both MAC addresses change. The IP addresses stay as they are for the whole journey. It also lowers the TTL by one. MAC addresses are for this hop, and IP addresses are for the whole trip.',
    'When something goes wrong, routers say so. With no matching row, the packet is dropped and the sender gets Destination Unreachable. When a TTL reaches zero, the sender gets Time Exceeded. The TTL exists for loops: two routers pointing at each other would otherwise pass a packet back and forth forever.',
    'The routes here are static, typed in once, and a route on a dead link is skipped at once. Real networks learn routes from protocols such as OSPF and BGP, which take time to notice a failure. ARP happens on each link too, but is hidden here so you can follow the packet. The lesson on BGP comes later.',
    'To see this on a real machine, run ip route on Linux, or netstat -rn on macOS, which print the table your own computer uses. You will find a default route to your home router.',
  ],
  howItWorks: [
    'The router receives a frame addressed to its own MAC.',
    'It drops the packet if the TTL has run out, and tells the sender.',
    'It finds the longest matching prefix in its table.',
    'It lowers the TTL and builds a new frame for the next hop.',
    'The next router repeats all of this with its own table.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', sample: defaults.destination, help: 'The server is 10.3.0.2, and Web is 192.0.2.10.' },
      { name: 'link', label: 'R1–R2 link', type: 'choice', sample: defaults.link, options: LINK_OPTIONS, help: 'Down also adds a direct link from R1 to R3.' },
      { name: 'routes', label: 'R2 default route', type: 'choice', sample: defaults.routes, options: ROUTE_OPTIONS, help: 'Loop points it back at R1.' },
    ],
    presets: [
      { label: 'Specific route', values: defaults },
      { label: 'Default route', values: { ...defaults, destination: '192.0.2.10' } },
      { label: 'No route', values: { ...defaults, destination: '198.51.100.7' } },
      { label: 'Backup route', values: { ...defaults, link: LINK_OPTIONS[1]! } },
      { label: 'Routing loop', values: { ...defaults, destination: '192.0.2.10', routes: ROUTE_OPTIONS[1]! } },
    ],
    generate: ipRoutingSteps,
    codeLabel: 'Pseudocode',
  },
  code: ipRoutingCode,
  prosCons: {
    pros: ['Each router only has to know the next hop', 'One row can cover a huge block of addresses', 'A failed link can be routed around'],
    cons: ['A wrong row can create a loop or a black hole', 'Each hop adds delay', 'Packets of one conversation can take different paths'],
    useWhen: ['Connecting separate networks'],
    avoidWhen: ['Staying inside one subnet: a switch is all you need'],
  },
  applications: [
    'Your home router is a two-row table: your network, and a default route to your provider',
    'Cloud route tables decide which subnet reaches the internet gateway',
    'Kubernetes nodes hold routes that carry pod traffic between machines',
  ],
  commonMistakes: [
    'Thinking the first matching row wins. The longest prefix wins, wherever it sits in the table.',
    'Expecting a reply to take the same path. Each direction follows its own tables.',
    'Forgetting the way back: a packet can arrive and its reply can still vanish.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'R1 has 10.3.0.0/24 via R2, 10.0.0.0/8 via R2 and a default route. It has matched the /24 for 10.3.0.2. What changes in the packet when it leaves R1?',
      view: atR1.view,
      options: ['Both MACs change and the TTL drops by 1', 'The destination IP changes to R2', 'Nothing changes at all', 'The source IP becomes R1\'s'],
      answer: 0,
      explanation: 'A new frame is built for the next link, and the TTL falls. The IP addresses stay the same for the whole trip.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A table has 10.0.0.0/8, 10.3.0.0/16 and 0.0.0.0/0. Which row carries 10.3.9.9?',
      options: ['10.3.0.0/16', '10.0.0.0/8', '0.0.0.0/0', 'Whichever came first'],
      answer: 0,
      explanation: 'All three match, and the /16 has the longest prefix.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops a routing loop from running forever?',
      options: ['if ttl <= 1:', 'if no best:', 'frame = new frame to best.nextHop', 'send(frame, best.port)'],
      answer: 0,
      explanation: 'Each router lowers the TTL, so a looping packet dies after a set number of hops.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why do the MAC addresses change at each hop while the IP addresses don\'t?',
      options: ['MACs cover one link and IPs cover the whole trip', 'Routers can\'t read IP addresses', 'MAC addresses wear out', 'IP addresses are encrypted'],
      answer: 0,
      explanation: 'Ethernet only reaches the next device, so each link gets a new frame. IP names the two ends.',
    },
  ],
  summary: [
    'A router finds the next hop, one packet at a time.',
    'The longest matching prefix wins, then the lowest metric.',
    'Each hop rewrites the MACs and lowers the TTL, and the IPs stay the same.',
    'TTL ends loops, and ICMP tells the sender what went wrong.',
  ],
};

export default content;
