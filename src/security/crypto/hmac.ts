// Teaching code: never use this for real data. Use your platform's crypto library.

import { concat } from './bytes';
import { sha256 } from './sha256';

const BLOCK = 64;

export function hmacParts(key: Uint8Array, message: Uint8Array): { innerKey: Uint8Array; outerKey: Uint8Array; inner: Uint8Array; outer: Uint8Array } {
  const block = new Uint8Array(BLOCK);
  block.set(key.length > BLOCK ? sha256(key) : key);
  const innerKey = block.map((b) => b ^ 0x36);
  const outerKey = block.map((b) => b ^ 0x5c);
  const inner = sha256(concat(innerKey, message));
  return { innerKey, outerKey, inner, outer: sha256(concat(outerKey, inner)) };
}

export const hmac = (key: Uint8Array, message: Uint8Array): Uint8Array => hmacParts(key, message).outer;

export const hkdfExtract = (salt: Uint8Array, ikm: Uint8Array): Uint8Array => hmac(salt, ikm);

export function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  let out: Uint8Array = new Uint8Array(0);
  let previous: Uint8Array = new Uint8Array(0);
  for (let i = 1; out.length < length; i++) {
    previous = hmac(prk, concat(previous, info, Uint8Array.of(i)));
    out = concat(out, previous);
  }
  return out.slice(0, length);
}
