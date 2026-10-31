import { LOST_OPTIONS, reliableDeliveryCode, reliableDeliverySteps, WINDOWS } from '../../networking/scenarios/reliable-delivery';
import type { LessonContent } from '../../types/lesson';

const defaults = { segments: '6', window: WINDOWS[1]!, lost: LOST_OPTIONS[0]! };
const third = reliableDeliverySteps({ ...defaults, lost: 'Segment 2' }).filter((step) => step.title === 'ACK 2001 again').at(-1)!;

const content: LessonContent = {
  overview:
    'IP may lose packets, and TCP promises a clean stream of bytes anyway. It does that with three ideas: number every byte, acknowledge what has arrived, and send again what hasn\'t. This lesson sends a few segments, loses one, and shows which part of TCP puts it back.',
  concept: [
    'TCP numbers bytes, not packets. A segment with sequence number 2001 and 1000 bytes covers bytes 2001 to 3000, so the next one starts at 3001.',
    'ACKs are cumulative. ACK 4001 means "I have everything before byte 4001, and that is the next byte I need". One ACK can therefore cover for an earlier ACK that was lost.',
    'The window is how many bytes may be unacknowledged at once. With a window of 1, the sender waits a whole round trip per segment. With a window of 4 it keeps sending while the ACKs come back, which is far quicker.',
    'A segment that arrives after a gap is held, and the receiver repeats its last ACK. Those duplicate ACKs tell the sender that later data is getting through. The third duplicate means the missing segment is almost certainly lost, so it is sent again at once. That is fast retransmit.',
    'If nothing comes back, only the timer can help. Losing the last segment makes no later data, so no duplicate ACKs. The retransmission timeout starts at 1 s and doubles each time it fires. Once real round trips are measured, it falls toward its 200 ms minimum. A retransmitted segment is never measured, because its ACK could belong to either copy.',
    'After 5 retries with no progress, TCP gives up and resets the connection.',
    'This lesson fixes the window so congestion control can\'t hide the story, and the segments are 1000 bytes on purpose. Delayed ACKs and SACK are left out. Real ACKs often cover two segments, and SACK says exactly which ranges arrived. To see this on a real machine, capture a transfer in Wireshark and look for "TCP Dup ACK" and "TCP Retransmission".',
  ],
  howItWorks: [
    'The sender sends up to a window of numbered segments.',
    'The receiver answers each one with the next byte it needs.',
    'A segment after a gap is held, and the ACK is repeated.',
    'On the third duplicate ACK, the sender resends the oldest unacknowledged segment.',
    'If the timer runs out first, it resends that segment and doubles the timer.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'segments', label: 'Segments', type: 'number', sample: defaults.segments, help: 'From 1 to 8, each 1000 bytes.' },
      { name: 'window', label: 'Window (segments)', type: 'choice', sample: defaults.window, options: WINDOWS },
      { name: 'lost', label: 'Lost packet', type: 'choice', sample: defaults.lost, options: LOST_OPTIONS, help: 'ACK 1 is the first ACK for data.' },
    ],
    presets: [
      { label: 'No loss', values: defaults },
      { label: 'Timeout', values: { ...defaults, lost: 'Segment 6' } },
      { label: 'Fast retransmit', values: { ...defaults, lost: 'Segment 2' } },
      { label: 'Lost ACK', values: { ...defaults, lost: 'ACK 1' } },
    ],
    generate: reliableDeliverySteps,
    codeLabel: 'Pseudocode',
  },
  code: reliableDeliveryCode,
  prosCons: {
    pros: ['The program sees every byte once, in order', 'Duplicate ACKs recover a loss in about one round trip', 'One ACK can stand in for a lost ACK'],
    cons: ['A lost segment holds back the bytes behind it', 'A lost last segment waits for the timer', 'Repeated timeouts double the wait each time'],
    useWhen: ['The data must be complete and in order, as in files, web pages and database traffic'],
    avoidWhen: ['Fresh data beats complete data, as in live audio. Waiting for a resend only adds delay'],
  },
  applications: [
    'Every HTTP/1 and HTTP/2 download depends on this recovery',
    'Wireshark labels duplicate ACKs and retransmissions in a capture',
    'Monitoring a server\'s retransmission rate is a quick check of network health',
  ],
  commonMistakes: [
    'Thinking sequence numbers count packets. They count bytes.',
    'Reading ACK n as "I got byte n". It means "I need byte n next".',
    'Expecting fast retransmit to catch every loss. It needs later segments to make the duplicate ACKs.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'This is the third duplicate ACK for byte 2001. What does the sender do?',
      view: third.view,
      options: ['Sends the segment at 2001 again now', 'Waits for its timer to run out', 'Sends the whole window again', 'Resets the connection'],
      answer: 0,
      explanation: 'Three duplicates show that later data is arriving, so this segment is treated as lost straight away.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A sender with a window of 4 loses its last segment. Why does recovery need the timer?',
      options: ['No later segments means no duplicate ACKs', 'The window is too small', 'Fast retransmit only works on SYN', 'The receiver discards the gap'],
      answer: 0,
      explanation: 'Duplicate ACKs come from data arriving after the gap. Nothing follows the last segment.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops one lost ACK from causing a resend?',
      options: ['on ACK n: everything before n arrived, so restart the timer', 'send segment(seq)', 'seq += length', 'on timer: send the oldest segment again, timer *= 2'],
      answer: 0,
      explanation: 'ACKs are cumulative, so the next ACK also covers everything the lost one did.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does TCP take no round-trip sample from a retransmitted segment?',
      options: ['The ACK could belong to either copy', 'Retransmitted segments carry no number', 'The timer is stopped while it resends', 'The receiver doesn\'t acknowledge them'],
      answer: 0,
      explanation: 'That is Karn\'s rule. A wrong sample would throw the timer off in either direction.',
    },
  ],
  summary: [
    'Sequence numbers count bytes, and an ACK names the next byte needed.',
    'ACKs are cumulative, so a later ACK covers a lost one.',
    'Three duplicate ACKs retransmit a segment before the timer.',
    'The timer starts at 1 s, doubles on each timeout, and gives up after 5 retries.',
  ],
};

export default content;
