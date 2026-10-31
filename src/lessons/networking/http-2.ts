import { http2Code, http2Steps, LOST } from '../../networking/scenarios/http-2';
import { withoutPanel } from '../../networking/steps';
import type { LessonContent } from '../../types/lesson';

const defaults = { resources: '4', lost: 'None' };
const lostPacket = { resources: '4', lost: 'Segment 3' };
const hold = http2Steps(lostPacket).find((step) => step.title.includes('ahead of a gap'))!;

const content: LessonContent = {
  overview:
    'HTTP/1.1 needs a connection per response in flight, and six of them is still a queue. HTTP/2 puts every request on one connection, as numbered streams that take turns. This lesson runs it over the real TCP, and shows the gain as well as the new problem that comes with it.',
  concept: [
    'HTTP/2 cuts each message into frames, and every frame names its stream. A HEADERS frame opens a stream, and DATA frames carry the body. Frames from different streams can mix on the wire, so a slow response no longer blocks a fast one.',
    'Here the server sends streams in turn, 1000 bytes of DATA at a time. Watch the ladder: DATA 1, DATA 3, DATA 5 and so on. All of it goes through one TCP connection, so there is only one handshake and one congestion window to grow.',
    'Headers repeat almost word for word on every request. HTTP/2 keeps a table on each end of the connection, so a field seen before costs only 2 bytes. The first request pays in full, and the ones after it shrink.',
    'TCP doesn\'t know about streams. It delivers one line of bytes in order, so when a segment is lost, every byte after it waits, whichever stream it belongs to. That is head-of-line blocking again, now one layer down, and all streams stall together.',
    'Each stream number is odd because the client opens them. TLS comes first here, because browsers only use HTTP/2 over TLS. This run counts TLS\'s round trips and real sizes, but nothing is encrypted: see Certificates & TLS for what the handshake really does.',
    'The numbers are round on purpose: 8000-byte files, 1000-byte DATA frames, 1000-byte segments and an exact header table of our own, in place of the real HPACK. The window starts at 3 segments on the server so its certificate fits, where real servers start at 10. Stream priorities, flow control per stream and server push are left out. To see this on a real machine, run curl --http2 -v and look for the stream numbers.',
  ],
  howItWorks: [
    'The client opens one TCP connection and runs TLS.',
    'Each request becomes a stream with a HEADERS frame, compressed by the table.',
    'The server sends streams in turn, one DATA frame at a time.',
    'Frames from every stream share one congestion window.',
    'A lost segment holds up every byte behind it, on every stream.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'resources', label: 'Resources', type: 'number', sample: defaults.resources, help: 'From 2 to 6.' },
      { name: 'lost', label: 'Lost', type: 'choice', sample: defaults.lost, options: LOST, help: 'The nth packet carrying response data.' },
    ],
    presets: [
      { label: 'Multiplexing', values: defaults },
      { label: 'Header compression', values: { resources: '6', lost: 'None' } },
      { label: 'Lost packet', values: lostPacket },
    ],
    generate: http2Steps,
    codeLabel: 'Pseudocode',
  },
  code: http2Code,
  prosCons: {
    pros: ['One connection and one handshake for a whole page', 'A slow response no longer blocks a fast one', 'Repeated headers cost almost nothing'],
    cons: ['One lost packet stalls every stream', 'All traffic depends on one congestion window', 'Harder to read on the wire than plain text'],
    useWhen: ['Pages and APIs with many requests to one host'],
    avoidWhen: ['Very lossy links, where HTTP/3 stalls far less'],
  },
  applications: [
    'Most browser traffic to large sites runs on HTTP/2 or HTTP/3',
    'gRPC is built on HTTP/2 streams',
    'CDNs speak it to browsers even when their origins use HTTP/1.1',
  ],
  commonMistakes: [
    'Thinking multiplexing removes all blocking. It only removes it above TCP.',
    'Keeping old tricks such as file bundling and many hostnames. They can undo its gains.',
    'Assuming header compression shrinks the body. It only covers headers.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'One segment is missing, and later bytes have arrived. Which streams can read their data now?',
      view: withoutPanel(hold.view, 'Streams'),
      options: ['None of the unfinished streams', 'All but the stream that lost a segment', 'Only the stream with the lowest number', 'Any stream with its HEADERS'],
      answer: 0,
      explanation: 'TCP won\'t hand over any byte past the gap, and it doesn\'t know which stream a byte belongs to.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A request repeats 6 header fields seen before on this connection. How many bytes do they cost here?',
      options: ['12', '2', '6', '120'],
      answer: 0,
      explanation: 'Each repeated field costs 2 bytes, so 6 of them cost 12.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes streams share the connection fairly?',
      options: ['for each stream, in turn:', 'open one connection, then TLS', 'stream = next odd number', 'if a segment is lost: hold everything after it'],
      answer: 0,
      explanation: 'Taking turns means no single response fills the connection.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How many TCP handshakes does a page of 6 files need on HTTP/2?',
      options: ['1', '6', '2', '12'],
      answer: 0,
      explanation: 'Every stream shares one connection, so one handshake covers them all.',
    },
  ],
  summary: [
    'HTTP/2 sends many streams on one connection, as mixed frames.',
    'A header table makes repeated fields cost almost nothing.',
    'One connection means one handshake and one congestion window.',
    'TCP sees one line of bytes, so a lost segment stalls every stream.',
  ],
};

export default content;
