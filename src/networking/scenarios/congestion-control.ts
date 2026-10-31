import { readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { simulate, type SimEvent } from '../sim';
import { congestionValue, EMPTY, endWith, roundSteps } from '../steps';
import { SERVER_PORT, tcpPath } from './topology';

export const congestionControlCode = `// the router
if the queue is full: drop the packet

// the sender, Reno style
cwnd = 1 segment
on new ACK:
  if cwnd < ssthresh: cwnd += 1 segment     // slow start
  else: cwnd += 1 / cwnd segments           // avoidance
on third duplicate ACK:
  ssthresh = max(flight / 2, 2 segments)
  cwnd = ssthresh + 3 segments
  send the lost segment again
on the next new ACK: cwnd = ssthresh
on timeout:
  ssthresh = max(flight / 2, 2 segments)
  cwnd = 1 segment
  send the lost segment again`;

const LINES = {
  round: 'on new ACK:',
  'queue-drop': 'if the queue is full: drop the packet',
  'fast-retransmit': 'on third duplicate ACK:',
  timeout: 'on timeout:',
};

const TITLE = "Can't run this";
const MSS = 1000;
const BYTES = 250 * MSS;
const SEGMENT_ON_THE_WIRE = 1040;
const CLIENT = 'client';

const inSegments = (bytes: number) => Math.round(bytes / (MSS / 10)) / 10;

const explain = (event: SimEvent) => {
  const cwnd = congestionValue(event, CLIENT, 'cwnd');
  return cwnd < congestionValue(event, CLIENT, 'ssthresh')
    ? 'Below ssthresh this is slow start: every ACK adds a segment, so the window doubles each round trip.'
    : 'At or above ssthresh this is congestion avoidance: a whole round trip of ACKs adds about one segment, feeling carefully for spare room.';
};

export function congestionControlSteps(values: Record<string, string>): Step[] {
  const queue = readInt(values, 'queue', 'Queue', { min: 2, max: 40 });
  if (!queue.ok) return refusal(TITLE, queue.why, EMPTY);
  const ssthresh = readInt(values, 'ssthresh', 'Initial ssthresh', { min: 2, max: 64 });
  if (!ssthresh.ok) return refusal(TITLE, ssthresh.why, EMPTY);

  const { client, server, devices, links, bottleneck } = tcpPath({ queue: queue.value });
  let received = 0;
  const run = simulate({
    devices,
    links,
    watch: [CLIENT],
    maxEvents: 20000,
    commands: [
      { at: 0, device: server.id, run: () => server.listen(SERVER_PORT, { onData: (count) => { received += count; } }) },
      { at: 0, device: client.id, run: (_, ctx) => client.write(ctx, client.connect(ctx, server.address(), SERVER_PORT, { ssthreshMss: ssthresh.value }), BYTES) },
    ],
  });
  const steps = roundSteps(run, congestionControlCode, LINES, {
    title: 'Congestion window',
    yLabel: 'Segments',
    watchTable: CLIENT,
    series: (event) => [{ label: 'cwnd', value: inSegments(congestionValue(event, CLIENT, 'cwnd')) }],
    threshold: (event) => ({ value: inSegments(congestionValue(event, CLIENT, 'ssthresh')), label: 'ssthresh' }),
    badges: (event) => ({ router: `${Math.round((event.queues[`${bottleneck}:router`] ?? 0) / SEGMENT_ON_THE_WIRE)} queued` }),
    explain,
  });
  return endWith(steps, {
    title: `All ${received} bytes arrived in ${run.events.at(-1)!.time} ms`,
    why: 'The link never told the sender its speed. The sender found it by pushing until a packet was lost, backing off, and pushing again.',
    variables: { cut: run.cut ? 'yes' : 'no' },
  });
}
