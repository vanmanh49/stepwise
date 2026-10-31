export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';
export const DHCP_SERVER_PORT = 67;
export const DHCP_CLIENT_PORT = 68;

export interface Arp {
  kind: 'arp';
  op: 'request' | 'reply';
  senderMac: string;
  senderIp: number;
  targetMac: string;
  targetIp: number;
}

export interface Icmp {
  kind: 'icmp';
  type: 'echo-request' | 'echo-reply' | 'time-exceeded' | 'unreachable' | 'port-unreachable' | 'frag-needed';
  seq: number;
  /** On `frag-needed`: the size that would have fit. */
  mtu?: number;
  /** On `frag-needed`: where the refused packet was going. A real ICMP quotes its header. */
  dst?: number;
}

export const ICMP_NAME: Record<Icmp['type'], string> = { 'echo-request': 'Echo Request', 'echo-reply': 'Echo Reply', 'time-exceeded': 'Time Exceeded', unreachable: 'Destination Unreachable', 'port-unreachable': 'Port Unreachable', 'frag-needed': 'Fragmentation Needed' };

export interface Dhcp {
  op: 'discover' | 'offer' | 'request' | 'ack';
  yourIp: number;
  serverIp: number;
  leaseS: number;
}

export interface Udp {
  kind: 'udp';
  srcPort: number;
  dstPort: number;
  data: string | Dhcp;
}

export interface Tcp {
  kind: 'tcp';
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  flags: ('SYN' | 'ACK' | 'FIN' | 'RST')[];
  window: number;
  length: number;
  mss?: number;
}

export interface IpPacket {
  kind: 'ip';
  src: number;
  dst: number;
  ttl: number;
  id: number;
  /** Total bytes. A packet with none counts as 40. */
  length?: number;
  df?: boolean;
  offset?: number;
  more?: boolean;
  payload: Icmp | Udp | Tcp;
}

export interface Frame {
  srcMac: string;
  dstMac: string;
  payload: Arp | IpPacket;
}

const DEFAULT_BYTES = 40;

export const ipLength = (packet: Arp | IpPacket) => (packet.kind === 'ip' ? (packet.length ?? DEFAULT_BYTES) : DEFAULT_BYTES);
