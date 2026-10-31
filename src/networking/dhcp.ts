import { formatIp } from './address';
import { createArp, type Own } from './devices';
import { BROADCAST_MAC, DHCP_CLIENT_PORT, DHCP_SERVER_PORT, type Dhcp, type IpPacket } from './packet';
import { formatTime, type Ctx, type Device } from './sim';

const LIMITED_BROADCAST = 0xffffffff;
const ETH = 'eth0';

export interface DhcpServerConfig {
  id: string;
  label: string;
  column: number;
  mac: string;
  ip: number;
  pool: number[];
  leaseS: number;
}

export function createDhcpServer({ id, label, column, mac, ip, pool, leaseS }: DhcpServerConfig): Device {
  const leases = new Map<string, { address: number; expiresAt: number }>();
  const arp = createArp();
  const own: Own = { mac, ip };

  const expire = (now: number) => {
    for (const [client, lease] of leases) if (now >= lease.expiresAt) leases.delete(client);
  };

  function reply(ctx: Ctx, clientMac: string, dst: number, data: Dhcp, action: string, title: string, why: string) {
    const payload: IpPacket = { kind: 'ip', src: ip, dst, ttl: 64, id: 0, payload: { kind: 'udp', srcPort: DHCP_SERVER_PORT, dstPort: DHCP_CLIENT_PORT, data } };
    ctx.send([ETH], { srcMac: mac, dstMac: clientMac, payload }, { action, title, why, table: { index: 0, row: [...leases.keys()].indexOf(clientMac) } });
  }

  function handle(ctx: Ctx, clientMac: string, packet: IpPacket, data: Dhcp) {
    expire(ctx.now);
    const expiresAt = ctx.now + leaseS * 1000;
    if (data.op === 'discover') {
      const taken = new Set([...leases.values()].map((lease) => lease.address));
      const address = leases.get(clientMac)?.address ?? pool.find((each) => !taken.has(each));
      if (address === undefined) {
        ctx.note({ action: 'dhcp-silent', title: 'The pool is empty, so the server says nothing', why: `${pool.length === 1 ? 'The only address is' : `All ${pool.length} addresses are`} out on lease. DHCP has no "sorry" message for a Discover, so the client just hears silence.` });
        return;
      }
      // Held from the Offer, so a client asking at the same moment can't be offered the same address.
      leases.set(clientMac, { address, expiresAt });
      reply(ctx, clientMac, LIMITED_BROADCAST, { op: 'offer', yourIp: address, serverIp: ip, leaseS }, 'dhcp-offer', `Offer: ${formatIp(address)} for ${leaseS} s`, 'The server holds the lowest free address. The client has no address yet, so the reply goes to its MAC address.');
      return;
    }
    if (data.op !== 'request') return;
    const lease = leases.get(clientMac);
    if (!lease || lease.address !== data.yourIp) return;
    const renewal = packet.src !== 0;
    lease.expiresAt = expiresAt;
    reply(ctx, clientMac, renewal ? packet.src : LIMITED_BROADCAST, { op: 'ack', yourIp: lease.address, serverIp: ip, leaseS }, 'dhcp-ack', `Ack: ${formatIp(lease.address)} is yours for ${leaseS} s`, renewal ? 'The clock on the lease starts again, and the address stays the same.' : 'The lease is now on record. Until this Ack, the client may not use the address.');
  }

  return {
    id,
    label,
    type: 'dhcp',
    column,
    badge: () => formatIp(ip),
    receive(ctx, frame, port) {
      if (frame.dstMac !== mac && frame.dstMac !== BROADCAST_MAC) return;
      if (frame.payload.kind === 'arp') return arp.receive(ctx, port, own, frame.payload);
      if (frame.payload.kind !== 'ip') return;
      const { payload } = frame.payload;
      if (payload.kind === 'udp' && typeof payload.data === 'object' && 'op' in payload.data) handle(ctx, frame.srcMac, frame.payload, payload.data);
    },
    tables: () => [{ title: 'Leases', columns: ['Address', 'Client', 'Expires'], rows: [...leases].map(([client, lease]) => [formatIp(lease.address), client, formatTime(lease.expiresAt)]) }],
  };
}
