import { describe, expect, it } from 'vitest';
import { checksum, ipv4Header } from './bytes';

const DEMO = { src: 0xc0a80001, dst: 0xc0a800c7, ttl: 64, id: 0, protocol: 17, totalLength: 0x73 };

describe('IPv4 bytes', () => {
  it('matches the worked example in RFC 1071', () => {
    expect(checksum(Uint8Array.of(0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7))).toBe(0x220d);
  });

  it('builds a 20-byte header with the known checksum', () => {
    const header = ipv4Header(DEMO);
    expect(header).toHaveLength(20);
    expect(header[0]).toBe(0x45);
    expect((header[6]! << 8) | header[7]!).toBe(0x4000);
    expect((header[10]! << 8) | header[11]!).toBe(0xb861);
  });

  it('sums to zero over a valid header and not over a changed one', () => {
    const header = ipv4Header(DEMO);
    expect(checksum(header)).toBe(0);
    header[8]! ^= 1;
    expect(checksum(header)).not.toBe(0);
  });
});
