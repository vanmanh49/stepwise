import { describe, expect, it } from 'vitest';
import { digestNumber } from '../crypto/rsa';
import { publicKeySignaturesSteps } from './public-key-signatures';

const defaults = { operation: 'Encrypt', p: '61', q: '53', e: '17', number: '65', message: 'pay bob 100', tamper: 'No' };
const sign = { ...defaults, operation: 'Sign' };

describe('public keys and signatures scenario', () => {
  it('works out the textbook key with every Euclid row', () => {
    const steps = publicKeySignaturesSteps(defaults);
    const titles = steps.map((s) => s.title).join('\n');
    expect(titles).toContain('n = 3233');
    expect(titles).toContain('φ(n) = 3120');
    expect(titles).toContain('d = 2753');
    expect(steps.filter((s) => s.title.startsWith('Euclid')).length).toBeGreaterThanOrEqual(3);
  });

  it('encrypts and decrypts', () => {
    const titles = publicKeySignaturesSteps(defaults).map((s) => s.title).join('\n');
    expect(titles).toContain('2790');
    expect(titles).toContain('back to 65');
  });

  it('shows the same number encrypting to the same value', () => {
    const last = publicKeySignaturesSteps(defaults).at(-1)!;
    expect(last.variables).toMatchObject({ first: 2790, second: 2790 });
    expect(last.why).toContain('padding');
  });

  it('verifies an untouched signature', () => {
    expect(publicKeySignaturesSteps(sign).at(-1)!.variables!.result).toBe('valid');
  });

  it('fails a tampered message on the default key', () => {
    const last = publicKeySignaturesSteps({ ...sign, tamper: 'Yes' }).at(-1)!;
    expect(last.variables!.result).toBe('invalid');
    expect(last.title).toContain('pay bob 100!');
  });

  it('owns up when a tiny n lets a tampered message collide', () => {
    let message = '';
    for (let i = 0; !message; i++) if (digestNumber(`m${i}`, 143) === digestNumber(`m${i}!`, 143)) message = `m${i}`;
    const last = publicKeySignaturesSteps({ ...sign, p: '11', q: '13', e: '7', message, tamper: 'Yes' }).at(-1)!;
    expect(last.variables!.result).toBe('valid');
    expect(last.why).toContain('collision');
  });

  it('refuses bad keys and out-of-range numbers', () => {
    for (const bad of [{ p: '60' }, { q: '61' }, { p: '11', q: '13', e: '3' }, { number: '3233' }, { p: '7' }, { p: '1009' }, { e: '2' }, { e: '65538' }]) {
      expect(publicKeySignaturesSteps({ ...defaults, ...bad }), JSON.stringify(bad)).toHaveLength(1);
    }
  });

  it('accepts the largest key', () => {
    expect(publicKeySignaturesSteps({ ...defaults, p: '997', q: '991', number: '988026' }).length).toBeGreaterThan(3);
  });
});
