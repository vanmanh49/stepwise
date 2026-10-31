import { EventQueue } from '../utils/eventQueue';
import { ipLength, type Frame } from './packet';

export const MAX_EVENTS = 2000;

export interface TableSnapshot {
  title: string;
  columns: string[];
  rows: string[][];
}

/** What a device says about a decision. `action` picks the code line; `table` marks the row that decided it. */
export interface Note {
  action: string;
  title: string;
  why: string;
  /** The frame as it arrived, when this step rewrote it. */
  before?: Frame;
  table?: { index: number; row: number };
}

export interface Ctx {
  readonly now: number;
  /** Puts a frame on these ports' links, as one event. */
  send(ports: string[], frame: Frame, note: Note): void;
  /** Records a decision with no traffic. */
  note(note: Note, frame?: Frame): void;
  after(ms: number, fire: () => void): void;
  linkUp(port: string): boolean;
  mtu(port: string): number | undefined;
}

export interface Device {
  id: string;
  label: string;
  type: 'host' | 'switch' | 'router' | 'dhcp';
  column: number;
  badge?(): string | undefined;
  receive(ctx: Ctx, frame: Frame, port: string): void;
  /** Must return fresh arrays: events keep them as a snapshot. */
  tables(): TableSnapshot[];
}

export interface Link {
  a: [device: string, port: string];
  b: [device: string, port: string];
  ms?: number;
  /** Bytes per ms. With a rate, each direction sends one frame at a time and the rest wait. */
  rate?: number;
  /** Bytes a direction may hold, counting the frame being sent. Beyond it, frames are dropped. */
  queueBytes?: number;
  mtu?: number;
}

export interface Command {
  at: number;
  device: string;
  run: (device: Device, ctx: Ctx) => void;
}

export type Fault =
  | { at: number; kind: 'linkDown'; link: number }
  | { at: number; kind: 'stopDevice'; device: string }
  | { at: number; kind: 'moveLink'; link: number; to: [device: string, port: string] }
  | { kind: 'dropPacket'; matches: (frame: Frame) => boolean; nth: number };

export interface Scenario {
  devices: Device[];
  links: Link[];
  commands: Command[];
  faults?: Fault[];
  endAt?: number;
  /** Defaults to MAX_EVENTS. */
  maxEvents?: number;
  /** Devices whose tables each event keeps; defaults to all. */
  watch?: string[];
}

export interface Hop {
  from: string;
  to: string;
  lost?: boolean;
}

export interface SimEvent extends Note {
  time: number;
  device: string;
  frame?: Frame;
  hops: Hop[];
  tables: Record<string, TableSnapshot[]>;
  badges: Record<string, string>;
  /** Indexes of the links that are down. */
  down: number[];
  stopped: string[];
  /** Bytes waiting per `${linkIndex}:${fromDevice}`, for directions that have carried a frame on a rated link. */
  queues: Record<string, number>;
}

export interface SimResult {
  events: SimEvent[];
  cut: boolean;
  devices: Device[];
  links: Link[];
}

const LATENCY_MS = 1;
export const QUEUE_DROP = 'queue-drop';

export const formatTime = (ms: number) => (ms < 1000 ? `${ms} ms` : `${ms / 1000} s`);

