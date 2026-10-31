import { flowControlCode, flowControlSteps } from '../../networking/scenarios/flow-control';
import type { LessonContent } from '../../types/lesson';

const defaults = { buffer: '8000', rate: '200' };
const paused = flowControlSteps({ ...defaults, rate: '0' });
const zero = paused.find((step) => step.title.endsWith('window 0'))!;

const content: LessonContent = {
  overview:
    'A fast sender can bury a slow program. TCP stops that by having the receiver say how much room it has left, in every segment it sends. This lesson sends 16,000 bytes to a program that reads quickly, slowly or not at all, and shows the advertised window doing the work.',
  concept: [
    'Arriving bytes wait in a receive buffer until the program reads them. If nothing limited the sender, a slow program would overflow the buffer and the extra bytes would be thrown away.',
    'Every segment carries a window field: the free space in the sender\'s own receive buffer. The other side may never have more than that many bytes unacknowledged. This is flow control, and it protects the receiver. Congestion control, the next lesson, protects the network.',
    'A fast reader keeps the buffer nearly empty, so the window stays close to the buffer size and the link sets the speed. A slow reader fills the buffer, the window shrinks, and the sender is held to the speed of the program.',
    'If the program stops reading, the window reaches 0 and the sender must stop. When the program reads again, the receiver sends a window update once it has room for a full segment.',
    'That update is a plain ACK, and it could be lost. Both sides would then wait forever. So a sender facing a window of 0 sends a 1-byte probe at each timeout, which always gets an answer with the current window.',
    'The numbers are round on purpose: 1000-byte segments, a buffer you choose, and a paused program that reads again at 2 s. The sender\'s own window is set high, so that only the receiver limits it. Window scaling is left out, though real connections need it for windows over 64 KB. To see this on a real machine, run ss -i and look at rcv_space, snd_wnd and the rwnd_limited time.',
  ],
  howItWorks: [
    'The receiver puts each segment in its buffer and advertises the free space.',
    'The sender keeps unacknowledged bytes within that window.',
    'As the program falls behind, the window shrinks.',
    'At a window of 0 the sender stops, and sends a 1-byte probe at each timeout.',
    'When at least one full segment is free again, the receiver sends a window update.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'buffer', label: 'Buffer (bytes)', type: 'number', sample: defaults.buffer, help: 'From 2000 to 64000.' },
      { name: 'rate', label: 'Read rate (bytes/ms)', type: 'number', sample: defaults.rate, help: 'From 0 to 200. At 0 the program waits until 2 s, then reads at 200.' },
    ],
    presets: [
      { label: 'Fast reader', values: defaults },
      { label: 'Slow reader', values: { ...defaults, rate: '20' } },
      { label: 'Paused reader', values: { ...defaults, rate: '0' } },
    ],
    generate: flowControlSteps,
    codeLabel: 'Pseudocode',
  },
  code: flowControlCode,
  prosCons: {
    pros: ['A slow program never loses data to a full buffer', 'It needs no setup: the window is in every segment', 'The sender slows down by itself as the program falls behind'],
    cons: ['A small buffer limits speed on a long path', 'A paused program stalls the sender', 'Probes are needed so that a lost update can\'t cause a deadlock'],
    useWhen: ['Always: TCP does this on every connection'],
    avoidWhen: ['Tuning the buffer before checking the program. A slow reader needs fixing, not a bigger buffer'],
  },
  applications: [
    'A stalled database client shows up as a zero window on the server\'s side',
    'Streaming a large file to a slow disk slows the sender through this window',
    'Bigger receive buffers let a connection use a long, fast path',
  ],
  commonMistakes: [
    'Mixing up flow control and congestion control. One protects the receiver, the other the network.',
    'Thinking a window of 0 means a broken connection. It means the program isn\'t reading.',
    'Expecting a lost window update to hang forever. Probes exist for exactly that.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The receiver has just advertised a window of 0, and more data is waiting to be sent. What does the sender do?',
      view: zero.view,
      options: ['Stops, then sends a 1-byte probe when its timer runs out', 'Sends the next segment anyway', 'Resets the connection', 'Halves its sending rate and carries on'],
      answer: 0,
      explanation: 'A window of 0 forbids data, but a probe keeps the two sides from waiting on each other forever.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'What does the window field in a segment mean?',
      options: ['Free space in the receive buffer of the side that sent it', 'The bytes that sender has in flight', 'The size of the next segment', 'The capacity of the path'],
      answer: 0,
      explanation: 'It tells the other side how much more this side can take right now.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line reopens a window that had closed?',
      options: ['if window reopened: send window update', 'buffer.add(segment)', 'while inFlight < peerWindow:', 'send ACK(next, window)'],
      answer: 0,
      explanation: 'Reading frees space, and the update tells the sender it can go again.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'A transfer from a fast server to a laptop is slow, and the laptop\'s window is often 0. Where is the problem?',
      options: ['The program on the laptop isn\'t reading fast enough', 'The network is congested', 'The server\'s disk is slow', 'Packets are being lost on the path'],
      answer: 0,
      explanation: 'A window of 0 means the receiver\'s buffer is full, so its own program is the bottleneck.',
    },
  ],
  summary: [
    'The advertised window is the free space in the receive buffer.',
    'A sender never has more unacknowledged bytes than that.',
    'A slow program slows the sender, and nothing is lost.',
    'At a window of 0 the sender probes until the window reopens.',
  ],
};

export default content;
