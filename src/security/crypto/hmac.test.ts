import { describe, expect, it } from 'vitest';
import { hex, utf8 } from './bytes';
import { hmac, hmacParts } from './hmac';

describe('hmac', () => {
  it('matches RFC 4231 test case 1', () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(hex(hmac(key, utf8('Hi There')))).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });

  it('exposes the inner and outer keys and hashes', () => {
    const parts = hmacParts(utf8('k'), utf8('m'));
    expect(parts.innerKey).toHaveLength(64);
    expect(parts.innerKey[0]).toBe('k'.charCodeAt(0) ^ 0x36);
    expect(parts.outerKey[63]).toBe(0x5c);
    expect(hex(parts.outer)).toBe(hex(hmac(utf8('k'), utf8('m'))));
  });
});
