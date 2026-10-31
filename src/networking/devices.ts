import { formatIp, inSubnet, ipv4 } from './address';
import { BROADCAST_MAC, DHCP_CLIENT_PORT, DHCP_SERVER_PORT, ICMP_NAME, ipLength, type Arp, type Dhcp, type Frame, type Icmp, type IpPacket, type Udp } from './packet';
import { formatTime, type Ctx, type Device, type Note, type TableSnapshot } from './sim';
import { createTcp, type Conn, type TcpOptions } from './tcp';

export const ARP_TIMEOUT_MS = 1000;
export const DHCP_RETRY_MS = 4000;
const DEFAULT_TTL = 64;
const ETH = 'eth0';
export const IP_HEADER = 20;
const IP_UDP_HEADERS = 28;
const IP_TCP_HEADERS = 40;
const DEFAULT_MSS = 1000;
const LOOPBACK = ipv4('127.0.0.0');

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
  /** How long an echo waits before it leaves. */
  echoDelayMs?: number;
  /** Sets the MSS to `mtu − 40`; otherwise it is 1000. */
  mtu?: number;
}

export interface Reply {
  seq: number;
  from: number;
  type: Icmp['type'];
  rttMs: number;
}

export interface Host extends Device {
  ping(ctx: Ctx, dst: number, seq: number, ttl?: number): void;
  /** `size` sets the data bytes; with none, the packet counts as 40 bytes. */
  udp(ctx: Ctx, dst: number, srcPort: number, dstPort: number, text: string, options?: { size?: number; df?: boolean }): void;
  bindUdp(port: number, label: string): void;
  /** Starts DHCP. A host that will boot has an address of 0. */
  boot(ctx: Ctx): void;
  address(): number;
  listen(port: number, options?: TcpOptions): void;
  connect(ctx: Ctx, dst: number, port: number, options?: TcpOptions): Conn;
  write(ctx: Ctx, conn: Conn, bytes: number, mark?: unknown): void;
  close(ctx: Ctx, conn: Conn): void;
  connections(): Conn[];
  mac: string;
  replies: Reply[];
}

