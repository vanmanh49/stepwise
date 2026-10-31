import { lineOf } from '../data-structures/shared';
import type { ArrayView, ChartView, GridView, LadderView, PanelsView, Role, ServicesView, Step } from '../types/visualization';
import { formatIp } from './address';
import { ICMP_NAME, type Bgp, type Dns, type DnsRecord, type Frame, type Quic, type Tcp } from './packet';
import { formatTime, QUEUE_DROP, type SimEvent, type SimResult, type TableSnapshot } from './sim';

export const MAX_STEPS = 200;

export const EMPTY: ArrayView = { kind: 'array', cells: [] };

const LOG_LENGTH = 4;
const LOST_PROGRESS = 0.25;
const LADDER_ROWS = 12;
const CONNECTIONS_TABLE = 2;
const CONGESTION_TABLE = 3;
const SENT_COLUMN = 2;
const ACKED_COLUMN = 3;
const RETRANSMITS = ['fast-retransmit', 'timeout'];
const LINE_ROLES: Role[] = ['active', 'pivot'];
const X_LABEL = 'Round trips and losses';

function segmentLabel({ flags, seq, ack, window, length }: Tcp): string {
  if (flags.includes('RST')) return 'RST';
  if (flags.includes('SYN')) return flags.includes('ACK') ? `SYN ACK seq=${seq} ack=${ack}` : `SYN seq=${seq}`;
  if (flags.includes('FIN')) return `FIN seq=${seq}`;
  return length > 0 ? `seq=${seq} len=${length}` : `ACK ack=${ack} win=${window}`;
}

function dnsLabel({ name, response, rcode, answers }: Dns): string {
  if (!response) return `DNS ${name}`;
  if (rcode === 'NXDOMAIN') return 'DNS NXDOMAIN';
  return answers.length > 0 ? 'DNS answer' : 'DNS referral';
}

const ackRanges = (acks: Quic['acks']) => acks.map(([from, to]) => `${from}–${to}`).join(', ');

function quicLabel({ number, space, frames, acks }: Quic): string {
  const [first] = frames;
  if (first) return `QUIC #${number} stream ${first.stream}`;
  return acks.length > 0 ? `QUIC ACK ${ackRanges(acks)}` : `QUIC ${space} #${number}`;
}

const bgpRoute = ({ network, prefix }: Bgp) => `${formatIp(network)}/${prefix}`;

function frameLabel({ payload }: Frame): string {
  if (payload.kind === 'arp') return payload.op === 'request' ? 'ARP ask' : 'ARP reply';
  if (payload.kind === 'bgp') return payload.type === 'PROBE' ? `Probe to ${formatIp(payload.dst ?? 0)}` : `BGP ${payload.type} ${bgpRoute(payload)}`;
  const inner = payload.payload;
  if (payload.offset !== undefined) return `Fragment offset=${payload.offset}`;
  if (inner.kind === 'icmp') return ICMP_NAME[inner.type];
  if (inner.kind === 'tcp') return segmentLabel(inner);
  if (typeof inner.data === 'string') return 'UDP';
  if ('op' in inner.data) return `DHCP ${inner.data.op}`;
  return inner.data.proto === 'dns' ? dnsLabel(inner.data) : quicLabel(inner.data);
}

/** Rows of a packet grid need unique labels, since each names its cell. */
const numbered = (label: string, i: number) => (i === 0 ? label : `${label} ${i + 1}`);

const recordText = ({ name, type, value, ttl }: DnsRecord) => `${name} ${type} ${value} TTL ${ttl}`;

function dnsFields(dns: Dns): [string, string][] {
  return [
    ['DNS name', dns.name],
    ['DNS type', dns.response ? 'response' : 'query'],
    ...(dns.response ? ([['Rcode', dns.rcode]] as [string, string][]) : []),
    ...dns.answers.map((record, i): [string, string] => [numbered('Answer', i), recordText(record)]),
    ...dns.authority.map((record, i): [string, string] => [numbered('Authority', i), recordText(record)]),
  ];
}

function quicFields({ number, space, frames, acks }: Quic): [string, string][] {
  return [
    ['Packet number', String(number)],
    ['Space', space],
    ...frames.map(({ stream, offset, length }, i): [string, string] => [numbered('Stream', i), `${stream} at ${offset}, ${length} bytes`]),
    ...(acks.length > 0 ? ([['ACK ranges', ackRanges(acks)]] as [string, string][]) : []),
  ];
}

