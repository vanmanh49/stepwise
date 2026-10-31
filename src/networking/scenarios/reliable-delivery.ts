import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import type { Frame } from '../packet';
import { simulate, type Fault } from '../sim';
import { connectionPanel, EMPTY, traceSteps } from '../steps';
import { HOST_COLUMNS, SERVER_IP, SERVER_PORT, twoHosts } from './topology';

export const reliableDeliveryCode = `// sender
while bytes remain and inFlight < window:
  send segment(seq)
  seq += length
on ACK n: everything before n arrived, so restart the timer
on third duplicate ACK: send the oldest segment again
on timer: send the oldest segment again, timer *= 2

// receiver
on segment in order: give it to the program, send ACK(next)
on segment after a gap: hold it, send ACK(next) again`;

export const WINDOWS = ['1', '4'];
export const LOST_OPTIONS = ['None', ...Array.from({ length: 8 }, (_, i) => `Segment ${i + 1}`), 'ACK 1'];

const LINES = {
  'tcp-data': 'send segment(seq)',
  'tcp-ack': 'on segment in order: give it to the program, send ACK(next)',
  'tcp-hold': 'on segment after a gap: hold it, send ACK(next) again',
  'tcp-dup-ack': 'on segment after a gap: hold it, send ACK(next) again',
  'fast-retransmit': 'on third duplicate ACK: send the oldest segment again',
  timeout: 'on timer: send the oldest segment again, timer *= 2',
};

const TITLE = "Can't run this";
const MSS = 1000;
const FIRST_SEQ = 1001;
const HANDSHAKE = ['tcp-syn', 'tcp-syn-ack', 'tcp-established'];

const segmentOf = ({ payload }: Frame) => (payload.kind === 'ip' && payload.payload.kind === 'tcp' ? payload.payload : undefined);

function dropFor(lost: string): Fault[] {
  if (lost === LOST_OPTIONS[0]) return [];
  if (lost === 'ACK 1') return [{ kind: 'dropPacket', matches: (frame) => { const tcp = segmentOf(frame); return tcp?.length === 0 && tcp.ack === FIRST_SEQ + MSS; }, nth: 1 }];
  const seq = FIRST_SEQ + (Number(lost.slice('Segment '.length)) - 1) * MSS;
  return [{ kind: 'dropPacket', matches: (frame) => { const tcp = segmentOf(frame); return tcp !== undefined && tcp.length > 0 && tcp.seq === seq; }, nth: 1 }];
}

export function reliableDeliverySteps(values: Record<string, string>): Step[] {
  const segments = readInt(values, 'segments', 'Segments', { min: 1, max: 8 });
  if (!segments.ok) return refusal(TITLE, segments.why, EMPTY);
  const window = readChoice(values, 'window', 'Window', WINDOWS);
  if (!window.ok) return refusal(TITLE, window.why, EMPTY);
  const lost = readChoice(values, 'lost', 'Lost packet', LOST_OPTIONS);
  if (!lost.ok) return refusal(TITLE, lost.why, EMPTY);
  if (lost.value.startsWith('Segment') && Number(lost.value.slice('Segment '.length)) > segments.value) {
    return refusal(TITLE, `This run has ${segments.value} segments, so ${lost.value} never exists. Pick a segment from 1 to ${segments.value}.`, EMPTY);
  }

  const { client, server, devices, links } = twoHosts();
  const bytes = segments.value * MSS;
  let received = 0;
  const run = simulate({
    devices,
    links,
    faults: dropFor(lost.value),
    commands: [
      { at: 0, device: server.id, run: () => server.listen(SERVER_PORT, { onData: (count) => { received += count; } }) },
      { at: 0, device: client.id, run: (_, ctx) => client.write(ctx, client.connect(ctx, SERVER_IP, SERVER_PORT, { fixedWindow: Number(window.value) }), bytes) },
    ],
  });
  const steps = traceSteps(run, reliableDeliveryCode, LINES, { ladder: HOST_COLUMNS, panel: connectionPanel, hide: HANDSHAKE });
  const ms = run.events.at(-1)!.time;
  steps.push({
    ...steps.at(-1)!,
    title: `All ${received} bytes arrived in ${ms} ms`,
    why: lost.value === LOST_OPTIONS[0] ? `Window ${window.value} means ${window.value} segment${window.value === '1' ? '' : 's'} may be unacknowledged at once. A bigger window spends less time waiting.` : 'The program saw a clean run of bytes, in order, with no gap and no repeat. All the recovery stayed inside TCP.',
    variables: { ms, received },
  });
  return steps;
}
