import { readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { simulate } from '../sim';
import { connectionPanel, EMPTY, endWith, traceSteps } from '../steps';
import { HOST_COLUMNS, SERVER_IP, SERVER_PORT, twoHosts } from './topology';

export const flowControlCode = `// receiver
on segment:
  buffer.add(segment)
  window = buffer.size - buffer.used
  send ACK(next, window)
program reads:
  buffer.remove(bytes)
  if window reopened: send window update

// sender
while inFlight < peerWindow:
  send segment
if peerWindow is 0:
  at each timeout: send a 1-byte probe`;

const LINES = {
  'tcp-data': 'send segment',
  'tcp-ack': 'send ACK(next, window)',
  'zero-window': 'send ACK(next, window)',
  probe: 'at each timeout: send a 1-byte probe',
  'window-update': 'if window reopened: send window update',
};

const TITLE = "Can't run this";
const BYTES = 16000;
/** Bytes per ms: 10 ms per segment, so a burst doesn't all land in one tick. */
const LINK_RATE = 104;
/** Large enough that only the peer's window ever limits the sender. */
const FIXED_WINDOW = 64;
const HANDSHAKE = ['tcp-syn', 'tcp-syn-ack', 'tcp-established', 'tcp-accepted'];

export function flowControlSteps(values: Record<string, string>): Step[] {
  const buffer = readInt(values, 'buffer', 'Buffer', { min: 2000, max: 64000 });
  if (!buffer.ok) return refusal(TITLE, buffer.why, EMPTY);
  const rate = readInt(values, 'rate', 'Read rate', { min: 0, max: 200 });
  if (!rate.ok) return refusal(TITLE, rate.why, EMPTY);

  const { client, server, devices, links } = twoHosts({ rate: LINK_RATE });
  let read = 0;
  let ms = 0;
  const run = simulate({
    devices,
    links,
    commands: [
      { at: 0, device: server.id, run: (_, ctx) => server.listen(SERVER_PORT, { bufferBytes: buffer.value, readRate: rate.value, onData: (count) => { read += count; ms = ctx.now; } }) },
      { at: 0, device: client.id, run: (_, ctx) => client.write(ctx, client.connect(ctx, SERVER_IP, SERVER_PORT, { fixedWindow: FIXED_WINDOW }), BYTES) },
    ],
  });
  const steps = traceSteps(run, flowControlCode, LINES, { ladder: HOST_COLUMNS, panel: connectionPanel, hide: HANDSHAKE });
  const windows = run.events.flatMap(({ device, frame }) => {
    const packet = device === server.id ? frame?.payload : undefined;
    return packet?.kind === 'ip' && packet.payload.kind === 'tcp' ? [packet.payload.window] : [];
  });
  const lowest = Math.min(...windows);
  const reader = `a program reading ${rate.value} byte${rate.value === 1 ? '' : 's'} per ms`;
  const why =
    lowest === 0
      ? `The buffer filled, so the window reached 0 and the sender stopped. It kept probing until ${rate.value === 0 ? 'the program started reading at 2 s' : 'there was room again'}, and nothing was lost.`
      : lowest < buffer.value / 2
        ? `The window shrank to ${lowest} bytes, which held the sender to the pace of ${reader}. Nothing was lost, because the sender never sent more than the buffer could hold.`
        : `The buffer never came close to filling: the window stayed at ${lowest} bytes or more, so the link set the pace, not the program.`;
  return endWith(steps, { title: `The program read all ${read} bytes in ${ms} ms`, why, variables: { ms, read } });
}
