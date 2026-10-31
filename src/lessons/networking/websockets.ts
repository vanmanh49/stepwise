import { SCENES, websocketsCode, websocketsSteps } from '../../networking/scenarios/websockets';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]! };
const upgrade = websocketsSteps(defaults).find((step) => step.title.startsWith('GET /chat'))!;

const content: LessonContent = {
  overview:
    'HTTP only speaks when spoken to: a server can\'t send anything until a client asks. Chat, live scores and shared documents need the opposite. A WebSocket turns one HTTP request into a connection where either side can send at any time. This lesson runs it on the real TCP, and sets it against polling.',
  concept: [
    'A WebSocket starts as an ordinary HTTP/1.1 request with Upgrade: websocket. That lets it pass through anything that understands HTTP. The server agrees with 101 Switching Protocols, and from then on the connection carries frames, not HTTP.',
    'The Sec-WebSocket-Key and Sec-WebSocket-Accept headers prove the server really speaks WebSocket, and isn\'t an old cache replaying an answer. Open the Packet panel on the two messages to read them.',
    'After that, either side sends a frame whenever it likes, with only a few bytes of header. There is no request to wait for, so a message reaches the other side as fast as the path allows.',
    'Polling is the alternative: ask "anything new?" every second. Each message then waits for the next poll, and every poll carries a full set of HTTP headers, whether or not there is news. The Polling compared scene counts both, with the same 3 messages.',
    'A quiet TCP connection says nothing, so a peer that vanished looks the same as one with nothing to say. So one side sends a ping every second. After 2 pings go unanswered, it calls the peer dead and closes.',
    'The numbers are round on purpose: 100-byte messages, a ping every 1000 ms, and 2 missed pongs. Real apps ping every 20 to 60 seconds. The accept value is the example from the standard, because nothing is hashed here. Masking of client frames, fragmented messages and TLS are left out. To see this on a real machine, open the browser\'s Network panel, filter by WS, and read the frames of a live chat page.',
  ],
  howItWorks: [
    'The client sends GET with Upgrade: websocket on a TCP connection.',
    'The server answers 101 Switching Protocols, with the accept value.',
    'Either side sends frames at any time, on the same connection.',
    'The client pings every second, and the server answers with a pong.',
    'Two missed pongs mean the peer is dead. A clean end trades close frames.',
  ],
  visualization: {
    kind: 'form',
    fields: [{ name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES }],
    presets: SCENES.map((scene) => ({ label: scene, values: { scene } })),
    generate: websocketsSteps,
    codeLabel: 'Pseudocode',
  },
  code: websocketsCode,
  prosCons: {
    pros: ['The server can send with no request', 'Each frame costs only a few bytes of header', 'Starts as HTTP, so it passes most firewalls and proxies'],
    cons: ['Every open client holds a connection on the server', 'Load balancers must keep a client on one server', 'You must handle reconnects and missed messages yourself'],
    useWhen: ['Chat, live dashboards, games and shared editing'],
    avoidWhen: ['Occasional updates, where a plain request or server-sent events are simpler'],
  },
  applications: [
    'Chat apps push each message the moment it is sent',
    'Trading screens stream prices as they change',
    'Shared editors send every keystroke to the other people in a document',
  ],
  commonMistakes: [
    'Assuming TCP will report a dead peer. On a quiet connection it won\'t.',
    'Forgetting that a dropped connection loses messages unless the app can catch up.',
    'Reaching for a WebSocket when one-way updates would do.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client has asked to upgrade. What status does a willing server answer with?',
      view: upgrade.view,
      options: ['101', '200', '301', '404'],
      answer: 0,
      explanation: '101 Switching Protocols says the connection stops being HTTP from here on.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A client polls every 1000 ms. A message arrives at the server just after a poll. How long does it wait?',
      options: ['Almost a whole second', 'One round trip', 'Nothing', 'Two seconds'],
      answer: 0,
      explanation: 'It sits on the server until the next poll comes in.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line notices a peer that vanished silently?',
      options: ['if 2 pings in a row went unanswered: the peer is dead', 'server answers 101 Switching Protocols', 'send a frame', 'send a close frame, and wait for one back'],
      answer: 0,
      explanation: 'A vanished peer sends no close frame, so only the missing pongs give it away.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does a WebSocket begin with an HTTP request at all?',
      options: ['It passes through anything that understands HTTP', 'TCP requires HTTP before any data', 'Frames are only allowed after a GET', 'It makes frames smaller'],
      answer: 0,
      explanation: 'Starting as HTTP reuses ports 80 and 443, and the proxies and firewalls already in place.',
    },
  ],
  summary: [
    'A WebSocket is an HTTP request upgraded into a two-way connection.',
    'Either side sends frames at any time, with no request first.',
    'Polling makes each message wait, and pays for full headers every time.',
    'Pings find a dead peer that TCP alone would never report.',
  ],
};

export default content;
