export interface HeaderFields {
  src: number;
  dst: number;
  ttl: number;
  id: number;
  protocol: number;
  totalLength: number;
}

/** The RFC 1071 one's-complement sum of 16-bit words, inverted. A valid header gives 0. Headers always have an even length. */
export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i]! << 8) | bytes[i + 1]!;
  while (sum > 0xffff) sum = (sum & 0xffff) + Math.floor(sum / 0x10000);
  return ~sum & 0xffff;
}

/** A 20-byte IPv4 header with no options and Don't Fragment set. */
export function ipv4Header({ src, dst, ttl, id, protocol, totalLength }: HeaderFields): Uint8Array {
  const header = new Uint8Array(20);
  const view = new DataView(header.buffer);
  view.setUint8(0, 0x45);
  view.setUint16(2, totalLength);
  view.setUint16(4, id);
  view.setUint16(6, 0x4000);
  view.setUint8(8, ttl);
  view.setUint8(9, protocol);
  view.setUint32(12, src);
  view.setUint32(16, dst);
  view.setUint16(10, checksum(header));
  return header;
}
