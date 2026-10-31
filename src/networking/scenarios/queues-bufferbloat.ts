import { readChoice, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { simulate, type SimEvent } from '../sim';
import { congestionValue, EMPTY, endWith, roundSteps } from '../steps';
import { SERVER_PORT, tcpPath } from './topology';

export const queuesBufferbloatCode = `// the router
on packet:
  if queue is full: drop it
  else: add it to the queue
every 10 ms: send the packet at the front

// what each packet feels
round trip = path delay + time in queue
time in queue = packets ahead * 10 ms

// the sender only slows down after a drop
on loss: halve cwnd`;

export const BUFFERS = ['5', '20', '100'];

const LINES = {
  round: 'round trip = path delay + time in queue',
  'queue-drop': 'if queue is full: drop it',
  'fast-retransmit': 'on loss: halve cwnd',
  timeout: 'on loss: halve cwnd',
};

const TITLE = "Can't run this";
const MSS = 1000;
const BYTES = 800 * MSS;
const RATE = 104;
const CLIENT = 'client';
/** Large enough that neither the receiver nor ssthresh stops the climb: only the queue does. */
const BUFFER_BYTES = 1000000;
const SSTHRESH_MSS = 256;

export function queuesBufferbloatSteps(values: Record<string, string>): Step[] {
  const buffer = readChoice(values, 'buffer', 'Buffer', BUFFERS);
  if (!buffer.ok) return refusal(TITLE, buffer.why, EMPTY);

  const { client, server, devices, links, bottleneck } = tcpPath({ queue: Number(buffer.value), rate: RATE });
  const queueWait = (event: SimEvent) => Math.round((event.queues[`${bottleneck}:router`] ?? 0) / RATE);
  const run = simulate({
    devices,
    links,
    watch: [CLIENT],
    maxEvents: 20000,
    commands: [
      { at: 0, device: server.id, run: () => server.listen(SERVER_PORT, { bufferBytes: BUFFER_BYTES }) },
      { at: 0, device: client.id, run: (_, ctx) => client.write(ctx, client.connect(ctx, server.address(), SERVER_PORT, { ssthreshMss: SSTHRESH_MSS }), BYTES) },
    ],
  });
  // The quietest round trip measured is the path alone. Later ones add the wait: a retransmission gives no sample, so measuring would miss the worst of it.
  const pathDelay = Math.min(...run.events.map((event) => congestionValue(event, CLIENT, 'RTT')).filter((rtt) => rtt > 0));
  const roundTrip = (event: SimEvent) => pathDelay + queueWait(event);
  const steps = roundSteps(run, queuesBufferbloatCode, LINES, {
    title: 'Round trip and queue',
    yLabel: 'ms',
    watchTable: CLIENT,
    series: (event) => [
      { label: 'Round trip', value: roundTrip(event) },
      { label: 'Time in queue', value: queueWait(event) },
    ],
    badges: (event) => ({ router: `${queueWait(event)} ms queued` }),
    explain: () => 'The link can\'t go any faster, so every packet beyond its capacity just waits. The sender sees no problem until the buffer overflows.',
  });
  const peakRtt = Math.max(...run.events.map(roundTrip));
  const finished = run.events.at(-1)!.time;
  const throughput = Math.round(BYTES / finished);
  return endWith(steps, {
    title: `${throughput} bytes per ms, with a worst round trip of ${peakRtt} ms`,
    why: `A buffer of ${buffer.value} packets moved the same data at about the link's speed. A bigger buffer buys no speed, because the link is the limit. It only lets packets wait longer.`,
    variables: { peakRtt, throughput },
  });
}
