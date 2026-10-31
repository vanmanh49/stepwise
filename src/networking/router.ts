import { broadcastOf, formatIp, inSubnet, networkOf } from './address';
import { createArp, IP_HEADER } from './devices';
import { BROADCAST_MAC, ipLength, type Frame, type Icmp, type IpPacket, type Udp } from './packet';
import { formatTime, type Ctx, type Device } from './sim';

const LIMITED_BROADCAST = 0xffffffff;
const ERROR_TTL = 64;
const FIRST_NAT_PORT = 40000;

export interface Route {
  network: number;
  prefix: number;
  nextHop?: number;
  port: string;
  metric: number;
}

export interface Interface {
  port: string;
  ip: number;
  prefix: number;
  mac: string;
}

export interface NatConfig {
  insidePort: string;
  outsidePort: string;
  publicIp: number;
  timeoutS: number;
}

export interface RouterConfig {
  id: string;
  label: string;
  column: number;
  interfaces: Interface[];
  routes: Route[];
  silent?: boolean;
  nat?: NatConfig;
}

interface Mapping {
  insideIp: number;
  insidePort: number;
  publicPort: number;
  expiresAt: number;
}

/** Longest prefix first, then lowest metric, skipping routes on a down port. */
export function lookup(routes: Route[], dst: number, isUp: (port: string) => boolean): Route | undefined {
  return routes
    .filter((route) => isUp(route.port) && inSubnet(dst, route.network, route.prefix))
    .reduce<Route | undefined>((best, route) => (!best || route.prefix > best.prefix || (route.prefix === best.prefix && route.metric < best.metric) ? route : best), undefined);
}

const cidr = (route: Route) => `${formatIp(route.network)}/${route.prefix}`;
const isError = (packet: IpPacket) => packet.payload.kind === 'icmp' && packet.payload.type !== 'echo-request' && packet.payload.type !== 'echo-reply';

/** Cuts a packet to fit `mtu`. Every piece but the last holds a multiple of 8 bytes, because offsets count in eights. */
function fragment(packet: IpPacket, mtu: number): IpPacket[] {
  const most = Math.floor((mtu - IP_HEADER) / 8) * 8;
  const bytes = ipLength(packet) - IP_HEADER;
  const pieces: IpPacket[] = [];
  for (let start = 0; start < bytes; start += most) {
    const size = Math.min(most, bytes - start);
    pieces.push({ ...packet, length: size + IP_HEADER, offset: (packet.offset ?? 0) + start, more: start + size < bytes || packet.more === true });
  }
  return pieces;
}

