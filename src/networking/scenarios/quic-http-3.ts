import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { Step } from '../../types/visualization';
import { EMPTY, endWith, traceSteps } from '../steps';
import { HIDE } from './http-1-1';
import { lostNumber, mostStalled, runMux, streamsPanel } from './http-2';

export const quicHttp3Code = `// the client
if it holds a saved key: send requests in the first flight
send Initial                 // transport and TLS together
on the server's flight: send Finished, then the requests

// each packet
give it a new number, even if it repeats old data
name the stream and offset of every frame

// the receiver
each stream delivers in order, on its own
acknowledge at once, listing ranges

// the sender
if 3 later packets are acknowledged: it was lost
send its data again under a new number
if the timer runs out: resend, and double the timer`;

export const VISITS = ['First', 'Returning'];
export const LOST = ['None', ...Array.from({ length: 8 }, (_, i) => `Packet ${i + 1}`)];

const LINES = {
  'quic-initial': 'send Initial                 // transport and TLS together',
  'quic-handshake': 'on the server\'s flight: send Finished, then the requests',
  'quic-0rtt': 'if it holds a saved key: send requests in the first flight',
  'http-request': 'on the server\'s flight: send Finished, then the requests',
  'http-first-byte': 'each stream delivers in order, on its own',
  'quic-hold': 'each stream delivers in order, on its own',
  'quic-lost': 'if 3 later packets are acknowledged: it was lost',
  'quic-timeout': 'if the timer runs out: resend, and double the timer',
};

const TITLE = "Can't fetch this page";
const QUIC_HIDE = [...HIDE, 'quic-data', 'quic-ack'];

export function quicHttp3Steps(values: Record<string, string>): Step[] {
  const visit = readChoice(values, 'visit', 'Visit', VISITS);
  if (!visit.ok) return refusal(TITLE, visit.why, EMPTY);
  const resources = readInt(values, 'resources', 'Resources', { min: 2, max: 6 });
  if (!resources.ok) return refusal(TITLE, resources.why, EMPTY);
  const lost = readChoice(values, 'lost', 'Lost', LOST);
  if (!lost.ok) return refusal(TITLE, lost.why, EMPTY);

  const returning = visit.value === VISITS[1];
  const nth = lostNumber(lost.value);
  const { run, client, server, firstByte, finished } = runMux('HTTP/3', { resources: resources.value, lost: nth, returning });
  const tcp = runMux('HTTP/2', { resources: resources.value, lost: nth });
  const steps = traceSteps(run, quicHttp3Code, LINES, {
    hide: QUIC_HIDE,
    ladderSkip: ['quic-data', 'quic-ack'],
    ladder: [{ id: client.id, label: client.label, ip: client.address() }, { id: server.id, label: server.label, ip: server.address() }],
    panel: streamsPanel,
  });
  const stalled = mostStalled(run);
  const gained = tcp.firstByte - firstByte;
  return endWith(steps, {
    title: `First byte at ${firstByte} ms, all ${resources.value} resources by ${finished} ms`,
    why: nth > 0
      ? `The same lost packet stalled ${stalled} ${stalled === 1 ? 'stream' : 'streams'} here, and HTTP/2 stalled ${mostStalled(tcp.run)}. QUIC knows which stream each byte belongs to, so only that stream waited.`
      : `HTTP/2 on TLS reached its first byte at ${tcp.firstByte} ms, so this was ${gained} ms sooner on the same path. TCP needs a round trip of its own before TLS can start, and QUIC does both at once.`,
    variables: { firstByte, finished, gained, stalled, cut: run.cut ? 'yes' : 'no' },
  });
}
