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

export interface DnsRecord {
  name: string;
  type: 'A' | 'NS';
  value: string;
  ttl: number;
}

export interface Dns {
  proto: 'dns';
  id: number;
  name: string;
  response: boolean;
  rcode: 'NOERROR' | 'NXDOMAIN';
  answers: DnsRecord[];
  authority: DnsRecord[];
}

export interface QuicFrame {
  stream: number;
  offset: number;
  length: number;
  fin?: boolean;
  marks?: Mark[];
}

export interface Quic {
  proto: 'quic';
  number: number;
  space: 'initial' | 'handshake' | '0rtt' | '1rtt';
  frames: QuicFrame[];
  acks: [from: number, to: number][];
}

export interface Udp {
  kind: 'udp';
  srcPort: number;
  dstPort: number;
  data: string | Dhcp | Dns | Quic;
}

/** Goes straight over a link, with no IP or TCP under it. A real one runs on TCP port 179. */
export interface Bgp {
  kind: 'bgp';
  type: 'UPDATE' | 'WITHDRAW' | 'PROBE';
  network: number;
  prefix: number;
  path: number[];
  /** On a PROBE: where it is going. */
  dst?: number;
}

/** A label on the byte stream. `end` is the position just past its last byte. */
export interface Mark {
  end: number;
  mark: unknown;
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
  /** The marks whose last byte is in this segment. */
  marks?: Mark[];
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
  payload: Arp | IpPacket | Bgp;
}

const DEFAULT_BYTES = 40;

export const ipLength = (packet: Frame['payload']) => (packet.kind === 'ip' ? (packet.length ?? DEFAULT_BYTES) : DEFAULT_BYTES);
