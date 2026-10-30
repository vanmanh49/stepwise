import { describe, expect, it } from 'vitest';
import { hex, utf8 } from './bytes';
import { gcmDecrypt, gcmEncrypt } from './modes';

const KEY = utf8('stepwise-demo-16');
const IV = Uint8Array.from({ length: 12 }, (_, i) => i);
const AAD = utf8('header');
const TEXT = utf8('pay $100 to bob');

const flip = (bytes: Uint8Array, at: number, bit: number) => {
  const out = bytes.slice();
  out[at]! ^= 1 << bit;
  return out;
};

describe('gcm', () => {
  it('decrypts what it encrypted', () => {
    const { ciphertext, tag } = gcmEncrypt(KEY, IV, TEXT, AAD);
    expect(hex(gcmDecrypt(KEY, IV, ciphertext, tag, AAD)!)).toBe(hex(TEXT));
  });

  it('compares every tag byte, even after a mismatch', () => {
    const { ciphertext, tag } = gcmEncrypt(KEY, IV, TEXT);
    const wrong = flip(tag, 0, 0);
    const read = new Set<string>();
    const spy = new Proxy(wrong, {
      get(target, property) {
        if (typeof property === 'string' && /^\d+$/.test(property)) read.add(property);
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    expect(gcmDecrypt(KEY, IV, ciphertext, spy)).toBeNull();
    expect(read.size).toBe(16);
  });

  it('refuses any flipped bit in the ciphertext, tag or associated data', () => {
    const { ciphertext, tag } = gcmEncrypt(KEY, IV, TEXT, AAD);
    for (let at = 0; at < ciphertext.length; at++) {
      for (let bit = 0; bit < 8; bit++) expect(gcmDecrypt(KEY, IV, flip(ciphertext, at, bit), tag, AAD)).toBeNull();
    }
    for (let at = 0; at < 16; at++) expect(gcmDecrypt(KEY, IV, ciphertext, flip(tag, at, 7), AAD)).toBeNull();
    expect(gcmDecrypt(KEY, IV, ciphertext, tag, flip(AAD, 0, 0))).toBeNull();
    expect(gcmDecrypt(KEY, IV, ciphertext, tag)).toBeNull();
  });
});
