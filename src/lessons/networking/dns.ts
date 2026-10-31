import { dnsCode, dnsSteps, NAMES, SCENES } from '../../networking/scenarios/dns';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]!, name: NAMES[0]! };
const cold = dnsSteps(defaults);
const referral = cold.find((step) => step.title.startsWith('Root refers'))!;

const content: LessonContent = {
  overview:
    'Computers route packets by address, but people remember names. DNS turns one into the other. No single server knows every name, so a resolver walks down a tree, asking one server after another. This lesson runs real queries over UDP, with a real cache behind them.',
  concept: [
    'A name reads right to left. www.example.com sits under example.com, which sits under com, which sits under the root. Each level knows only who runs the level below it.',
    'Your machine has a small stub that asks one question and waits. The hard work belongs to a recursive resolver, usually run by your ISP or a public service. It starts at the root and follows referrals until a server gives a final answer.',
    'A referral is an NS record: "I don\'t know that name, but this server runs that zone". The final answer here is an A record, which maps a name to an IPv4 address.',
    'Every record has a TTL, a number of seconds it may be kept. Inside the TTL the resolver answers from its cache with no traffic past itself. That is why DNS copes with the whole internet, and also why a changed record takes time to reach everyone.',
    'NXDOMAIN is an answer, not a failure: the name really doesn\'t exist. A lost packet is different. UDP tells nobody, so the client and the resolver each run their own timer and ask again.',
    'The numbers are round on purpose: a TTL of 60 s, a 1 s retry and 2 retries. Real root servers are many machines behind 13 addresses, and resolvers already know them. A resolver answers with extra address records that this run keeps in one list. Failed names are cached by real resolvers, and not here. Also left out are IPv6, DNSSEC, DNS over HTTPS, and TCP for long answers. To see this on a real machine, run dig +trace www.example.com and read each referral.',
  ],
  howItWorks: [
    'The stub asks the resolver for the name.',
    'The resolver checks its cache. A fresh record is answered at once.',
    'Otherwise it asks the root, which refers it to the TLD server.',
    'The TLD server refers it to the zone\'s authoritative server.',
    'The authoritative server gives the final answer, and the resolver caches it for the TTL.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES },
      { name: 'name', label: 'Name', type: 'choice', sample: defaults.name, options: NAMES },
    ],
    presets: [
      { label: 'Cold lookup', values: defaults },
      { label: 'Cached', values: { scene: 'Cached', name: 'www.example.com' } },
      { label: 'No such name', values: { scene: 'No such name', name: 'nothing.example.com' } },
      { label: 'Lost query', values: { scene: 'Lost query', name: 'www.example.com' } },
    ],
    generate: dnsSteps,
    codeLabel: 'Pseudocode',
  },
  code: dnsCode,
  prosCons: {
    pros: ['No single machine has to hold every name', 'Caching keeps most lookups local', 'Each zone is run by whoever owns it'],
    cons: ['A cached record can be out of date for its whole TTL', 'Plain DNS is readable by anyone on the path', 'A slow lookup delays everything that follows'],
    useWhen: ['Always: it is how names become addresses on the internet'],
    avoidWhen: ['Setting a long TTL just before you plan to move a service'],
  },
  applications: [
    'Every browser and app looks up a name before connecting',
    'Services move between machines by changing an A record',
    'Mail finds its way through MX records, which work the same way',
  ],
  commonMistakes: [
    'Thinking a DNS change is instant. Old answers live on until their TTL ends.',
    'Treating NXDOMAIN as a network failure. The network worked; the name is missing.',
    'Thinking the root knows every name. It only knows who runs each TLD.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The root server has just answered. Who does the resolver ask next?',
      view: referral.view,
      options: ['The TLD server for com', 'The client', 'The root again, for the full address', 'The web server'],
      answer: 0,
      explanation: 'The root only knows who runs com, so its referral sends the resolver one level down.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A record has a TTL of 60 s. A second lookup comes 5 s after the first. How many queries go past the resolver?',
      options: ['0', '1', '3', '2'],
      answer: 0,
      explanation: 'The record is still fresh, so the resolver answers from its cache.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops a name that doesn\'t exist from being retried?',
      options: ['if NXDOMAIN: reply NXDOMAIN', 'no answer in 1 s: ask again, up to 2 times', 'server = the closest zone in the cache, else the root', 'if it refers: cache the referral, server = next'],
      answer: 0,
      explanation: 'NXDOMAIN is a real answer, so it goes straight back to the client.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does DNS need its own retry timer?',
      options: ['UDP doesn\'t resend or report lost datagrams', 'The root server asks it to retry', 'TTLs expire during a lookup', 'TCP is too fast for a lookup'],
      answer: 0,
      explanation: 'UDP gives no delivery signal, so silence is the only clue, and a timer is how you act on it.',
    },
  ],
  summary: [
    'DNS turns names into addresses by walking down a tree of servers.',
    'The stub asks one question; the recursive resolver does the walk.',
    'A TTL says how long an answer may be cached.',
    'NXDOMAIN is an answer. A lost query is silence, so a timer retries it.',
  ],
};

export default content;
