import { describe, expect, it } from 'vitest';
import { fromHex, hex, utf8 } from './bytes';
import { encryptBlock, expandKey, traceBlock } from './aes';
import { ctr } from './modes';

const KEY = fromHex('000102030405060708090a0b0c0d0e0f');
const BLOCK = fromHex('00112233445566778899aabbccddeeff');

describe('aes', () => {
  it('matches the FIPS-197 example', () => {
    expect(hex(encryptBlock(KEY, BLOCK))).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  });

  it('expands to 11 round keys, the first being the key', () => {
    const keys = expandKey(KEY);
    expect(keys).toHaveLength(11);
    expect(hex(keys[0]!)).toBe(hex(KEY));
    expect(hex(keys[10]!)).toBe('13111d7fe3944a17f307a78b4d2b30c5');
  });

  it('traces the 40 operations in order, with no MixColumns in the last round', () => {
    const { ops, out } = traceBlock(KEY, BLOCK);
    expect(ops).toHaveLength(40);
    expect(ops[0]).toMatchObject({ round: 0, op: 'AddRoundKey' });
    expect(ops.slice(1, 5).map((o) => o.op)).toEqual(['SubBytes', 'ShiftRows', 'MixColumns', 'AddRoundKey']);
    expect(ops.slice(-3).map((o) => o.op)).toEqual(['SubBytes', 'ShiftRows', 'AddRoundKey']);
    expect(ops.at(-1)!.round).toBe(10);
    expect(hex(ops.at(-1)!.state)).toBe(hex(out));
  });

  it('CTR run twice gives the input back', () => {
    const iv = new Uint8Array(16);
    const text = utf8('any length at all, not just blocks');
    expect(hex(ctr(KEY, iv, ctr(KEY, iv, text)))).toBe(hex(text));
  });
});
