// Teaching code: never use this for real data. Use your platform's crypto library.

import { utf8 } from './bytes';
import { gcd, isPrime, modInverse, modPow } from './numbers';
import { sha256 } from './sha256';

export type RsaKey = { n: number; e: number; d: number; phi: number };

export function keyPair(p: number, q: number, e: number): RsaKey | null {
  if (p === q || !isPrime(p) || !isPrime(q)) return null;
  const phi = (p - 1) * (q - 1);
  const d = gcd(e, phi) === 1 ? modInverse(e, phi) : null;
  return d === null ? null : { n: p * q, e, d, phi };
}

export const encrypt = (m: number, key: RsaKey): number => modPow(m, key.e, key.n);

export const decrypt = (c: number, key: RsaKey): number => modPow(c, key.d, key.n);

/** SHA-256 of the message as one big number, modulo n, reduced byte by byte so nothing leaves the safe range. */
export const digestNumber = (message: string, n: number): number => sha256(utf8(message)).reduce((value, byte) => (value * 256 + byte) % n, 0);

export const sign = (message: string, key: RsaKey): number => modPow(digestNumber(message, key.n), key.d, key.n);

export const verify = (message: string, signature: number, key: { n: number; e: number }): boolean =>
  modPow(signature, key.e, key.n) === digestNumber(message, key.n);
