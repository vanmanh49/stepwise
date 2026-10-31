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
  type: 'echo-request' | 'echo-reply' | 'time-exceeded' | 'unreachable';
  seq: number;
}

export const ICMP_NAME: Record<Icmp['type'], string> = { 'echo-request': 'Echo Request', 'echo-reply': 'Echo Reply', 'time-exceeded': 'Time Exceeded', unreachable: 'Destination Unreachable' };

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

export interface IpPacket {
  kind: 'ip';
  src: number;
  dst: number;
  ttl: number;
  id: number;
  payload: Icmp | Udp;
}

export interface Frame {
  srcMac: string;
  dstMac: string;
  payload: Arp | IpPacket;
}
