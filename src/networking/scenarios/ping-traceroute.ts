import { readChoice, readInt, refusal } from '../../algorithms/form';
import type { GridView, Role, Step } from '../../types/visualization';
import { formatIp, ipv4 } from '../address';
import type { Frame } from '../packet';
import { formatTime, simulate, type Command, type Fault, type SimEvent } from '../sim';
import { EMPTY, tableGrid, traceSteps } from '../steps';
import { QUIET } from './ip-routing';
import { threeRouters } from './topology';

export const pingTracerouteCode = `// ping: are you there, and how far away?
for seq in 1 to 3:
  send Echo Request(seq, ttl)
  on Echo Reply: rtt = now - sentAt[seq]

// traceroute: who is on the way?
for ttl in 1 to 4:
  send Echo Request(ttl)
  on Time Exceeded from a router: hop[ttl] = router
  on Echo Reply: hop[ttl] = destination, done
  after a timeout: hop[ttl] = *`;

export const MODES = ['Ping', 'Traceroute'];
export const DROP_OPTIONS = ['None', '1', '2', '3'];
export const SILENT_OPTIONS = ['No', 'Yes'];

const LINES = {
  send: 'send Echo Request(seq, ttl)',
  'echo-reply': 'on Echo Reply: rtt = now - sentAt[seq]',
  'reply-received': 'on Echo Reply: rtt = now - sentAt[seq]',
};

const TRACE_LINES = {
  send: 'send Echo Request(ttl)',
  'ttl-expired': 'on Time Exceeded from a router: hop[ttl] = router',
  'echo-reply': 'on Echo Reply: hop[ttl] = destination, done',
  'silent-drop': 'after a timeout: hop[ttl] = *',
};

const TITLE = "Can't run this";
const SERVER = ipv4('10.3.0.2');
const PINGS = 3;
const PING_GAP_MS = 1000;
const HOPS = 4;
const PROBE_GAP_MS = 2000;

const isEchoReply = (seq: number) => ({ payload }: Frame) => payload.kind === 'ip' && payload.payload.kind === 'icmp' && payload.payload.type === 'echo-reply' && payload.payload.seq === seq;

/** One row per probe sent so far, laid out like real traceroute output. A probe with no answer yet shows `*` once its time is up. */
function hopGrid(event: SimEvent): GridView {
  const replies = event.tables.host?.[1]?.rows ?? [];
  const sent = Math.min(HOPS, Math.floor(event.time / PROBE_GAP_MS) + 1);
  const rows = Array.from({ length: sent }, (_, i) => {
    const hop = i + 1;
    const reply = replies.find(([seq]) => seq === String(hop));
    const waiting = !reply && event.time < hop * PROBE_GAP_MS;
    const cells = [String(hop), reply?.[1] ?? (waiting ? '…' : '*'), reply?.[3] ?? ''];
    return { cells: cells.map((value, c) => ({ id: `hop-${hop}-${c}`, value, role: (reply ? 'found' : 'default') as Role })) };
  });
  return { kind: 'grid', colLabels: ['Hop', 'Address', 'Time'], rows };
}

function ping(ttl: number, drop: string, silent: boolean): Step[] {
  const { host, devices, links } = threeRouters({ silent });
  const faults: Fault[] = drop === DROP_OPTIONS[0] ? [] : [{ kind: 'dropPacket', matches: isEchoReply(Number(drop)), nth: 1 }];
  const commands = Array.from({ length: PINGS }, (_, i): Command => ({ at: i * PING_GAP_MS, device: host.id, run: (_device, ctx) => host.ping(ctx, SERVER, i + 1, ttl) }));
  const run = simulate({ devices, links, commands, faults });
  const steps = traceSteps(run, pingTracerouteCode, LINES, {
    hide: QUIET,
    panel: (event) => {
      const table = event.tables.host?.[1];
      return table && { label: 'Replies', view: tableGrid(table, 'host') };
    },
  });
  const answered = host.replies.filter((reply) => reply.type === 'echo-reply');
  const last = steps.at(-1)!;
  const times = answered.map((reply) => formatTime(reply.rttMs)).join(', ');
  steps.push({
    ...last,
    title: `${answered.length} of ${PINGS} replies came back`,
    why: answered.length === PINGS ? `Every ping was answered, in ${times}. The time is the whole round trip.` : answered.length > 0 ? `${times} for the ones that came back. A lost reply looks exactly like a lost request: the sender only sees silence.` : 'No Echo Reply arrived. Silence or an ICMP error is all the sender gets, and neither says if the server is up.',
    variables: { sent: PINGS, received: answered.length },
  });
  return steps;
}

function traceroute(silent: boolean): Step[] {
  const { host, devices, links } = threeRouters({ silent });
  const commands = Array.from({ length: HOPS }, (_, i): Command => ({ at: i * PROBE_GAP_MS, device: host.id, run: (_device, ctx) => host.ping(ctx, SERVER, i + 1, i + 1) }));
  const run = simulate({ devices, links, commands, endAt: HOPS * PROBE_GAP_MS });
  const steps = traceSteps(run, pingTracerouteCode, TRACE_LINES, { hide: QUIET, panel: (event) => ({ label: 'Hops', view: hopGrid(event) }) });
  const last = steps.at(-1)!;
  const final = run.events.at(-1)!;
  const view = { kind: 'panels' as const, panels: [{ label: 'Hops', view: hopGrid({ ...final, time: HOPS * PROBE_GAP_MS }) }] };
  steps.push({
    ...last,
    title: `Reached ${formatIp(SERVER)} in ${HOPS} hops`,
    why: silent ? 'R2 forwarded every packet but stayed quiet when a TTL ran out there, so it shows as *. A star means no answer, not a broken hop.' : 'Each probe got one hop further, and each router that killed a probe gave away its own address. That list is the path.',
    view,
  });
  return steps;
}

export function pingTracerouteSteps(values: Record<string, string>): Step[] {
  const mode = readChoice(values, 'mode', 'Tool', MODES);
  if (!mode.ok) return refusal(TITLE, mode.why, EMPTY);
  const ttl = readInt(values, 'ttl', 'TTL', { min: 1, max: 64 });
  if (!ttl.ok) return refusal(TITLE, ttl.why, EMPTY);
  const drop = readChoice(values, 'drop', 'Lose reply', DROP_OPTIONS);
  if (!drop.ok) return refusal(TITLE, drop.why, EMPTY);
  const silent = readChoice(values, 'silent', 'R2 is silent', SILENT_OPTIONS);
  if (!silent.ok) return refusal(TITLE, silent.why, EMPTY);
  const quiet = silent.value === SILENT_OPTIONS[1];
  return mode.value === MODES[0] ? ping(ttl.value, drop.value, quiet) : traceroute(quiet);
}