export function createHost(config: HostConfig): Host {
  const { mac, gateway } = config;
  let { ip, prefix } = config;
  let dhcpState: 'off' | 'discovering' | 'requesting' | 'bound' = 'off';
  const arp = createArp(config.arp);
  const sent = new Map<number, number>();
  const programs = new Map<number, string>();
  const fragments = new Map<string, IpPacket[]>();
  let nextId = 1;

  const tcp = createTcp({
    ip: () => ip,
    mss: () => (config.mtu ? config.mtu - IP_TCP_HEADERS : DEFAULT_MSS),
    transmit: (ctx, dst, segment, note) => transmit(ctx, { ...packet(dst, DEFAULT_TTL, segment), length: IP_TCP_HEADERS + segment.length, df: true }, note),
  });

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
    if (ipPacket.dst === ip || inSubnet(ipPacket.dst, LOOPBACK, 8)) {
      ctx.note({ action: 'loopback', title: `${dst} is this host`, why: 'A host that sends to itself needs no network, and every 127.x.x.x address means "this machine". Nothing goes on the wire.' });
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

  /** Returns the whole packet once every piece is here. */
  function reassemble(ctx: Ctx, piece: IpPacket): IpPacket | undefined {
    const key = `${piece.src}:${piece.id}`;
    const pieces = [...(fragments.get(key) ?? []), piece].toSorted((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
    fragments.set(key, pieces);
    let end = 0;
    for (const each of pieces) {
      if ((each.offset ?? 0) !== end) return undefined;
      end += ipLength(each) - IP_HEADER;
    }
    if (pieces.at(-1)!.more) return undefined;
    fragments.delete(key);
    ctx.note({ action: 'reassembled', title: `${config.label} joins ${pieces.length} fragments back together`, why: `Every fragment of packet ${piece.id} is here, so the offsets line up into ${end} bytes. Only the destination does this.` });
    const { offset: _offset, more: _more, ...whole } = piece;
    return { ...whole, length: end + IP_HEADER };
  }

  function receiveIp(ctx: Ctx, arrived: IpPacket) {
    const ipPacket = arrived.more || arrived.offset ? reassemble(ctx, arrived) : arrived;
    if (!ipPacket) return;
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
      const why = payload.type === 'frag-needed' ? `A link on the way only carries ${payload.mtu} bytes, and this packet may not be split.` : `It came back ${formatTime(rttMs)} after the request left.`;
      ctx.note({ action: 'reply-received', title: `${ICMP_NAME[payload.type]} from ${formatIp(src)}`, why }, undefined);
      if (payload.type === 'frag-needed') tcp.lowerMss(ctx, payload.dst!, payload.mtu!);
      return;
    }
    if (payload.kind === 'tcp') return tcp.receive(ctx, src, payload);
    if (typeof payload.data === 'string') receiveUdp(ctx, src, payload);
    else receiveDhcp(ctx, payload.data);
  }

  const broadcastDhcp = (data: Dhcp): Frame => ({
    srcMac: mac,
    dstMac: BROADCAST_MAC,
    payload: { kind: 'ip', src: 0, dst: 0xffffffff, ttl: DEFAULT_TTL, id: nextId++, payload: { kind: 'udp', srcPort: DHCP_CLIENT_PORT, dstPort: DHCP_SERVER_PORT, data } },
  });

  function discover(ctx: Ctx, retries: number) {
    ctx.send([ETH], broadcastDhcp({ op: 'discover', yourIp: 0, serverIp: 0, leaseS: 0 }), {
      action: 'dhcp-discover',
      title: `${config.label} asks for an address`,
      why: 'It has no address and knows no server, so it sends from 0.0.0.0 to 255.255.255.255, the one address that reaches everyone on this network.',
    });
    ctx.after(DHCP_RETRY_MS, () => {
      if (dhcpState !== 'discovering') return;
      if (retries > 0) {
        ctx.note({ action: 'dhcp-retry', title: `No answer after ${formatTime(DHCP_RETRY_MS)}`, why: 'Broadcasts can be missed, so the client asks again.' });
        discover(ctx, retries - 1);
        return;
      }
      const [, , , , high = '0', low = '0'] = mac.split(':');
      ip = (((169 * 256 + 254) * 65536) + parseInt(high, 16) * 256 + parseInt(low, 16)) >>> 0;
      prefix = 16;
      dhcpState = 'off';
      ctx.note({ action: 'dhcp-fallback', title: `${config.label} gives itself ${formatIp(ip)}`, why: 'With no server, a host picks a link-local address from 169.254.0.0/16. It can talk to neighbours, but not to the internet.' });
    });
  }

  function renew(ctx: Ctx, data: Dhcp) {
    ctx.after(data.leaseS * 500, () => {
      const request = packet(data.serverIp, DEFAULT_TTL, { kind: 'udp', srcPort: DHCP_CLIENT_PORT, dstPort: DHCP_SERVER_PORT, data: { op: 'request', yourIp: ip, serverIp: data.serverIp, leaseS: 0 } });
      transmit(ctx, request, {
        action: 'dhcp-renew',
        title: `${config.label} renews ${formatIp(ip)}`,
        why: `Half of the ${data.leaseS} s lease has passed, so the client asks to keep the address. This time it can ask the server directly.`,
      });
    });
  }

  function receiveDhcp(ctx: Ctx, data: Dhcp) {
    if (data.op === 'offer' && dhcpState === 'discovering') {
      dhcpState = 'requesting';
      ctx.send([ETH], broadcastDhcp({ op: 'request', yourIp: data.yourIp, serverIp: data.serverIp, leaseS: 0 }), {
        action: 'dhcp-request',
        title: `${config.label} requests ${formatIp(data.yourIp)}`,
        why: 'This is still a broadcast, so any other server that made an offer learns which one was chosen.',
      });
    } else if (data.op === 'ack') {
      const renewed = ip === data.yourIp;
      ip = data.yourIp;
      dhcpState = 'bound';
      ctx.note({
        action: 'dhcp-bound',
        title: renewed ? `${config.label} keeps ${formatIp(ip)}` : `${config.label} now has ${formatIp(ip)}`,
        why: `The lease lasts ${data.leaseS} s. The client will ask to renew at half that time.`,
      });
      renew(ctx, data);
    }
  }

  function receiveUdp(ctx: Ctx, src: number, udp: Udp) {
    if (!config.echo && !programs.has(udp.dstPort)) {
      transmit(ctx, packet(src, DEFAULT_TTL, { kind: 'icmp', type: 'port-unreachable', seq: 0 }), {
        action: 'port-unreachable',
        title: `Nothing is bound to port ${udp.dstPort}`,
        why: 'The host has no program for this port, so it throws the datagram away and tells the sender with an ICMP error.',
      });
      return;
    }
    ctx.note({
      action: 'udp-received',
      title: `${programs.get(udp.dstPort) ?? config.label} got "${String(udp.data)}" on port ${udp.dstPort}`,
      why: `The datagram came from ${formatIp(src)} port ${udp.srcPort}.`,
    });
    if (!config.echo) return;
    const reply = packet(src, DEFAULT_TTL, { kind: 'udp', srcPort: udp.dstPort, dstPort: udp.srcPort, data: udp.data });
    ctx.after(config.echoDelayMs ?? 0, () =>
      transmit(ctx, reply, {
        action: 'udp-echo',
        title: `${config.label} replies to ${formatIp(src)} port ${udp.srcPort}`,
        why: 'It swaps the source and destination it saw. It only knows the address the packet arrived with.',
      }),
    );
  }

  const host: Host = {
    id: config.id,
    label: config.label,
    type: 'host',
    column: config.column,
    mac,
    replies: [],
    badge: () => (ip === 0 ? 'no address' : formatIp(ip)),
    ping(ctx, dst, seq, ttl = DEFAULT_TTL) {
      sent.set(seq, ctx.now);
      originate(ctx, packet(dst, ttl, { kind: 'icmp', type: 'echo-request', seq }), `Ping ${seq}`);
    },
    boot(ctx) {
      dhcpState = 'discovering';
      discover(ctx, 1);
    },
    address: () => ip,
    listen: tcp.listen,
    connect: tcp.connect,
    write: tcp.write,
    close: tcp.close,
    connections: tcp.connections,
    udp(ctx, dst, srcPort, dstPort, text, { size, df } = {}) {
      if (!programs.has(srcPort)) programs.set(srcPort, config.label);
      sent.set(0, ctx.now);
      const datagram = packet(dst, DEFAULT_TTL, { kind: 'udp', srcPort, dstPort, data: text });
      originate(ctx, { ...datagram, ...(size === undefined ? {} : { length: IP_UDP_HEADERS + size }), ...(df ? { df } : {}) }, `A UDP datagram`);
    },
    bindUdp(port, label) {
      programs.set(port, label);
    },
    receive(ctx, frame: Frame, port) {
      if (frame.dstMac !== mac && frame.dstMac !== BROADCAST_MAC) {
        ctx.note({ action: 'not-mine', title: `${config.label} ignores the frame`, why: `The frame is for ${frame.dstMac}, and this host is ${mac}.` }, frame);
        return;
      }
      if (frame.payload.kind === 'arp') arp.receive(ctx, port, own(), frame.payload);
      else if (frame.payload.dst === ip || frame.payload.dst === 0xffffffff) receiveIp(ctx, frame.payload);
    },
    tables: () => [
      arp.table(),
      { title: 'Replies', columns: ['Seq', 'From', 'Reply', 'Time'], rows: host.replies.map(({ seq, from, type, rttMs }) => [String(seq), formatIp(from), ICMP_NAME[type], formatTime(rttMs)]) },
      tcp.table(),
      tcp.congestion(),
    ],
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