/** Runs a scenario on simulated milliseconds, ordered by (time, sequence), with faults first at equal times. */
export function simulate(scenario: Scenario): SimResult {
  const { devices, maxEvents = MAX_EVENTS } = scenario;
  const byId = new Map(devices.map((device) => [device.id, device]));
  const links = scenario.links.map((link) => ({ ...link }));
  const down = new Set<number>();
  const stopped = new Set<string>();
  const drops = (scenario.faults ?? []).flatMap((fault) => (fault.kind === 'dropPacket' ? [{ ...fault, seen: 0 }] : []));
  const watched = scenario.watch ? devices.filter((device) => scenario.watch!.includes(device.id)) : devices;
  const outbound = new Map<string, { freeAt: number; bytes: number }>();
  const queue = new EventQueue<() => void>();
  const events: SimEvent[] = [];
  let now = 0;

  const record = (device: string, note: Note, frame: Frame | undefined, hops: Hop[]) => {
    if (events.length >= maxEvents) return;
    const badges: Record<string, string> = {};
    for (const each of devices) {
      const badge = each.badge?.();
      if (badge) badges[each.id] = badge;
    }
    events.push({
      ...note,
      time: now,
      device,
      frame,
      hops,
      tables: Object.fromEntries(watched.map((each) => [each.id, each.tables()])),
      badges,
      down: [...down],
      stopped: [...stopped],
      queues: Object.fromEntries([...outbound].map(([key, { bytes }]) => [key, bytes])),
    });
  };

  const findLink = (device: string, port: string) =>
    links.findIndex(({ a, b }) => (a[0] === device && a[1] === port) || (b[0] === device && b[1] === port));

  const isDropped = (frame: Frame) => {
    let dropped = false;
    for (const drop of drops) {
      if (drop.matches(frame) && ++drop.seen === drop.nth) dropped = true;
    }
    return dropped;
  };

  /** How long a frame takes to leave, or undefined if the queue has no room for it. */
  const enqueue = (index: number, from: string, link: Link, frame: Frame) => {
    const { rate, queueBytes = Infinity } = link;
    if (!rate) return 0;
    const key = `${index}:${from}`;
    const direction = outbound.get(key) ?? { freeAt: 0, bytes: 0 };
    outbound.set(key, direction);
    const size = ipLength(frame.payload);
    if (direction.bytes + size > queueBytes) return undefined;
    direction.bytes += size;
    direction.freeAt = Math.max(now, direction.freeAt) + Math.ceil(size / rate);
    queue.push(direction.freeAt, () => {
      direction.bytes -= size;
    });
    return direction.freeAt - now;
  };

  const ctxFor = (id: string): Ctx => ({
    get now() {
      return now;
    },
    send(ports, frame, note) {
      const hops: Hop[] = [];
      let full = false;
      for (const port of ports) {
        const index = findLink(id, port);
        const link = links[index];
        if (!link || down.has(index)) continue;
        const [peer, peerPort] = link.a[0] === id && link.a[1] === port ? link.b : link.a;
        const faulted = isDropped(frame);
        const leavesIn = faulted ? undefined : enqueue(index, id, link, frame);
        const lost = leavesIn === undefined;
        full ||= lost && !faulted;
        hops.push(lost ? { from: id, to: peer, lost } : { from: id, to: peer });
        if (lost) continue;
        queue.push(now + leavesIn + (link.ms ?? LATENCY_MS), () => {
          if (!stopped.has(peer) && !down.has(index)) byId.get(peer)?.receive(ctxFor(peer), frame, peerPort);
        });
      }
      record(id, full ? { ...note, action: QUEUE_DROP, title: `${byId.get(id)?.label ?? id}'s queue is full`, why: 'The link can only send so fast, and the bytes already waiting fill the queue, so this frame is thrown away.' } : note, frame, hops);
    },
    note(note, frame) {
      record(id, note, frame, []);
    },
    after(ms, fire) {
      queue.push(now + ms, () => {
        if (!stopped.has(id)) fire();
      });
    },
    linkUp(port) {
      const index = findLink(id, port);
      return index >= 0 && !down.has(index);
    },
    mtu(port) {
      return links[findLink(id, port)]?.mtu;
    },
  });

  for (const fault of scenario.faults ?? []) {
    if (fault.kind === 'dropPacket') continue;
    queue.push(fault.at, () => {
      if (fault.kind === 'linkDown') down.add(fault.link);
      else if (fault.kind === 'stopDevice') stopped.add(fault.device);
      else links[fault.link] = { ...links[fault.link]!, b: fault.to };
    });
  }
  for (const command of scenario.commands) {
    queue.push(command.at, () => {
      const device = byId.get(command.device);
      if (device && !stopped.has(device.id)) command.run(device, ctxFor(device.id));
    });
  }

  while (events.length < maxEvents) {
    const next = queue.pop();
    if (!next || (scenario.endAt !== undefined && next.time > scenario.endAt)) break;
    now = next.time;
    next.item();
  }
  return { events, cut: events.length >= maxEvents, devices, links: scenario.links };
}
