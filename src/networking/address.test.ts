import { describe, expect, it } from 'vitest';
import { broadcastOf, formatIp, inSubnet, mask, networkOf, parseCidr, parseIp } from './address';

function ip(text: string): number {
  const parsed = parseIp(text);
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.value;
}

describe('addresses', () => {
  it('parses and formats addresses at or above 128.0.0.0 as unsigned', () => {
    expect(ip('200.1.2.3')).toBe(0xc8010203);
    expect(formatIp(ip('255.255.255.255'))).toBe('255.255.255.255');
  });

  it('trims spaces around an address', () => {
    expect(formatIp(ip(' 200.1.2.3 '))).toBe('200.1.2.3');
  });

  it.each(['1.2.3', '256.0.0.1', '1.2.3.4.5', '010.0.0.1', '+1.2.3.4', '1.2.3.-4', '1. 2.3.4', '٠.٠.٠.٠', ''])('refuses the address %j', (bad) => {
    expect(parseIp(bad).ok).toBe(false);
  });

  it.each(['1.2.3.4/33', '1.2.3.4/', '1.2.3.4', '1.2.3.4/-1', '1.2.3.4/1e1', '1.2.3.4/08', '/24'])('refuses the block %j', (bad) => {
    expect(parseCidr(bad).ok).toBe(false);
  });

  it('parses a block', () => {
    expect(parseCidr('10.0.12.7/20')).toEqual({ ok: true, value: { ip: ip('10.0.12.7'), prefix: 20 } });
  });

  it('builds masks at both ends', () => {
    expect(mask(0)).toBe(0);
    expect(mask(24)).toBe(0xffffff00);
    expect(mask(32)).toBe(0xffffffff);
  });

  it('finds network and broadcast addresses', () => {
    expect(formatIp(networkOf(ip('200.1.2.3'), 20))).toBe('200.1.0.0');
    expect(formatIp(broadcastOf(ip('10.0.12.7'), 20))).toBe('10.0.15.255');
    expect(formatIp(broadcastOf(ip('10.0.0.1'), 32))).toBe('10.0.0.1');
  });

  it('tests membership, including the /0 block', () => {
    expect(inSubnet(ip('200.1.2.3'), ip('200.1.0.0'), 20)).toBe(true);
    expect(inSubnet(ip('200.1.16.3'), ip('200.1.0.0'), 20)).toBe(false);
    expect(inSubnet(ip('9.9.9.9'), 0, 0)).toBe(true);
  });
});
