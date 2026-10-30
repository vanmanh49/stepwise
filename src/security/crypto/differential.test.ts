import { createHash, createHmac, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../utils/random';
import { hex } from './bytes';
import { hkdfExpand, hkdfExtract, hmac } from './hmac';
import { sha256 } from './sha256';

/** Seeded bytes, so a failure repeats. */
function randomBytes(r: () => number, length: number): Uint8Array {
  return Uint8Array.from({ length }, () => Math.floor(r() * 256));
}

describe('our crypto agrees with node:crypto', () => {
  it('sha256', () => {
    const r = seeded(1);
    const lengths = [55, 56, 63, 64, 65, ...Array.from({ length: 200 }, () => Math.floor(r() * 301))];
    for (const length of lengths) {
      const bytes = randomBytes(r, length);
      expect(hex(sha256(bytes)), String(length)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('hmac', () => {
    const r = seeded(2);
    for (const keyLength of [0, 16, 64, 65, 100]) {
      for (let run = 0; run < 20; run++) {
        const key = randomBytes(r, keyLength);
        const message = randomBytes(r, Math.floor(r() * 200));
        expect(hex(hmac(key, message))).toBe(createHmac('sha256', key).update(message).digest('hex'));
      }
    }
  });

  it('hkdf', () => {
    const r = seeded(3);
    for (const length of [16, 32, 64]) {
      const ikm = randomBytes(r, 22);
      const salt = randomBytes(r, 13);
      const info = randomBytes(r, 10);
      const ours = hkdfExpand(hkdfExtract(salt, ikm), info, length);
      expect(hex(ours)).toBe(Buffer.from(hkdfSync('sha256', ikm, salt, info, length)).toString('hex'));
    }
  });
});
