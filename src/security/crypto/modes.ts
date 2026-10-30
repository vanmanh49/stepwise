// Teaching code: never use this for real data. Use your platform's crypto library.

import { encryptBlock } from './aes';
import { concat, xor } from './bytes';

/** Each 16-byte block on its own. `bytes` must be a whole number of blocks; there is no padding here. */
export function ecb(key: Uint8Array, bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let at = 0; at < bytes.length; at += 16) out.set(encryptBlock(key, bytes.subarray(at, at + 16)), at);
  return out;
}

/** Each block mixed with the previous ciphertext first. `bytes` must be a whole number of blocks. */
export function cbc(key: Uint8Array, iv: Uint8Array, bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let previous = iv;
  for (let at = 0; at < bytes.length; at += 16) {
    previous = encryptBlock(key, xor(previous, bytes.subarray(at, at + 16)));
    out.set(previous, at);
  }
  return out;
}

/** Adds 1 to the last `width` bytes, big-endian, wrapping to 0. */
function increment(counter: Uint8Array, width: number): Uint8Array {
  const out = counter.slice();
  for (let i = 15; i >= 16 - width; i--) {
    out[i] = (out[i]! + 1) & 0xff;
    if (out[i] !== 0) break;
  }
  return out;
}

function keystreamXor(key: Uint8Array, start: Uint8Array, bytes: Uint8Array, width: number): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let counter = start;
  for (let at = 0; at < bytes.length; at += 16) {
    out.set(xor(encryptBlock(key, counter), bytes.subarray(at, at + 16)), at);
    counter = increment(counter, width);
  }
  return out;
}

/** Encrypts a counter and XORs it in, so any length works and the same call decrypts. */
export const ctr = (key: Uint8Array, iv: Uint8Array, bytes: Uint8Array): Uint8Array => keystreamXor(key, iv, bytes, 16);

const toBig = (bytes: Uint8Array) => bytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);

function toBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

/** Multiplication in GF(2^128) with GCM's bit order (SP 800-38D, algorithm 1). */
function multiply(x: bigint, y: bigint): bigint {
  const reduction = 0xe1n << 120n;
  let z = 0n;
  let v = y;
  for (let bit = 127n; bit >= 0n; bit--) {
    if ((x >> bit) & 1n) z ^= v;
    v = v & 1n ? (v >> 1n) ^ reduction : v >> 1n;
  }
  return z;
}

const zeroPad = (bytes: Uint8Array) => concat(bytes, new Uint8Array((16 - (bytes.length % 16)) % 16));

function ghash(hashKey: bigint, aad: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const lengths = concat(toBytes(BigInt(aad.length) * 8n, 8), toBytes(BigInt(ciphertext.length) * 8n, 8));
  const data = concat(zeroPad(aad), zeroPad(ciphertext), lengths);
  let y = 0n;
  for (let at = 0; at < data.length; at += 16) y = multiply(y ^ toBig(data.subarray(at, at + 16)), hashKey);
  return toBytes(y, 16);
}

function gcmTag(key: Uint8Array, firstCounter: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array {
  const hashKey = toBig(encryptBlock(key, new Uint8Array(16)));
  return xor(encryptBlock(key, firstCounter), ghash(hashKey, aad, ciphertext));
}

/** The first counter block for a 12-byte IV. */
const firstCounter = (iv: Uint8Array) => concat(iv, Uint8Array.of(0, 0, 0, 1));

export function gcmEncrypt(key: Uint8Array, iv: Uint8Array, plain: Uint8Array, aad: Uint8Array = new Uint8Array(0)): { ciphertext: Uint8Array; tag: Uint8Array } {
  const start = firstCounter(iv);
  const ciphertext = keystreamXor(key, increment(start, 4), plain, 4);
  return { ciphertext, tag: gcmTag(key, start, ciphertext, aad) };
}

/** The plaintext, or null when the tag doesn't match: nothing is released from a message that fails. */
export function gcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, tag: Uint8Array, aad: Uint8Array = new Uint8Array(0)): Uint8Array | null {
  const start = firstCounter(iv);
  const expected = gcmTag(key, start, ciphertext, aad);
  if (tag.length !== 16 || expected.some((b, i) => b !== tag[i])) return null;
  return keystreamXor(key, increment(start, 4), ciphertext, 4);
}
