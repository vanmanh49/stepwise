// Teaching code: never use this for real data. Use your platform's crypto library.

import { encryptBlock } from './aes';
import { xor } from './bytes';

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
