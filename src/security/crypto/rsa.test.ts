import { describe, expect, it } from 'vitest';
import { decrypt, digestNumber, encrypt, keyPair, sign, verify } from './rsa';

const KEY = keyPair(61, 53, 17)!;

describe('toy rsa', () => {
  it('builds the textbook key', () => {
    expect(KEY).toEqual({ n: 3233, e: 17, d: 2753, phi: 3120 });
    expect(encrypt(65, KEY)).toBe(2790);
    expect(decrypt(2790, KEY)).toBe(65);
  });

  it('decrypt undoes encrypt for every number below n', () => {
    for (let m = 0; m < KEY.n; m++) expect(decrypt(encrypt(m, KEY), KEY)).toBe(m);
  });

  it('refuses bad parameters', () => {
    expect(keyPair(61, 61, 17)).toBeNull();
    expect(keyPair(60, 53, 17)).toBeNull();
    expect(keyPair(11, 13, 3)).toBeNull();
  });

  it('verifies a signature and refuses a changed message', () => {
    const key = keyPair(883, 997, 17)!;
    const signature = sign('pay bob 100', key);
    expect(verify('pay bob 100', signature, key)).toBe(true);
    expect(verify('pay bob 100!', signature, key)).toBe(false);
  });

  it('reduces the digest below n', () => {
    expect(digestNumber('abc', 143)).toBeLessThan(143);
    // abc's digest as one big number, modulo 3233.
    expect(digestNumber('abc', 3233)).toBe(Number(0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015adn % 3233n));
  });
});
