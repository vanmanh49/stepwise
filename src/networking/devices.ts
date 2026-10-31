import { formatIp, inSubnet } from './address';
import { BROADCAST_MAC, type Arp, type Frame, type Icmp, type IpPacket, type Udp } from './packet';
import { formatTime, type Ctx, type Device, type Note, type TableSnapshot } from './sim';

export const ARP_TIMEOUT_MS = 1000;
const DEFAULT_TTL = 64;
const ETH = 'eth0';

export interface Own {
  mac: string;
  ip: number;
}

/** An ARP cache: packets wait in `resolve` until the answer arrives or the timeout passes. */
export function createArp(initial: Record<number, string> = {}) {
  const cache = new Map(Object.entries(initial).map(([ip, mac]) => [Number(ip), mac]));
  const waiting = new Map<number, ((mac: string | undefined) => void)[]>();

  return {
    known: (target: number) => cache.has(target),
    resolve(ctx: Ctx, port: string, own: Own, target: number, done: (mac: string | undefined) => void) {
      const mac = cache.get(target);
      if (mac) return done(mac);
      const held = waiting.get(target);
      if (held) return void held.push(done);
      waiting.set(target, [done]);
      const payload: Arp = { kind: 'arp', op: 'request', senderMac: own.mac, senderIp: own.ip, targetMac: '', targetIp: target };
      ctx.send([port], { srcMac: own.mac, dstMac: BROADCAST_MAC, payload }, {
        action: 'arp-request',
        title: `Who has ${formatIp(target)}? Tell ${formatIp(own.ip)}`,
        why: 'An IP address cannot go on the wire: Ethernet needs a MAC address. Nobody knows who to ask, so the question goes to everyone.',
      });
      ctx.after(ARP_TIMEOUT_MS, () => {
        const stuck = waiting.get(target);
        if (!stuck) return;
        waiting.delete(target);
        ctx.note({
          action: 'arp-failed',
          title: `Nobody answered for ${formatIp(target)}`,
          why: `After ${formatTime(ARP_TIMEOUT_MS)} with no answer, the sender gives up and drops the waiting packet.`,
        });
        for (const each of stuck) each(undefined);
      });
    },
    receive(ctx: Ctx, port: string, own: Own, arp: Arp) {
      if (arp.op === 'request') {
        if (arp.targetIp !== own.ip) return;
        cache.set(arp.senderIp, arp.senderMac);
        const payload: Arp = { kind: 'arp', op: 'reply', senderMac: own.mac, senderIp: own.ip, targetMac: arp.senderMac, targetIp: arp.senderIp };
        ctx.send([port], { srcMac: own.mac, dstMac: arp.senderMac, payload }, {
          action: 'arp-reply',
          title: `${formatIp(own.ip)} is at ${own.mac}`,
          why: `Only the owner of ${formatIp(own.ip)} answers, straight back to the asker. It also keeps the asker's address, since a reply is likely to follow.`,
        });
        return;
      }
      cache.set(arp.senderIp, arp.senderMac);
      const held = waiting.get(arp.senderIp);
      waiting.delete(arp.senderIp);
      for (const each of held ?? []) each(arp.senderMac);
    },
    table: (): TableSnapshot => ({ title: 'ARP cache', columns: ['IP', 'MAC'], rows: [...cache].map(([ip, mac]) => [formatIp(ip), mac]) }),
  };
}

export interface HostConfig {
  id: string;
  label: string;
  column: number;
  mac: string;
  ip: number;
  prefix: number;
  gateway?: number;
  arp?: Record<number, string>;
  /** Sends UDP back to its sender, as an echo server does. */
  echo?: boolean;
}

export interface Reply {
  seq: number;
  from: number;
  type: Icmp['type'];
  rttMs: number;
}

export interface Host extends Device {
  ping(ctx: Ctx, dst: number, seq: number, ttl?: number): void;
  udp(ctx: Ctx, dst: number, srcPort: number, dstPort: number, text: string): void;
  replies: Reply[];
}

