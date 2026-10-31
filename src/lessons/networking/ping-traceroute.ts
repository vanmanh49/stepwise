import { DROP_OPTIONS, MODES, pingTracerouteCode, pingTracerouteSteps, SILENT_OPTIONS } from '../../networking/scenarios/ping-traceroute';
import type { LessonContent } from '../../types/lesson';

const defaults = { mode: MODES[0]!, ttl: '64', drop: DROP_OPTIONS[0]!, silent: SILENT_OPTIONS[0]! };
const trace = pingTracerouteSteps({ ...defaults, mode: MODES[1]! });
const firstHop = trace.find((step) => step.title.startsWith('Time Exceeded from'))!;

const content: LessonContent = {
  overview:
    'Ping and traceroute are the first tools anyone reaches for when a network misbehaves, and both are built from a single protocol, ICMP. Ping asks "are you there?". Traceroute uses a clever trick with the TTL to make every router on the path reveal itself. This lesson runs both across three routers.',
  concept: [
    'ICMP is the network\'s own messaging protocol, carried inside IP packets. Ping sends an Echo Request, and the destination sends back an Echo Reply. The time between the two is the round-trip time, or RTT.',
    'Ping tells you less than it seems to. A lost reply looks exactly like a lost request, because the sender only sees silence. Many firewalls drop ICMP too, so no reply doesn\'t prove that a host is down.',
    'Traceroute reuses the rule that routers drop a packet when its TTL runs out, and send Time Exceeded back. It sends a probe with a TTL of 1, which dies at the first router. Then it sends a TTL of 2, which dies at the second, and so on.',
    'Each Time Exceeded comes from the router that dropped the probe, which gives away its address. When a probe finally reaches the destination, the answer is an Echo Reply and the list is finished. Nothing in the network was built for this: it is a side effect of TTL.',
    'A router may forward traffic but refuse to send ICMP errors. It shows as * in the list, and everything after it still works. This simulation sends one probe per hop using ICMP echo, as Windows tracert does. Linux traceroute sends UDP by default and tries each hop 3 times, and real paths can differ from one probe to the next.',
    'To see this on a real machine, run ping, then traceroute or mtr. mtr repeats traceroute live and shows the loss at each hop.',
  ],
  howItWorks: [
    'Ping sends an Echo Request and notes the time.',
    'The destination sends back an Echo Reply, and the difference is the RTT.',
    'Traceroute sends a probe with a TTL of 1, and the first router answers with Time Exceeded.',
    'It raises the TTL by one, so each probe gets one hop further.',
    'An Echo Reply means the probe reached the end of the path.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'mode', label: 'Tool', type: 'choice', sample: defaults.mode, options: MODES },
      { name: 'ttl', label: 'Ping TTL', type: 'number', sample: defaults.ttl, help: 'From 1 to 64. Traceroute sets its own.' },
      { name: 'drop', label: 'Lose reply', type: 'choice', sample: defaults.drop, options: DROP_OPTIONS, help: 'Ping only: which reply goes missing.' },
      { name: 'silent', label: 'R2 stays silent', type: 'choice', sample: defaults.silent, options: SILENT_OPTIONS, help: 'R2 forwards traffic but sends no ICMP errors.' },
    ],
    presets: [
      { label: 'Ping', values: defaults },
      { label: 'Traceroute', values: { ...defaults, mode: MODES[1]! } },
      { label: 'Silent router', values: { ...defaults, mode: MODES[1]!, silent: SILENT_OPTIONS[1]! } },
      { label: 'Lost reply', values: { ...defaults, drop: '2' } },
    ],
    generate: pingTracerouteSteps,
    codeLabel: 'Pseudocode',
  },
  code: pingTracerouteCode,
  prosCons: {
    pros: ['Available on nearly every machine', 'Needs no setup at the far end', 'Shows round-trip time and the path in seconds'],
    cons: ['Firewalls often drop ICMP', 'Each hop shows the way there, not the way back', 'A router may answer slowly even when forwarding fine'],
    useWhen: ['Checking if a host responds', 'Finding where on a path things go wrong'],
    avoidWhen: ['Judging a service\'s health: ping can work while the app is down'],
  },
  applications: [
    'Load balancers and monitors can use ping as a basic health check',
    'Traceroute shows which network is adding delay on a slow path',
    'mtr gives network teams loss and delay per hop over time',
  ],
  commonMistakes: [
    'Concluding a host is down because ping failed. ICMP is often blocked.',
    'Reading * as a broken router. If later hops answer, it is just silent.',
    'Blaming the hop where delay first appears, when that router is only slow to answer ICMP.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The probe with a TTL of 1 got a Time Exceeded from R1. What does traceroute send next?',
      view: firstHop.view,
      options: ['A probe with a TTL of 2', 'The same probe again', 'A probe straight to R2', 'Nothing, the path is known'],
      answer: 0,
      explanation: 'One more TTL takes the probe one router further, so the next router reveals itself.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Ping shows 2 of 3 replies. What do you know for sure?',
      options: ['One of the round trips failed', 'A request was lost', 'A reply was lost', 'The host restarted'],
      answer: 0,
      explanation: 'The sender can\'t tell which direction failed. It only knows that no reply came.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line records a hop\'s address during traceroute?',
      options: ['on Time Exceeded from a router: hop[ttl] = router', 'send Echo Request(seq, ttl)', 'for seq in 1 to 3:', 'on Echo Reply: rtt = now - sentAt[seq]'],
      answer: 0,
      explanation: 'The router that dropped the probe is the source of the Time Exceeded, which gives away its address.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Traceroute shows * at hop 2, but hops 3 and 4 answer. What does that mean?',
      options: ['It forwards traffic but sends no ICMP errors', 'It is down, and traffic goes around it', 'Hops 3 and 4 are answering for it', 'The path has a routing loop at that hop'],
      answer: 0,
      explanation: 'Probes got past hop 2, so it is working. It just doesn\'t answer.',
    },
  ],
  summary: [
    'Ping is an ICMP Echo Request and Echo Reply, timed.',
    'A lost reply and a lost request look the same to the sender.',
    'Traceroute raises the TTL one at a time, so each router gives itself away.',
    'A * means no answer, which isn\'t the same as broken.',
  ],
};

export default content;
