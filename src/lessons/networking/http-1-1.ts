import { CONNECTIONS, http11Code, http11Steps, YES_NO } from '../../networking/scenarios/http-1-1';
import type { LessonContent } from '../../types/lesson';

const defaults = { resources: '4', connections: '1', keepAlive: 'Yes' };
const steps = http11Steps(defaults);
const secondGet = steps.filter((step) => step.title.startsWith('First byte'))[0]!;

const content: LessonContent = {
  overview:
    'HTTP is the language of the web: a client asks for a path, and a server answers with headers and a body. HTTP/1.1 sends this as text on a TCP connection, one request at a time. This lesson fetches several files over the real TCP from earlier lessons and shows what that one rule costs.',
  concept: [
    'A request is a line such as GET /1.js HTTP/1.1, followed by headers such as Host and User-Agent. The response starts with a status such as 200 OK, followed by its own headers and the body. Open the Packet panel to read them.',
    'Each new TCP connection costs a full round trip before any request can leave. With Connection: close the server ends the connection after one response, so every file pays that price again.',
    'Keep-alive leaves the connection open, so the next request goes straight away. That was HTTP/1.1\'s big gain over HTTP/1.0.',
    'A connection still carries only one response at a time. If the first answer is slow, everything behind it waits, however ready it is. This is head-of-line blocking at the application level.',
    'So browsers open up to 6 connections per host and share the files between them. One slow response then blocks only its own connection. The price is more handshakes, and more connections each finding their own speed.',
    'The numbers are round on purpose: 8000-byte files, 1000-byte segments, and a first file that takes 100 ms longer to produce. The run has no TLS, which the next lessons add. Bodies are byte counts, and pipelining is left out because browsers never used it. To see this on a real machine, run curl -v against a site and read the headers.',
  ],
  howItWorks: [
    'The browser opens a TCP connection and sends GET with its headers.',
    'The server answers with a status, headers and the body.',
    'With keep-alive the next request reuses the connection; otherwise the server closes it.',
    'Only one response at a time fits on a connection.',
    'With 6 connections, up to 6 responses travel at once.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'resources', label: 'Resources', type: 'number', sample: defaults.resources, help: 'From 1 to 8. The first is 100 ms slow to produce.' },
      { name: 'connections', label: 'Connections', type: 'choice', sample: defaults.connections, options: CONNECTIONS },
      { name: 'keepAlive', label: 'Keep-alive', type: 'choice', sample: defaults.keepAlive, options: YES_NO },
    ],
    presets: [
      { label: 'New connection each', values: { resources: '4', connections: '1', keepAlive: 'No' } },
      { label: 'Keep-alive', values: defaults },
      { label: 'Six connections', values: { resources: '4', connections: '6', keepAlive: 'Yes' } },
    ],
    generate: http11Steps,
    codeLabel: 'Pseudocode',
  },
  code: http11Code,
  prosCons: {
    pros: ['Plain text you can read and debug by eye', 'Works through nearly every proxy and firewall', 'Keep-alive saves a handshake per request'],
    cons: ['One response at a time per connection', 'Six connections cost six handshakes', 'Headers repeat in full on every request'],
    useWhen: ['Simple APIs and internal services with few requests at a time'],
    avoidWhen: ['Pages with dozens of small files, where HTTP/2 does far better'],
  },
  applications: [
    'Most command-line tools and small API clients still use it',
    'Load balancers often speak HTTP/1.1 to the servers behind them',
    'Health checks are usually one short HTTP/1.1 request',
  ],
  commonMistakes: [
    'Thinking keep-alive allows parallel requests. It only reuses the connection, one request at a time.',
    'Blaming the network when one slow response delays others on the same connection.',
    'Opening more than 6 connections to go faster. Browsers cap it, and each one pays for slow start.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The first response has started on the only connection. When can the next GET leave?',
      view: secondGet.view,
      options: ['Once this response is complete', 'Right now, on the same connection', 'After a new TCP handshake', 'After 6 connections are open'],
      answer: 0,
      explanation: 'HTTP/1.1 carries one response at a time, so keep-alive saves the handshake but not the wait.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Keep-alive is off, there is one connection at a time, and 4 files are fetched. How many TCP handshakes happen?',
      options: ['4', '1', '6', '2'],
      answer: 0,
      explanation: 'With Connection: close, each file gets its own connection, so each pays for a handshake.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line is why a slow first response delays the second file on one connection?',
      options: ['wait for the whole response      // nothing else can use it', 'if a connection is idle: use it', 'send GET path', 'if Connection: close: the server closes it'],
      answer: 0,
      explanation: 'While a response is under way, nothing else can use that connection.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'One file is requested and the limit is 6 connections. How many open?',
      options: ['1', '6', '2', '3'],
      answer: 0,
      explanation: 'Connections open when a request needs one, so the limit is a ceiling, not a target.',
    },
  ],
  summary: [
    'HTTP/1.1 sends a text request and gets a text response, one at a time.',
    'Keep-alive reuses a connection and saves a handshake per request.',
    'A slow response blocks everything behind it on that connection.',
    'Browsers open up to 6 connections per host to work around it.',
  ],
};

export default content;