export function createHost(config: HostConfig): Host {
  const { mac, prefix, gateway } = config;
  const ip = config.ip;
  const arp = createArp(config.arp);
  const sent = new Map<number, number>();
  let nextId = 1;

  const own = (): Own => ({ mac, ip });
  const packet = (dst: number, ttl: number, payload: IpPacket['payload']): IpPacket => ({ kind: 'ip', src: ip, dst, ttl, id: nextId++, payload });
  const isLocal = (dst: number) => inSubnet(dst, ip, prefix);

  /** Finds the next hop's MAC, then sends. Replies use this too, with no separate routing step. */
  function transmit(ctx: Ctx, ipPacket: IpPacket, note: Note) {
    const nextHop = isLocal(ipPacket.dst) ? ipPacket.dst : gateway;
    if (nextHop === undefined) return;
    arp.resolve(ctx, ETH, own(), nextHop, (dstMac) => {
      if (dstMac) ctx.send([ETH], { srcMac: mac, dstMac, payload: ipPacket }, note);
    });
  }

  /** The routing decision every host makes before sending. */
  function originate(ctx: Ctx, ipPacket: IpPacket, label: string) {
    const dst = formatIp(ipPacket.dst);
    if (ipPacket.dst === ip) {
      ctx.note({ action: 'loopback', title: `${dst} is this host`, why: 'A host that sends to its own address needs no network. Nothing goes on the wire.' });
      return;
    }
    if (!isLocal(ipPacket.dst) && gateway === undefined) {
      ctx.note({ action: 'no-gateway', title: `No way to reach ${dst}`, why: `${dst} is outside ${formatIp(ip)}/${prefix} and this host has no gateway.` });
      return;
    }
    const local = isLocal(ipPacket.dst);
    ctx.note({
      action: local ? 'local' : 'via-gateway',
      title: local ? `${dst} is on this subnet` : `${dst} is on another subnet`,
      why: local
        ? `${dst} is inside ${formatIp(ip)}/${prefix}, so it can be reached directly.`
        : `${dst} is outside ${formatIp(ip)}/${prefix}, so the frame goes to the gateway ${formatIp(gateway!)}. The IP header still names ${dst}.`,
    });
    if (arp.known(local ? ipPacket.dst : gateway!)) {
      ctx.note({ action: 'arp-hit', title: `The ARP cache already has ${formatIp(local ? ipPacket.dst : gateway!)}`, why: 'The MAC address was learned earlier, so no ARP request is needed.' });
    }
    transmit(ctx, ipPacket, { action: 'send', title: `${label} leaves ${config.label}`, why: `The packet goes out with destination ${dst}.` });
  }

  function receiveIp(ctx: Ctx, ipPacket: IpPacket) {
    const { payload, src } = ipPacket;
    if (payload.kind === 'icmp') {
      if (payload.type === 'echo-request') {
        const reply = packet(src, DEFAULT_TTL, { kind: 'icmp', type: 'echo-reply', seq: payload.seq });
        transmit(ctx, reply, {
          action: 'echo-reply',
          title: `${config.label} answers ping ${payload.seq}`,
          why: `An Echo Request gets an Echo Reply, sent back to ${formatIp(src)}.`,
        });
        return;
      }
      const rttMs = ctx.now - (sent.get(payload.seq) ?? ctx.now);
      host.replies.push({ seq: payload.seq, from: src, type: payload.type, rttMs });
      ctx.note({ action: 'reply-received', title: `${payload.type} from ${formatIp(src)}`, why: `It came back ${formatTime(rttMs)} after the request left.` }, undefined);
      return;
    }
    if (typeof payload.data === 'string') receiveUdp(ctx, src, payload);
  }

  function receiveUdp(ctx: Ctx, src: number, udp: Udp) {
    ctx.note({
      action: 'udp-received',
      title: `${config.label} got "${String(udp.data)}" on port ${udp.dstPort}`,
      why: `The datagram came from ${formatIp(src)} port ${udp.srcPort}.`,
    });
    if (!config.echo) return;
    const reply = packet(src, DEFAULT_TTL, { kind: 'udp', srcPort: udp.dstPort, dstPort: udp.srcPort, data: udp.data });
    transmit(ctx, reply, {
      action: 'udp-echo',
      title: `${config.label} replies to ${formatIp(src)} port ${udp.srcPort}`,
      why: 'It swaps the source and destination it saw. It only knows the address the packet arrived with.',
    });
  }

  const host: Host = {
    id: config.id,
    label: config.label,
    type: 'host',
    column: config.column,
    replies: [],
    badge: () => formatIp(ip),
    ping(ctx, dst, seq, ttl = DEFAULT_TTL) {
      sent.set(seq, ctx.now);
      originate(ctx, packet(dst, ttl, { kind: 'icmp', type: 'echo-request', seq }), `Ping ${seq}`);
    },
    udp(ctx, dst, srcPort, dstPort, text) {
      originate(ctx, packet(dst, DEFAULT_TTL, { kind: 'udp', srcPort, dstPort, data: text }), `A UDP datagram`);
    },
    receive(ctx, frame: Frame, port) {
      if (frame.dstMac !== mac && frame.dstMac !== BROADCAST_MAC) {
        ctx.note({ action: 'not-mine', title: `${config.label} ignores the frame`, why: `The frame is for ${frame.dstMac}, and this host is ${mac}.` }, frame);
        return;
      }
      if (frame.payload.kind === 'arp') arp.receive(ctx, port, own(), frame.payload);
      else if (frame.payload.dst === ip) receiveIp(ctx, frame.payload);
    },
    tables: () => [arp.table()],
  };
  return host;
}

