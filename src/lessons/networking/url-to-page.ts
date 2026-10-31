import { DNS_MODES, LOST, PROTOCOLS, urlToPageCode, urlToPageSteps } from '../../networking/scenarios/url-to-page';
import type { LessonContent } from '../../types/lesson';

const defaults = { protocol: PROTOCOLS[1]!, dns: DNS_MODES[0]!, lost: LOST[0]! };
const hello = urlToPageSteps(defaults).find((step) => step.title.startsWith('SYN from'))!;

const content: LessonContent = {
  overview:
    'You type an address and a page appears. This lesson runs everything in between as one real simulation: a name becomes an address, a connection opens, TLS runs, HTTP fetches the page, and the page asks for more. The waterfall shows where the time goes.',
  concept: [
    'First comes the name. Unless the browser already knows the address, it asks a resolver, as in the DNS lesson. Here the resolver already knows who runs example.com, so it asks the authoritative server once.',
    'Next, the connection. HTTP/1.1 and HTTP/2 need a TCP handshake and then TLS, which is two round trips before any request can leave. HTTP/3 does both in one QUIC exchange, so it has one bar where the others have two.',
    'Then HTTP. The browser fetches the page itself, and only when it has that page can it know what else is needed. That is why the three other files start late, once the page has arrived.',
    'The waterfall is the whole story of a page load. Everything before the first byte is setup, and it is mostly round trips, not bandwidth. A faster link helps less than you would think: cutting one round trip often matters more.',
    'A single lost packet shows up as one bar that runs long. On HTTP/1.1 it holds up one connection, on HTTP/2 every stream, and on HTTP/3 one stream. Here Packet 3 is the last piece of the page itself, so everything behind it waits for the timer on all three.',
    'The numbers are round on purpose: a 2000-byte page, 3 files of 8000 bytes, and a 10 ms-per-segment link. On HTTP/1.1 the extra connections pay for TCP and TLS too, and the waterfall draws only the first. Nothing here is encrypted: see Certificates & TLS for what the handshake does. Parsing, rendering, JavaScript, images in the browser cache and redirects are left out. To see this on a real machine, open the browser\'s Network panel and read the waterfall of any page.',
  ],
  howItWorks: [
    'The browser turns the name into an address, unless it has it cached.',
    'It opens a connection: TCP then TLS, or one QUIC handshake.',
    'It sends GET /index.html and reads the page.',
    'The page names other files, and the browser fetches those.',
    'The waterfall shows setup first, then the page, then its files.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'protocol', label: 'Protocol', type: 'choice', sample: defaults.protocol, options: PROTOCOLS },
      { name: 'dns', label: 'DNS', type: 'choice', sample: defaults.dns, options: DNS_MODES },
      { name: 'lost', label: 'Lost', type: 'choice', sample: defaults.lost, options: LOST, help: 'The third packet carrying response data.' },
    ],
    presets: [
      { label: 'First visit', values: defaults },
      { label: 'Cached DNS', values: { protocol: 'HTTP/2', dns: 'Cached', lost: 'None' } },
      { label: 'HTTP/3', values: { protocol: 'HTTP/3', dns: 'Cold', lost: 'None' } },
      { label: 'Lost packet', values: { protocol: 'HTTP/1.1', dns: 'Cold', lost: 'Packet 3' } },
    ],
    generate: urlToPageSteps,
    codeLabel: 'Pseudocode',
  },
  code: urlToPageCode,
  prosCons: {
    pros: ['Every layer does one job, and they stack cleanly', 'Caches at each level skip whole steps', 'The waterfall shows exactly where time goes'],
    cons: ['Setup costs several round trips before any content', 'Each dependency adds a wait', 'A distant server makes every step slower'],
    useWhen: ['Debugging a slow page: start from the waterfall'],
    avoidWhen: ['Tuning bandwidth first, when round trips are the real cost'],
  },
  applications: [
    'Performance budgets are built around time to first byte',
    'Preconnect and DNS prefetch hints skip the first bars',
    'CDNs shorten every bar by moving the server closer',
  ],
  commonMistakes: [
    'Blaming the server for time spent in DNS or TLS.',
    'Buying bandwidth when the delay is round trips.',
    'Forgetting that a page\'s files can\'t start until the page itself arrives.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The SYN has just left, on HTTP/2. What must happen before GET /index.html can go?',
      view: hello.view,
      options: ['The handshake finishes, and then TLS', 'Only the SYN ACK has to arrive', 'Nothing: it can go now', 'A DNS lookup for each file'],
      answer: 0,
      explanation: 'TCP and then TLS each need a round trip before the first request leaves.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Which row is missing from the waterfall on HTTP/3?',
      options: ['TCP', 'DNS', '/index.html', '/a.js'],
      answer: 0,
      explanation: 'QUIC replaces TCP, and its one handshake covers TLS too.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line means files can\'t start until the page has arrived?',
      options: ['read it, and find what else the page needs', 'address = cached, or lookup(name)', 'HTTP/3: one QUIC handshake', 'GET /index.html'],
      answer: 0,
      explanation: 'The browser only learns about the other files by reading the page.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'What usually dominates the time before the first byte?',
      options: ['Round trips', 'Bandwidth', 'Page size', 'The number of files'],
      answer: 0,
      explanation: 'DNS, TCP and TLS exchange tiny messages, so distance matters more than speed.',
    },
  ],
  summary: [
    'A page load runs DNS, then a connection, then TLS, then HTTP.',
    'HTTP/3 merges the connection and TLS into one round trip.',
    'Files can\'t start until the page that names them has arrived.',
    'Time before the first byte is mostly round trips, not bandwidth.',
  ],
};

export default content;
