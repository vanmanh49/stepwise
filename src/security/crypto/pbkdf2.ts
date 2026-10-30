// Teaching code: never use this for real data. Use your platform's crypto library.

import { concat, xor } from './bytes';
import { hmac } from './hmac';

/** RFC 8018 with HMAC-SHA-256: each block XORs `rounds` chained HMACs. */
export function pbkdf2(password: Uint8Array, salt: Uint8Array, rounds: number, length: number): Uint8Array {
  let out: Uint8Array = new Uint8Array(0);
  for (let block = 1; out.length < length; block++) {
    const index = new Uint8Array(4);
    new DataView(index.buffer).setUint32(0, block);
    let round = hmac(password, concat(salt, index));
    let sum = round;
    for (let i = 1; i < rounds; i++) {
      round = hmac(password, round);
      sum = xor(sum, round);
    }
    out = concat(out, sum);
  }
  return out.slice(0, length);
}