export interface SwitchConfig {
  id: string;
  label: string;
  column: number;
  ports: string[];
  agingS: number;
}

export function createSwitch({ id, label, column, ports, agingS }: SwitchConfig): Device {
  const table = new Map<string, { port: string; seenAt: number }>();
  const agingMs = agingS * 1000;
  const rowOf = (mac: string) => [...table.keys()].indexOf(mac);

  return {
    id,
    label,
    type: 'switch',
    column,
    receive(ctx, frame, port) {
      const { srcMac, dstMac } = frame;
      const before = table.get(srcMac);
      table.set(srcMac, { port, seenAt: ctx.now });
      if (before?.port !== port) {
        ctx.note({
          action: 'learn',
          title: `${srcMac} is on port ${port}`,
          why: before ? `It used to be on ${before.port}. The newest frame wins.` : 'Every frame shows where its sender is, so the switch writes that down.',
          table: { index: 0, row: rowOf(srcMac) },
        }, frame);
      }

      const entry = table.get(dstMac);
      if (entry && ctx.now - entry.seenAt > agingMs) {
        ctx.note({
          action: 'aged-out',
          title: `The entry for ${dstMac} has aged out`,
          why: `Nothing has come from it for over ${agingS} s, so the switch forgets it. A host may have moved or gone.`,
          table: { index: 0, row: rowOf(dstMac) },
        }, frame);
        table.delete(dstMac);
      }

      const known = table.get(dstMac);
      if (dstMac === BROADCAST_MAC || !known) {
        ctx.send(ports.filter((each) => each !== port), frame, {
          action: 'flood',
          title: dstMac === BROADCAST_MAC ? 'A broadcast goes to every other port' : `${dstMac} is unknown, so the switch floods`,
          why: dstMac === BROADCAST_MAC ? 'A broadcast is for everyone on this network.' : 'With no entry for the destination, the only way to reach it is to send the frame out of every other port.',
        });
        return;
      }
      if (known.port === port) return;
      ctx.send([known.port], frame, {
        action: 'forward',
        title: `Forward to port ${known.port}`,
        why: `The table says ${dstMac} is on ${known.port}, so no other host sees this frame.`,
        table: { index: 0, row: rowOf(dstMac) },
      });
    },
    tables: () => [{ title: 'MAC table', columns: ['MAC', 'Port', 'Last seen'], rows: [...table].map(([mac, entry]) => [mac, entry.port, formatTime(entry.seenAt)]) }],
  };
}
