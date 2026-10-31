import { congestionControlCode, congestionControlSteps } from '../../networking/scenarios/congestion-control';
import type { LessonContent } from '../../types/lesson';

const defaults = { queue: '10', ssthresh: '64' };
const sawtooth = { queue: '10', ssthresh: '8' };
const dropped = congestionControlSteps(sawtooth).find((step) => step.title.endsWith('queue is full'))!;

const content: LessonContent = {
  overview:
    'Nobody tells a TCP sender how fast the path is, and if everyone sent as fast as they could, routers would drown. So each sender feels for the limit: it speeds up until a packet is lost, then backs off. This lesson runs one real transfer over a slow link with a queue, and charts the window that controls it.',
  concept: [
    'A router forwards a packet at the speed of the next link. Extra packets wait in a queue, and when the queue is full the newest is dropped. That is tail drop, and it is the signal TCP reads: a lost packet means the path is full.',
    'The sender keeps a congestion window, cwnd, and never has more than that unacknowledged. It also obeys the receiver\'s window from flow control, so the limit is the smaller of the two.',
    'Slow start isn\'t slow. cwnd starts at one segment and grows by one per ACK, which doubles it every round trip. Once it reaches ssthresh, congestion avoidance takes over and it grows by about one segment per round trip.',
    'Three duplicate ACKs mean the path still works but one packet was lost. Reno sets ssthresh to half of what was in flight and carries on from there. Adding slowly and cutting in half gives the classic sawtooth on the chart.',
    'A timeout is worse news: nothing is getting through. So cwnd goes back to 1 and slow start begins again, up to the new ssthresh. A small queue that drops a whole burst can force this, as the Timeout preset shows.',
    'The numbers are round on purpose: 1000-byte segments, a first window of 1, a 10 ms-per-segment link, and 250 segments in all. Real stacks start with a window of 10, and most use CUBIC or BBR instead of Reno. CUBIC grows faster after a cut, and BBR estimates the path\'s speed instead of waiting for loss. SACK and NewReno, which handle several losses better, are left out. To see this on a real machine, run ss -i during a download and watch cwnd and ssthresh.',
  ],
  howItWorks: [
    'cwnd starts at one segment, and each ACK adds a segment in slow start.',
    'From ssthresh on, each round trip adds about one segment.',
    'When the queue overflows, a packet is lost and duplicate ACKs follow.',
    'On the third duplicate, ssthresh becomes half of what was in flight, and cwnd drops to it once the loss is repaired.',
    'On a timeout, cwnd returns to one segment and slow start runs again.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'queue', label: 'Router queue (packets)', type: 'number', sample: defaults.queue, help: 'From 2 to 40.' },
      { name: 'ssthresh', label: 'Initial ssthresh (segments)', type: 'number', sample: defaults.ssthresh, help: 'From 2 to 64.' },
    ],
    presets: [
      { label: 'Slow start', values: { queue: '40', ssthresh: '64' } },
      { label: 'Sawtooth', values: sawtooth },
      { label: 'Timeout', values: { queue: '2', ssthresh: '64' } },
    ],
    generate: congestionControlSteps,
    codeLabel: 'Pseudocode',
  },
  code: congestionControlCode,
  prosCons: {
    pros: ['Needs no help from routers', 'Finds the speed of a path it knows nothing about', 'Many flows that use it tend to share a link fairly'],
    cons: ['Reno treats every loss as congestion', 'It keeps filling queues until they overflow', 'Slow to recover on a long, fast path'],
    useWhen: ['Always on the public internet: unchecked senders would collapse it'],
    avoidWhen: ['Choosing Reno for long, fast paths. CUBIC or BBR suit them far better'],
  },
  applications: [
    'Linux uses CUBIC by default, and BBR can be enabled for a whole server',
    'Video players read the rate TCP finds to choose a quality',
    'New connections reuse a recent ssthresh on some stacks, to skip the guessing',
  ],
  commonMistakes: [
    'Mixing up cwnd and the advertised window. One protects the network, the other the receiver.',
    'Thinking slow start is gentle. It doubles every round trip.',
    'Assuming every loss means congestion. On Wi-Fi, a lost packet may be radio noise.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The Router\'s queue just overflowed and dropped a segment. What does the sender notice first?',
      view: dropped.view,
      options: ['Duplicate ACKs from the later segments', 'A message from the Router', 'An RST from the Server', 'A window of 0'],
      answer: 0,
      explanation: 'Routers send no warning. Later segments arrive after the gap, and each draws a duplicate ACK.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'cwnd is 4 in slow start, and no packets are lost. What is it one round trip later?',
      options: ['8', '5', '4', '6'],
      answer: 0,
      explanation: 'Each of the 4 ACKs adds a segment, so the window doubles.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes a timeout hurt more than three duplicate ACKs?',
      options: ['cwnd = 1 segment', 'cwnd = ssthresh + 3 segments', 'on the next new ACK: cwnd = ssthresh', 'if cwnd < ssthresh: cwnd += 1 segment'],
      answer: 0,
      explanation: 'A timeout restarts from one segment, while duplicate ACKs only halve the window.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does Reno treat three duplicate ACKs more gently than a timeout?',
      options: ['Duplicate ACKs show that packets are still getting through', 'Duplicate ACKs always arrive sooner than a real loss', 'A timeout means the receiver is full', 'A timeout means the path has changed'],
      answer: 0,
      explanation: 'Each duplicate ACK was caused by a later segment arriving, so the path still works.',
    },
  ],
  summary: [
    'A full queue drops packets, and that loss is TCP\'s signal.',
    'Slow start doubles the window per round trip, up to ssthresh.',
    'Avoidance adds about one segment per round trip, and a loss halves it.',
    'A timeout restarts from one segment.',
  ],
};

export default content;
