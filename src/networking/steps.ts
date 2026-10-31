import { lineOf } from '../data-structures/shared';
import type { ArrayView, GridView, PanelsView, Role, ServicesView, Step } from '../types/visualization';
import { formatIp } from './address';
import { ICMP_NAME, type Frame } from './packet';
import { formatTime, type SimEvent, type SimResult, type TableSnapshot } from './sim';

export const MAX_STEPS = 200;

export const EMPTY: ArrayView = { kind: 'array', cells: [] };

const LOG_LENGTH = 4;
const LOST_PROGRESS = 0.25;

function frameLabel({ payload }: Frame): string {
  if (payload.kind === 'arp') return payload.op === 'request' ? 'ARP ask' : 'ARP reply';
  const inner = payload.payload;
  if (inner.kind === 'icmp') return ICMP_NAME[inner.type];
  if (inner.kind === 'tcp') return 'TCP';
  return typeof inner.data === 'string' ? 'UDP' : `DHCP ${inner.data.op}`;
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
  list.push(['Source IP', formatIp(payload.src)], ['Destination IP', formatIp(payload.dst)], ['TTL', String(payload.ttl)]);
  const inner = payload.payload;
  if (inner.kind === 'icmp') {
    list.push(['ICMP', `${ICMP_NAME[inner.type]} ${inner.seq}`]);
    return list;
  }
  list.push(['Source port', String(inner.srcPort)], ['Destination port', String(inner.dstPort)]);
  if (inner.kind === 'tcp') return list;
  if (typeof inner.data === 'string') list.push(['Data', inner.data]);
  else list.push(['DHCP', inner.data.op], ['Your IP', formatIp(inner.data.yourIp)]);
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

export interface TraceOptions {
  /** Replaces the deciding device's table with a panel of the lesson's own. */
  panel?: (event: SimEvent) => PanelsView['panels'][number] | undefined;
  /** Actions to leave out, such as ARP in a lesson about routing. */
  hide?: string[];
}

/** One step per event; a Note's `action` picks the code line. Past MAX_STEPS the rest fold into one summary step. */
export function traceSteps(result: SimResult, code: string, lines: Record<string, string>, options: TraceOptions = {}): Step[] {
  const log: string[] = [];
  const labels = new Map(result.devices.map((device) => [device.id, device.label]));
  const events = result.events.filter((event) => !options.hide?.includes(event.action));
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
          { label: 'Network', view: networkView(result, event, log.slice(-LOG_LENGTH)) },
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
      view: { kind: 'panels', panels: [{ label: 'Network', view: networkView(result, events.at(-1)!, log.slice(-LOG_LENGTH)) }] },
    });
  }
  return steps;
}