function fields({ srcMac, dstMac, payload }: Frame): [string, string][] {
  const list: [string, string][] = [
    ['Source MAC', srcMac],
    ['Destination MAC', dstMac],
  ];
  if (payload.kind === 'arp') {
    list.push(['ARP', payload.op], ['Sender IP', formatIp(payload.senderIp)], ['Target IP', formatIp(payload.targetIp)]);
    return list;
  }
  if (payload.kind === 'bgp') {
    list.push(['BGP', payload.type], ['Prefix', bgpRoute(payload)], ['AS_PATH', payload.path.join(' ')]);
    if (payload.dst !== undefined) list.push(['Destination IP', formatIp(payload.dst)]);
    return list;
  }
  list.push(['Source IP', formatIp(payload.src)], ['Destination IP', formatIp(payload.dst)], ['TTL', String(payload.ttl)]);
  if (payload.length !== undefined) list.push(['Total length', String(payload.length)]);
  if (payload.df) list.push(["Don't Fragment", 'yes']);
  if (payload.offset !== undefined) list.push(['Offset', String(payload.offset)], ['More fragments', payload.more ? 'yes' : 'no']);
  const inner = payload.payload;
  if (inner.kind === 'icmp') {
    list.push(['ICMP', `${ICMP_NAME[inner.type]} ${inner.seq}`]);
    if (inner.mtu !== undefined) list.push(['Next-hop MTU', String(inner.mtu)]);
    return list;
  }
  list.push(['Source port', String(inner.srcPort)], ['Destination port', String(inner.dstPort)]);
  if (inner.kind === 'tcp') {
    list.push(['Seq', String(inner.seq)], ['Ack', String(inner.ack)], ['Flags', inner.flags.join(' ')], ['Window', String(inner.window)], ['Length', String(inner.length)]);
    if (inner.mss !== undefined) list.push(['MSS', String(inner.mss)]);
    return list;
  }
  if (typeof inner.data === 'string') list.push(['Data', inner.data]);
  else if ('op' in inner.data) list.push(['DHCP', inner.data.op], ['Your IP', formatIp(inner.data.yourIp)]);
  else list.push(...(inner.data.proto === 'dns' ? dnsFields(inner.data) : quicFields(inner.data)));
  return list;
}

/** One row per header field. A field that differs from `before` is highlighted. */
export function packetGrid(frame: Frame, before?: Frame): GridView {
  const old = before && new Map(fields(before));
  return {
    kind: 'grid',
    rows: fields(frame).map(([label, value]) => ({
      label,
      cells: [{ id: `field-${label}`, value, role: (old && old.has(label) && old.get(label) !== value ? 'active' : 'default') as Role }],
    })),
  };
}

export function tableGrid(table: TableSnapshot, device: string, row?: number): GridView {
  const rows = table.rows.length > 0 ? table.rows : [table.columns.map(() => '–')];
  return {
    kind: 'grid',
    colLabels: table.columns,
    rows: rows.map((cells, r) => ({
      cells: cells.map((value, c) => ({ id: `${device}-${table.title}-${r}-${c}`, value, role: (r === row ? 'active' : 'default') as Role })),
    })),
  };
}

export function networkView(result: SimResult, event: SimEvent, log: string[]): ServicesView {
  const nodeRole = (id: string): Role => (event.stopped.includes(id) ? 'discarded' : id === event.device ? 'active' : 'default');
  return {
    kind: 'services',
    nodes: result.devices.map(({ id, label, type, column }) => {
      const badge = event.badges[id];
      return { id, label, type, column, role: nodeRole(id), ...(badge ? { badge } : {}) };
    }),
    links: result.links.map(({ a, b }, i) => ({ from: a[0], to: b[0], role: (event.down.includes(i) ? 'discarded' : 'default') as Role })),
    messages: event.hops.map(({ from, to, lost }, i) => ({
      id: `hop-${i}`,
      from,
      to,
      label: event.frame ? frameLabel(event.frame) : '',
      role: (lost ? 'discarded' : 'active') as Role,
      progress: lost ? LOST_PROGRESS : 0.5,
    })),
    requests: [],
    log,
  };
}

function tablePanel(event: SimEvent): PanelsView['panels'][number] | undefined {
  const tables = event.tables[event.device] ?? [];
  const table = tables[event.table?.index ?? 0];
  if (!table) return undefined;
  return { label: table.title, view: tableGrid(table, event.device, event.table?.row) };
}

