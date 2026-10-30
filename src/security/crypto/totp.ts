// Teaching code: never use this for real data. Use your platform's crypto library.

import { hmac } from './hmac';

const STEP = 30;

export const totpCounter = (unixSeconds: number): number => Math.floor(unixSeconds / STEP);

/** RFC 4226's dynamic truncation: the last byte's low 4 bits pick where to read. */
export const hotpOffset = (digest: Uint8Array): number => digest[digest.length - 1]! & 15;

export function totp(secret: Uint8Array, unixSeconds: number, digits = 6): string {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(totpCounter(unixSeconds)));
  const digest = hmac(secret, counter);
  const number = new DataView(digest.buffer, digest.byteOffset).getUint32(hotpOffset(digest)) & 0x7fffffff;
  return String(number % 10 ** digits).padStart(digits, '0');
}
