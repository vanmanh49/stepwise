import { cdnAnycastCode, cdnAnycastSteps, MOMENTS, SCENES } from '../../networking/scenarios/cdn-anycast';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, moment: MOMENTS[0]! };
const miss = cdnAnycastSteps(defaults).find((step) => step.title.startsWith('Cache miss'))!;

const content: LessonContent = {
  overview:
    'Light is too slow for one server to feel close to everyone. A CDN keeps copies of content on edges near its users. Anycast is one way to reach them: many machines share one address, and ordinary routing sends each packet to the nearest. This lesson runs both with real DNS, TCP, HTTP and routing.',
  concept: [
    'An edge is a cache in front of an origin. On a miss it fetches the file from the origin and keeps a copy. On a hit it answers by itself, so the long trip never happens. The first visitor pays, and everyone after them saves.',
    'Two headers show what happened. X-Cache says HIT or MISS, and Age says how many seconds the edge has held the copy. Open the Packet panel on a response to read them. A copy older than its TTL is fetched again.',
    'With anycast, both edges hold the same address, 198.51.100.10. The Router has a route to each, and the lower metric wins. No device is told it is using anycast: this is the same longest-prefix lookup you met in Routing Tables, with two ways to one address. Across the internet, BGP makes the same choice.',
    'When an edge fails, its route goes away and the next packet goes to the other edge. If no connection was open, nothing breaks: the next request is just a miss at a new edge.',
    'An open connection is different. The new edge has never heard of it, so it answers with RST, and the client has to ask again. Anycast moves packets, not connections. That is why it suits short requests, and why it is best with DNS and QUIC.',
    'The numbers are round on purpose: an 8000-byte page, a TTL of 60 s, and metrics 1 and 2. There is no TLS in this run, so nothing is encrypted, and real edges terminate TLS too. Each edge here fetches from the origin on the shared address, where a real one has its own. Cache rules, purging and the DNS tricks that CDNs also use are left out. To see this on a real machine, run curl -I on a large site for X-Cache and Age, and dig to see the address.',
  ],
  howItWorks: [
    'DNS gives the client one shared address.',
    'The Router sends it to the edge with the lowest metric whose link is up.',
    'A fresh copy is a hit, and the edge answers with Age set.',
    'Otherwise the edge fetches from the origin, keeps a copy and answers.',
    'If an edge fails, routing moves the address, and open connections get RST.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES },
      { name: 'moment', label: 'When the edge fails', type: 'choice', sample: defaults.moment, options: MOMENTS, help: 'Used by the Edge fails scene.' },
    ],
    presets: SCENES.map((scene) => ({ label: scene, values: { scene, moment: MOMENTS[0]! } })),
    generate: cdnAnycastSteps,
    codeLabel: 'Pseudocode',
  },
  code: cdnAnycastCode,
  prosCons: {
    pros: ['Users reach a nearby copy, so pages load faster', 'The origin sees only a small part of the traffic', 'An edge failure moves traffic with no config change'],
    cons: ['A cached copy can be stale until its TTL ends', 'The first request at each edge is still slow', 'Anycast can break long-lived connections'],
    useWhen: ['Static files and anything many users ask for'],
    avoidWhen: ['Personal or fast-changing pages that can\'t safely be shared'],
  },
  applications: [
    'Images, video and scripts on large sites come from CDN edges',
    'Public DNS resolvers such as 1.1.1.1 are anycast',
    'CDNs absorb attacks by spreading traffic across many edges',
  ],
  commonMistakes: [
    'Caching a page that holds one user\'s data, so others see it.',
    'Forgetting the TTL when you fix a mistake. Old copies stay until it ends.',
    'Thinking anycast picks the nearest by distance. It picks the best route.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The edge has no copy of this file. What does it do next?',
      view: miss.view,
      options: ['Fetch it from the origin', 'Answer 404', 'Tell the client to ask the origin', 'Send RST'],
      answer: 0,
      explanation: 'A miss makes the edge fetch the file, keep a copy and then answer the client.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A response has X-Cache: HIT and Age: 5. What does that say?',
      options: ['The edge answered with a copy held for 5 s', 'The origin answered 5 s ago', 'The page will expire in 5 s', 'The edge retried 5 times'],
      answer: 0,
      explanation: 'HIT means no trip to the origin, and Age counts how long the copy has been held.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line picks the edge?',
      options: ['route = lowest metric to that address, on a link that is up', 'address = lookup(name)', 'if a fresh copy is cached: answer with Age and X-Cache: HIT', 'on RST: send the request again'],
      answer: 0,
      explanation: 'DNS gives one address for both edges, so routing makes the choice.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does the client get RST when its edge fails mid-transfer?',
      options: ['The other edge has no such connection', 'The origin ends every connection', 'The Router sends RST when a link fails', 'The TTL ran out'],
      answer: 0,
      explanation: 'Its packets now reach another machine, which never saw the handshake.',
    },
  ],
  summary: [
    'A CDN edge caches content near users, and fetches from the origin on a miss.',
    'X-Cache and Age show whether the edge answered by itself.',
    'Anycast shares one address, and routing picks the best edge.',
    'A failed edge moves packets, not connections, so open ones get RST.',
  ],
};

export default content;