/** The packets sent up to event `upTo`, between the listed devices only. */
export function ladderView(result: SimResult, upTo: number, columns: { id: string; label: string }[]): LadderView {
  const ids = new Set(columns.map((column) => column.id));
  const rows: LadderView['rows'] = [];
  result.events.slice(0, upTo + 1).forEach(({ frame, hops }, e) => {
    if (frame?.payload.kind !== 'ip') return;
    hops.forEach(({ from, to, lost }, h) => {
      if (!ids.has(from) || !ids.has(to)) return;
      const role: Role = lost ? 'discarded' : e === upTo ? 'active' : 'default';
      rows.push({ id: `packet-${e}-${h}`, from, to, label: frameLabel(frame), role, ...(lost ? { lost } : {}) });
    });
  });
  const tables = result.events[upTo]?.tables ?? {};
  return {
    kind: 'ladder',
    columns: columns.map((column) => {
      const state = tables[column.id]?.[CONNECTIONS_TABLE]?.rows.at(-1)?.[1];
      return { ...column, ...(state ? { state } : {}) };
    }),
    rows: rows.slice(-LADDER_ROWS),
    ...(rows.length > LADDER_ROWS ? { earlier: rows.length - LADDER_ROWS } : {}),
  };
}

/** The deciding device's Connections table. */
export function connectionPanel(event: SimEvent): PanelsView['panels'][number] | undefined {
  const table = event.tables[event.device]?.[CONNECTIONS_TABLE];
  return table && { label: 'Connection', view: tableGrid(table, event.device, event.table?.row) };
}

export interface TraceOptions {
  /** Replaces the deciding device's table with a panel of the lesson's own. */
  panel?: (event: SimEvent) => PanelsView['panels'][number] | undefined;
  /** Actions to leave out, such as ARP in a lesson about routing. */
  hide?: string[];
  /** Replaces the Network panel with a ladder of these devices. */
  ladder?: { id: string; label: string }[];
}

/** One step per event; a Note's `action` picks the code line. Past MAX_STEPS the rest fold into one summary step. */
export function traceSteps(result: SimResult, code: string, lines: Record<string, string>, options: TraceOptions = {}): Step[] {
  const log: string[] = [];
  const labels = new Map(result.devices.map((device) => [device.id, device.label]));
  const events = result.events.filter((event) => !options.hide?.includes(event.action));
  const { ladder } = options;
  const movement = (event: SimEvent): PanelsView['panels'][number] =>
    ladder ? { label: 'Ladder', view: ladderView(result, result.events.indexOf(event), ladder) } : { label: 'Network', view: networkView(result, event, log.slice(-LOG_LENGTH)) };
  let codeLine = 1;
  const steps = events.slice(0, MAX_STEPS).map((event): Step => {
    log.push(event.title);
    const side = options.panel?.(event) ?? tablePanel(event);
    const snippet = lines[event.action];
    if (snippet) codeLine = lineOf(code, snippet);
    return {
      title: event.title,
      why: event.hops.some((hop) => hop.lost) ? `${event.why} This packet is lost on the way and never arrives.` : event.why,
      codeLine,
      variables: { time: formatTime(event.time), device: labels.get(event.device) ?? event.device },
      view: {
        kind: 'panels',
        panels: [
          movement(event),
          ...(event.frame ? [{ label: 'Packet', view: packetGrid(event.frame, event.before) }] : []),
          ...(side ? [side] : []),
        ],
      },
    };
  });
  const hidden = events.length - steps.length;
  if (hidden > 0) {
    steps.push({
      title: `${hidden} more events are not shown`,
      why: result.cut ? 'This run never settled, so the simulator stopped it.' : 'The run went on doing the same work, so the rest is folded here.',
      codeLine,
      view: { kind: 'panels', panels: [movement(events.at(-1)!)] },
    });
  }
  return steps;
}

/** A number from a device's Congestion table, by column title. */
export function congestionValue(event: SimEvent, device: string, column: string): number {
  const table = event.tables[device]?.[CONGESTION_TABLE];
  return Number(table?.rows[0]?.[table.columns.indexOf(column)] ?? 0);
}

/** Adds a closing step, standing in for the fold-up step if the run hit the cap. */
export function endWith(steps: Step[], ending: Partial<Step>): Step[] {
  steps.splice(Math.min(steps.length, MAX_STEPS), 1, { ...steps.at(-1)!, ...ending });
  return steps;
}

