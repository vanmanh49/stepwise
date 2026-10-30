// Teaching code: never use this for real data. Use your platform's crypto library.

/** The AES S-box. */
const SBOX = Uint8Array.from(
  (
    '637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b275' +
    '09832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cfd0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2' +
    'cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdbe0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08' +
    'ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9ee1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16'
  )
    .match(/../g)!
    .map((byte) => parseInt(byte, 16)),
);

const ROUND_CONSTANTS = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

export type AesOp = { round: number; op: 'SubBytes' | 'ShiftRows' | 'MixColumns' | 'AddRoundKey'; state: Uint8Array };

/** The 11 round keys of AES-128, 16 bytes each. */
export function expandKey(key: Uint8Array): Uint8Array[] {
  const words = new Uint8Array(176);
  words.set(key);
  for (let i = 16; i < 176; i += 4) {
    const word = words.slice(i - 4, i);
    if (i % 16 === 0) {
      const [a, b, c, d] = word as unknown as [number, number, number, number];
      word.set([SBOX[b]! ^ ROUND_CONSTANTS[i / 16 - 1]!, SBOX[c]!, SBOX[d]!, SBOX[a]!]);
    }
    for (let j = 0; j < 4; j++) words[i + j] = words[i - 16 + j]! ^ word[j]!;
  }
  return Array.from({ length: 11 }, (_, round) => words.slice(round * 16, round * 16 + 16));
}

const subBytes = (state: Uint8Array) => state.map((b) => SBOX[b]!);

/** The state is column by column, so row r holds bytes r, r + 4, r + 8, r + 12. */
const shiftRows = (state: Uint8Array) => state.map((_, i) => state[(i + (i % 4) * 4) % 16]!);

const double = (b: number) => ((b << 1) ^ (b & 0x80 ? 0x1b : 0)) & 0xff;

function mixColumns(state: Uint8Array): Uint8Array {
  const out = new Uint8Array(16);
  for (let col = 0; col < 16; col += 4) {
    for (let row = 0; row < 4; row++) {
      const a = state[col + row]!;
      const b = state[col + ((row + 1) % 4)]!;
      const c = state[col + ((row + 2) % 4)]!;
      const d = state[col + ((row + 3) % 4)]!;
      out[col + row] = double(a) ^ double(b) ^ b ^ c ^ d;
    }
  }
  return out;
}

const addRoundKey = (state: Uint8Array, roundKey: Uint8Array) => state.map((b, i) => b ^ roundKey[i]!);

/** Encrypts one 16-byte block and records the state after every operation. */
export function traceBlock(key: Uint8Array, block: Uint8Array): { roundKeys: Uint8Array[]; ops: AesOp[]; out: Uint8Array } {
  const roundKeys = expandKey(key);
  const ops: AesOp[] = [];
  let state = block;
  const apply = (round: number, op: AesOp['op'], next: Uint8Array) => {
    state = next;
    ops.push({ round, op, state });
  };
  apply(0, 'AddRoundKey', addRoundKey(state, roundKeys[0]!));
  for (let round = 1; round <= 10; round++) {
    apply(round, 'SubBytes', subBytes(state));
    apply(round, 'ShiftRows', shiftRows(state));
    if (round < 10) apply(round, 'MixColumns', mixColumns(state));
    apply(round, 'AddRoundKey', addRoundKey(state, roundKeys[round]!));
  }
  return { roundKeys, ops, out: state };
}

export const encryptBlock = (key: Uint8Array, block: Uint8Array): Uint8Array => traceBlock(key, block).out;
