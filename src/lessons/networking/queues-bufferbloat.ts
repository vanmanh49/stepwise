import { BUFFERS, queuesBufferbloatCode, queuesBufferbloatSteps } from '../../networking/scenarios/queues-bufferbloat';
import type { LessonContent } from '../../types/lesson';

const defaults = { buffer: BUFFERS[0]! };
const huge = queuesBufferbloatSteps({ buffer: BUFFERS[2]! });
const filling = huge[huge.findIndex((step) => step.title.endsWith('queue is full')) - 1]!;

const content: LessonContent = {
  overview:
    'Buffers exist to absorb bursts, so bigger ought to be better. It isn\'t. On a busy link, a bigger buffer just fills up, and every packet waits behind all the others. This lesson runs the same transfer through three buffer sizes and charts what a packet feels: the time it spends in line.',
  concept: [
    'A packet\'s round trip has two parts: the delay of the path itself, and the time it waits in queues. The first is fixed. The second depends on how many packets are ahead of it.',
    'TCP keeps sending faster until a packet is lost, and a queue only loses packets when it is full. So a TCP download will fill whatever buffer it meets. A bigger buffer doesn\'t stop the drops. It only postpones them, with more packets waiting.',
    'Here each packet takes 10 ms to send, so a queue of 100 packets adds a whole second to every round trip. Throughput barely changes, because the link sends at the same speed whatever the queue holds. That is bufferbloat: all of the delay, and none of the speed.',
    'Everyone sharing the link pays. A video call or a game beside a large download feels the full queue, even though it sends very little. This is why a home network can feel broken while someone uploads a file.',
    'A small buffer has a real cost too: drops come sooner and a burst may be lost. A common rule is a buffer of about one bandwidth-delay product, enough to keep the link busy after the sender halves its window.',
    'The cure is a smarter queue. Active queue management such as CoDel drops packets before the buffer is full, based on how long they have been waiting, and fq_codel gives each flow its own line. Both are left out here, and so are other flows sharing the link. Each run moves 800 segments of 1000 bytes, with a receive buffer and ssthresh set high, so that only the queue limits the sender. Each point is the round trip a packet joining the queue at that moment would see. To see this on a real machine, run ping during a large download and compare the times with an idle link.',
  ],
  howItWorks: [
    'The link sends one packet every 10 ms, whatever arrives.',
    'Packets arriving faster than that wait in the Router\'s buffer.',
    'TCP keeps growing its window, so the queue keeps growing.',
    'Each packet in the queue adds 10 ms to every round trip.',
    'Only when the buffer overflows does TCP slow down, and then it fills it again.',
  ],
  visualization: {
    kind: 'form',
    fields: [{ name: 'buffer', label: 'Router buffer (packets)', type: 'choice', sample: defaults.buffer, options: BUFFERS }],
    presets: [
      { label: 'Small buffer', values: defaults },
      { label: 'Big buffer', values: { buffer: BUFFERS[1]! } },
      { label: 'Huge buffer', values: { buffer: BUFFERS[2]! } },
    ],
    generate: queuesBufferbloatSteps,
    codeLabel: 'Pseudocode',
  },
  code: queuesBufferbloatCode,
  prosCons: {
    pros: ['A buffer absorbs short bursts without loss', 'A modest queue keeps the link busy after TCP backs off'],
    cons: ['A full buffer adds delay to everyone on the link', 'It delays the loss signal TCP is waiting for', 'Bigger buffers add no throughput on a busy link'],
    useWhen: ['Sizing a queue near one bandwidth-delay product'],
    avoidWhen: ['Raising a buffer to fix a slow link. It makes the delay worse and the speed no better'],
  },
  applications: [
    'Home routers with fq_codel keep calls smooth during uploads',
    'Speed tests now report "latency under load" as well as speed',
    'Cloud load balancers and switches tune queues to limit tail latency',
  ],
  commonMistakes: [
    'Thinking drops mean the buffer is too small. A drop is how TCP learns to slow down.',
    'Measuring latency on an idle link. Bufferbloat only shows under load.',
    'Blaming the server for a slow connection when the queue is on your own uplink.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This is the Huge buffer run, with the queue growing and no packets lost yet. What does the round trip do next?',
      view: filling.view,
      options: ['Keeps climbing as the queue grows', 'Falls, because the link speeds up', 'Stays flat at the path delay', 'Drops to 0 once the queue is full'],
      answer: 0,
      explanation: 'Each extra packet in line adds 10 ms, and nothing has told the sender to slow down.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A router\'s buffer grows from 20 packets to 100. What happens to a TCP download\'s speed through it?',
      options: ['About the same, because the link sets the speed', 'Five times faster', 'Five times slower', 'It stops once the buffer fills'],
      answer: 0,
      explanation: 'The queue fills either way, and the link sends at the same rate.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line explains why a full queue slows everyone down?',
      options: ['time in queue = packets ahead * 10 ms', 'on loss: halve cwnd', 'if queue is full: drop it', 'every 10 ms: send the packet at the front'],
      answer: 0,
      explanation: 'Every packet in the line adds to the wait for those behind it.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How do you spot bufferbloat on your own connection?',
      options: ['Ping during a large transfer, and compare with an idle link', 'Run ping on an idle link', 'Check the speed test\'s download figure', 'Count the hops with traceroute'],
      answer: 0,
      explanation: 'It only appears under load, as a large rise in round-trip time.',
    },
  ],
  summary: [
    'A round trip is the path delay plus the time in queues.',
    'TCP fills whatever buffer it meets.',
    'A bigger buffer adds delay and no speed on a busy link.',
    'Smarter queues such as CoDel drop early, so the line stays short.',
  ],
};

export default content;