export interface RoundOptions {
  /** The chart's lines at this event: one or two, on one axis. */
  series: (event: SimEvent) => { label: string; value: number }[];
  title: string;
  yLabel: string;
  threshold?: (event: SimEvent) => { value: number; label: string } | undefined;
  /** The sending device, whose Connections and Congestion tables drive the rounds. */
  watchTable: string;
  /** Extra node badges, such as the queue at the bottleneck. */
  badges?: (event: SimEvent) => Record<string, string>;
  /** Explains a round. */
  explain?: (event: SimEvent) => string;
}

/** The events worth a step: the start of each round trip, the first drop in a round, and each retransmission. */
function pickRounds(result: SimResult, device: string): { event: SimEvent; round: number }[] {
  const picks: { event: SimEvent; round: number }[] = [];
  let round = 0;
  let target = -1;
  let dropSeen = false;
  const rowAt = (event: SimEvent | undefined) => event?.tables[device]?.[CONNECTIONS_TABLE]?.rows[0];
  for (const [i, event] of result.events.entries()) {
    const row = rowAt(event);
    if (!row) continue;
    const sent = Number(row[SENT_COLUMN]);
    if (sent > 0 && Number(row[ACKED_COLUMN]) >= target && sent > target) {
      round++;
      // The round ends when this whole burst is acknowledged, not just its first segment.
      let end = i;
      while (result.events[end + 1]?.time === event.time) end++;
      target = Number(rowAt(result.events[end])?.[SENT_COLUMN] ?? sent);
      dropSeen = false;
      picks.push({ event, round });
    } else if (RETRANSMITS.includes(event.action) || (event.action === QUEUE_DROP && !dropSeen)) {
      dropSeen ||= event.action === QUEUE_DROP;
      picks.push({ event, round });
    }
  }
  const last = result.events.at(-1);
  if (last && picks.at(-1)?.event !== last) picks.push({ event: last, round });
  return picks;
}

/** For long runs: one step per round trip and per loss, each showing the chart of the whole run up to that step. */
export function roundSteps(result: SimResult, code: string, lines: Record<string, string>, options: RoundOptions): Step[] {
  const { watchTable, series, threshold, title, yLabel, badges, explain } = options;
  const picks = pickRounds(result, watchTable);
  const values = picks.map(({ event }) => series(event));
  const chartLines = (values[0] ?? []).map(({ label }, l): ChartView['lines'][number] => ({ id: `line-${l}`, label, role: LINE_ROLES[l] ?? 'active', points: values.map((each) => each[l]?.value ?? 0) }));
  const labels = new Map(result.devices.map((device) => [device.id, device.label]));
  const log: string[] = [];
  let codeLine = 1;

  const view = (index: number): PanelsView => {
    const { event } = picks[index]!;
    const line = threshold?.(event);
    const chart: ChartView = { kind: 'chart', title, xLabel: X_LABEL, yLabel, lines: chartLines, now: index, ...(line ? { threshold: line } : {}) };
    const table = event.tables[watchTable]?.[CONGESTION_TABLE];
    const shown: SimEvent = badges ? { ...event, badges: { ...event.badges, ...badges(event) } } : event;
    return {
      kind: 'panels',
      panels: [
        { label: 'Chart', view: chart },
        { label: 'Network', view: networkView(result, shown, log.slice(-LOG_LENGTH)) },
        ...(table ? [{ label: 'Connection', view: tableGrid(table, watchTable) }] : []),
      ],
    };
  };

  const shown = picks.slice(0, MAX_STEPS);
  const steps = shown.map(({ event, round }, i): Step => {
    const isRound = !RETRANSMITS.includes(event.action) && event.action !== QUEUE_DROP;
    const now = values[i]!;
    const stepTitle = isRound ? `Round ${round}: ${now.map(({ label, value }) => `${label} ${value}`).join(', ')}` : event.title;
    log.push(stepTitle);
    const snippet = lines[isRound ? 'round' : event.action];
    if (snippet) codeLine = lineOf(code, snippet);
    return {
      title: stepTitle,
      why: isRound && explain ? explain(event) : event.why,
      codeLine,
      variables: { time: formatTime(event.time), device: labels.get(event.device) ?? event.device },
      view: view(i),
    };
  });
  const hidden = picks.length - shown.length;
  if (hidden > 0) {
    steps.push({
      title: `${hidden} more rounds are not shown`,
      why: result.cut ? 'This run never settled, so the simulator stopped it.' : 'The run went on doing the same work, so the rest is folded here.',
      codeLine,
      view: view(picks.length - 1),
    });
  }
  return steps;
}
