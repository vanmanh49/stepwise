import { EventQueue } from '../utils/eventQueue';
import type { Frame } from './packet';

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
}

export interface SimResult {
  events: SimEvent[];
  cut: boolean;
  devices: Device[];
  links: Link[];
}

const LATENCY_MS = 1;

export const formatTime = (ms: number) => (ms < 1000 ? `${ms} ms` : `${ms / 1000} s`);

/** Runs a scenario on simulated milliseconds, ordered by (time, sequence), with faults first at equal times. */
export function simulate(scenario: Scenario): SimResult {
  const { devices } = scenario;
  const byId = new Map(devices.map((device) => [device.id, device]));
  const links = scenario.links.map((link) => ({ ...link }));
  const down = new Set<number>();
  const stopped = new Set<string>();
  const drops = (scenario.faults ?? []).flatMap((fault) => (fault.kind === 'dropPacket' ? [{ ...fault, seen: 0 }] : []));
  const queue = new EventQueue<() => void>();
  const events: SimEvent[] = [];
  let now = 0;

  const record = (device: string, note: Note, frame: Frame | undefined, hops: Hop[]) => {
    if (events.length >= MAX_EVENTS) return;
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
      tables: Object.fromEntries(devices.map((each) => [each.id, each.tables()])),
      badges,
      down: [...down],
      stopped: [...stopped],
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

  const ctxFor = (id: string): Ctx => ({
    get now() {
      return now;
    },
    send(ports, frame, note) {
      const hops: Hop[] = [];
      for (const port of ports) {
        const index = findLink(id, port);
        const link = links[index];
        if (!link || down.has(index)) continue;
        const [peer, peerPort] = link.a[0] === id && link.a[1] === port ? link.b : link.a;
        const lost = isDropped(frame);
        hops.push(lost ? { from: id, to: peer, lost } : { from: id, to: peer });
        if (lost) continue;
        queue.push(now + (link.ms ?? LATENCY_MS), () => {
          if (!stopped.has(peer) && !down.has(index)) byId.get(peer)?.receive(ctxFor(peer), frame, peerPort);
        });
      }
      record(id, note, frame, hops);
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

  while (events.length < MAX_EVENTS) {
    const next = queue.pop();
    if (!next || (scenario.endAt !== undefined && next.time > scenario.endAt)) break;
    now = next.time;
    next.item();
  }
  return { events, cut: events.length >= MAX_EVENTS, devices, links: scenario.links };
}
