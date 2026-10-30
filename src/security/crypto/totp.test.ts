import { describe, expect, it } from 'vitest';
import { utf8 } from './bytes';
import { hotpOffset, totp, totpCounter } from './totp';

const SECRET = utf8('12345678901234567890123456789012');

describe('totp', () => {
  it.each([
    [59, '46119246'],
    [1111111109, '68084774'],
  ])('matches RFC 6238 at T = %i', (seconds, code) => {
    expect(totp(SECRET, seconds, 8)).toBe(code);
  });

  it('counts 30 second steps', () => {
    expect(totpCounter(59)).toBe(1);
    expect(totpCounter(60)).toBe(2);
  });

  it('keeps leading zeros', () => {
    const codes = Array.from({ length: 200 }, (_, i) => totp(SECRET, i * 30));
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
    expect(codes.every((code) => code.length === 6)).toBe(true);
  });

  it('reads the offset from the low bits of the last byte', () => {
    const digest = new Uint8Array(32);
    digest[31] = 0xab;
    expect(hotpOffset(digest)).toBe(11);
  });
});
