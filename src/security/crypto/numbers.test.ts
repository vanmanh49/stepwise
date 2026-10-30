import { describe, expect, it } from 'vitest';
import { gcd, GROUPS, isPrime, modInverse, modInverseTrace, modPow } from './numbers';

describe('numbers', () => {
  it('computes the textbook Diffie-Hellman values', () => {
    expect(modPow(5, 6, 23)).toBe(8);
    expect(modPow(5, 15, 23)).toBe(19);
    expect(modPow(19, 6, 23)).toBe(2);
  });

  it('stays exact at the largest modulus', () => {
    const n = 997 * 991;
    expect(n).toBe(988027);
    expect(modPow(n - 1, 3, n)).toBe(n - 1);
  });

  it('uses a generator in every group', () => {
    for (const { p, g } of GROUPS) {
      let x = g;
      let order = 1;
      while (x !== 1) {
        x = (x * g) % p;
        order++;
      }
      expect(order, String(p)).toBe(p - 1);
    }
  });

  it('finds inverses only for coprime pairs', () => {
    for (const [a, m] of [[17, 3120], [3, 7], [65537, 880350]] as const) {
      expect((modInverse(a, m)! * a) % m, `${a} ${m}`).toBe(1);
    }
    expect(modInverse(6, 9)).toBeNull();
  });

  it('records one row per Euclid division', () => {
    const { rows, inverse } = modInverseTrace(17, 3120);
    expect(inverse).toBe(2753);
    expect(rows.at(-1)!.r).toBe(1);
    expect(rows[0]).toMatchObject({ q: 183, r: 9 });
  });

  it('tests primes and common factors', () => {
    expect([2, 3, 61, 997].every(isPrime)).toBe(true);
    expect([0, 1, 4, 60, 989].some(isPrime)).toBe(false);
    expect(gcd(120, 3)).toBe(3);
    expect(gcd(17, 3120)).toBe(1);
  });
});
