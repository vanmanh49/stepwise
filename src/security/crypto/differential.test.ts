import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { seeded } from '../../utils/random';
import { hex } from './bytes';
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
});