export function createRouter(config: RouterConfig): Device {
  const { interfaces, nat, label } = config;
  const connected: Route[] = interfaces.map(({ ip, prefix, port }) => ({ network: networkOf(ip, prefix), prefix, port, metric: 0 }));
  const routes = [...connected, ...config.routes];
  const arps = new Map(interfaces.map((each) => [each.port, createArp()]));
  const mappings: Mapping[] = [];

  const ifaceOn = (port: string) => interfaces.find((each) => each.port === port)!;
  const isBroadcast = (dst: number) => dst === LIMITED_BROADCAST || interfaces.some(({ ip, prefix }) => prefix < 31 && broadcastOf(ip, prefix) === dst);

  /** Sends a packet this router wrote itself: an ICMP error or an echo reply. */
  function originate(ctx: Ctx, arrival: Interface, dst: number, payload: Icmp, title: string, why: string, action: string) {
    const packet: IpPacket = { kind: 'ip', src: arrival.ip, dst, ttl: ERROR_TTL, id: 0, payload };
    const route = lookup(routes, dst, ctx.linkUp);
    if (!route) {
      ctx.note({ action: 'no-route', title: `${label} has no route back to ${formatIp(dst)}`, why: 'A router needs a route for its own messages too, so this one is lost.' });
      return;
    }
    const out = ifaceOn(route.port);
    arps.get(route.port)!.resolve(ctx, route.port, out, route.nextHop ?? dst, (dstMac) => {
      if (dstMac) ctx.send([route.port], { srcMac: out.mac, dstMac, payload: packet }, { action, title, why });
    });
  }

  /** Reports a failed packet to its sender, unless this router is silent or the packet is itself an error. */
  function reportError(ctx: Ctx, arrival: Interface, packet: IpPacket, type: 'time-exceeded' | 'unreachable', action: string, title: string, why: string) {
    if (config.silent) {
      ctx.note({ action: 'silent-drop', title: `${label} drops it and says nothing`, why: 'Many routers are set not to send ICMP errors, so the sender hears nothing back.' });
      return;
    }
    if (isError(packet)) {
      ctx.note({ action: 'error-dropped', title: `${label} drops an ICMP error`, why: 'Routers never send an error about an error, or one failure could set off a storm.' });
      return;
    }
    const seq = packet.payload.kind === 'icmp' ? packet.payload.seq : 0;
    originate(ctx, arrival, packet.src, { kind: 'icmp', type, seq }, title, why, action);
  }

  function tooBig(ctx: Ctx, arrival: Interface, packet: IpPacket, arrived: Frame, mtu: number) {
    if (config.silent) {
      ctx.note({ action: 'black-hole', title: `${label} drops ${ipLength(packet)} bytes and says nothing`, why: `The next link's MTU is ${mtu} and the packet says Don't Fragment. This router sends no ICMP, so the sender never learns why its data vanishes.` }, arrived);
      return;
    }
    originate(ctx, arrival, packet.src, { kind: 'icmp', type: 'frag-needed', seq: 0, mtu, dst: packet.dst }, `${ipLength(packet)} bytes won't fit: Fragmentation Needed`, `The next link's MTU is ${mtu} and the packet says Don't Fragment, so ${label} drops it and tells the sender the size that fits.`, 'frag-needed');
  }

  function forward(ctx: Ctx, packet: IpPacket, arrived: Frame, arrival: Interface) {
    const dst = formatIp(packet.dst);
    const route = lookup(routes, packet.dst, ctx.linkUp);
    if (!route) {
      reportError(ctx, arrival, packet, 'unreachable', 'no-route', `${label} has no route to ${dst}`, 'No usable row in the table matches, so the packet is dropped and the sender is told.');
      return;
    }
    const skipped = routes.find((each) => !ctx.linkUp(each.port) && inSubnet(packet.dst, each.network, each.prefix) && (each.prefix > route.prefix || (each.prefix === route.prefix && each.metric < route.metric)));
    ctx.note({
      action: 'route-match',
      title: `${dst} matches ${cidr(route)}`,
      why: `${label} picks the matching row with the longest prefix. Here that is /${route.prefix}, going out of ${route.port}.${skipped?.nextHop === undefined ? '' : ` The row via ${formatIp(skipped.nextHop)} is skipped because its link is down.`}`,
      table: { index: 0, row: routes.indexOf(route) },
    }, arrived);
    const out = ifaceOn(route.port);
    const nextHop = route.nextHop ?? packet.dst;
    arps.get(route.port)!.resolve(ctx, route.port, out, nextHop, (dstMac) => {
      if (!dstMac) {
        reportError(ctx, arrival, packet, 'unreachable', 'no-arp', `${label} cannot find ${formatIp(nextHop)}`, 'The last hop did not answer ARP, so the packet cannot be delivered and the sender is told.');
        return;
      }
      const onward: IpPacket = { ...packet, ttl: packet.ttl - 1 };
      const mtu = ctx.mtu(route.port);
      if (mtu !== undefined && ipLength(packet) > mtu) {
        if (packet.df) {
          tooBig(ctx, arrival, packet, arrived, mtu);
          return;
        }
        for (const piece of fragment(onward, mtu)) {
          ctx.send([route.port], { srcMac: out.mac, dstMac, payload: piece }, {
            action: 'fragment',
            title: `${label} sends a fragment of ${piece.length} bytes, offset ${piece.offset}`,
            why: `${ipLength(packet)} bytes won't fit the next link's MTU of ${mtu}, and this packet may be split. Offsets count in eights, so each fragment's data is a multiple of 8 bytes, except the last.`,
            before: arrived,
          });
        }
        return;
      }
      const seen = arrived.payload.kind === 'ip' ? arrived.payload : packet;
      const newSource = seen.src !== packet.src;
      const newDestination = seen.dst !== packet.dst;
      const change = newSource ? `NAT changed the source IP to ${formatIp(packet.src)}.` : newDestination ? `NAT changed the destination IP to ${dst}.` : `The source and destination IPs stay ${formatIp(packet.src)} and ${dst}.`;
      ctx.send([route.port], { srcMac: out.mac, dstMac, payload: onward }, {
        action: newSource ? 'nat-send-out' : newDestination ? 'nat-send-in' : 'forward-hop',
        title: `${label} forwards it, TTL ${packet.ttl} → ${onward.ttl}`,
        why: `A new frame carries it to the next hop, so both MAC addresses change. ${change}`,
        before: arrived,
      });
    });
  }

  const live = (now: number) => mappings.filter((mapping) => now < mapping.expiresAt);

  function natOut(ctx: Ctx, packet: IpPacket, udp: Udp, frame: Frame): IpPacket {
    const { publicIp, timeoutS } = nat!;
    const active = live(ctx.now);
    const inside = `${formatIp(packet.src)}:${udp.srcPort}`;
    let mapping = active.find((each) => each.insideIp === packet.src && each.insidePort === udp.srcPort);
    if (!mapping) {
      const taken = new Set(active.map((each) => each.publicPort));
      let publicPort = udp.srcPort;
      if (taken.has(publicPort)) {
        publicPort = FIRST_NAT_PORT;
        while (taken.has(publicPort)) publicPort++;
      }
      mappings.splice(0, mappings.length, ...active);
      mapping = { insideIp: packet.src, insidePort: udp.srcPort, publicPort, expiresAt: ctx.now + timeoutS * 1000 };
      mappings.push(mapping);
      const clash = publicPort !== udp.srcPort;
      ctx.note({
        action: clash ? 'nat-new-port' : 'nat-out',
        title: clash ? `Port ${udp.srcPort} is taken, so ${inside} gets public port ${publicPort}` : `${inside} goes out as ${formatIp(publicIp)}:${publicPort}`,
        why: clash
          ? 'This router matches replies on the public port alone, so two inside hosts can\'t share one.'
          : 'Private addresses mean nothing on the internet, so the router swaps in its public address and notes the swap in its table.',
        table: { index: 2, row: mappings.length - 1 },
      }, frame);
    }
    mapping.expiresAt = ctx.now + timeoutS * 1000;
    return { ...packet, src: publicIp, payload: { ...udp, srcPort: mapping.publicPort } };
  }

  function natIn(ctx: Ctx, packet: IpPacket, frame: Frame): IpPacket | undefined {
    const udp = packet.payload.kind === 'udp' ? packet.payload : undefined;
    const mapping = udp && live(ctx.now).find((each) => each.publicPort === udp.dstPort);
    const lapsed = udp && !mapping ? mappings.find((each) => each.publicPort === udp.dstPort) : undefined;
    if (lapsed) {
      ctx.note({
        action: 'nat-expired',
        title: `The mapping for port ${lapsed.publicPort} expired at ${formatTime(lapsed.expiresAt)}, so the packet is dropped`,
        why: 'The conversation went quiet for longer than the timeout, so the router forgot it. The reply came too late, and the router no longer knows who asked.',
        table: { index: 2, row: mappings.indexOf(lapsed) },
      }, frame);
      mappings.splice(mappings.indexOf(lapsed), 1);
      return undefined;
    }
    if (!udp || !mapping) {
      ctx.note({
        action: 'nat-drop',
        title: `No mapping for port ${udp?.dstPort ?? '?'}, so the packet is dropped`,
        why: 'The table is the only record of who is inside. With no matching row, the router has nowhere to send this. It is why you can\'t reach a home computer from outside without port forwarding.',
      }, frame);
      return undefined;
    }
    mapping.expiresAt = ctx.now + nat!.timeoutS * 1000;
    ctx.note({
      action: 'nat-in',
      title: `Port ${udp.dstPort} belongs to ${formatIp(mapping.insideIp)}:${mapping.insidePort}`,
      why: 'The reply is addressed to the router. The table says who really asked, so the router puts the inside address back.',
      table: { index: 2, row: mappings.indexOf(mapping) },
    }, frame);
    return { ...packet, dst: mapping.insideIp, payload: { ...udp, dstPort: mapping.insidePort } };
  }

  return {
    id: config.id,
    label,
    type: 'router',
    column: config.column,
    badge: () => (nat ? 'NAT' : undefined),
    receive(ctx, frame, port) {
      const arrival = ifaceOn(port);
      if (frame.dstMac !== arrival.mac && frame.dstMac !== BROADCAST_MAC) return;
      if (frame.payload.kind === 'arp') {
        arps.get(port)!.receive(ctx, port, arrival, frame.payload);
        return;
      }
      if (frame.payload.kind !== 'ip') return;
      let packet = frame.payload;
      if (nat && port === nat.outsidePort && packet.dst === nat.publicIp) {
        const restored = natIn(ctx, packet, frame);
        if (!restored) return;
        packet = restored;
      } else if (interfaces.some((each) => each.ip === packet.dst)) {
        const { payload } = packet;
        if (payload.kind === 'icmp' && payload.type === 'echo-request') {
          originate(ctx, ifaceOn(interfaces.find((each) => each.ip === packet.dst)!.port), packet.src, { kind: 'icmp', type: 'echo-reply', seq: payload.seq }, `${label} answers ping ${payload.seq}`, 'The packet is for this router, so it replies like any host.', 'echo-reply');
        }
        return;
      }
      if (isBroadcast(packet.dst)) {
        ctx.note({ action: 'no-forward', title: `${label} won't forward a broadcast`, why: `${formatIp(packet.dst)} means everyone on one network. Routers stop broadcasts at the edge, or one packet could reach the whole internet.` }, frame);
        return;
      }
      if (packet.ttl <= 1) {
        reportError(ctx, arrival, packet, 'time-exceeded', 'ttl-expired', `TTL ran out at ${label}`, 'Every router lowers the TTL by one. At zero the packet dies, so a routing loop can\'t keep it alive forever, and the sender gets a Time Exceeded.');
        return;
      }
      // shortcut: NAT only translates UDP, because no lesson sends ICMP through it; ICMP would need a query id.
      if (nat && port === nat.insidePort && packet.payload.kind === 'udp') packet = natOut(ctx, packet, packet.payload, frame);
      forward(ctx, packet, frame, arrival);
    },
    tables: () => [
      { title: `${label} routes`, columns: ['Network', 'Via', 'Port', 'Metric'], rows: routes.map((route) => [cidr(route), route.nextHop === undefined ? 'direct' : formatIp(route.nextHop), route.port, String(route.metric)]) },
      { title: `${label} ARP`, columns: ['IP', 'MAC'], rows: [...arps.values()].flatMap((arp) => arp.table().rows) },
      ...(nat ? [{ title: 'NAT table', columns: ['Inside', 'Public port', 'Expires'], rows: mappings.map(({ insideIp, insidePort, publicPort, expiresAt }) => [`${formatIp(insideIp)}:${insidePort}`, String(publicPort), formatTime(expiresAt)]) }] : []),
    ],
  };
}
