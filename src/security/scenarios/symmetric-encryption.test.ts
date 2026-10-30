import { describe, expect, it } from 'vitest';
import { encryptBlock } from '../crypto/aes';
import { hex, utf8 } from '../crypto/bytes';
import { symmetricEncryptionSteps } from './symmetric-encryption';

const defaults = { text: 'attack at dawn', key: 'stepwise-demo-16' };

const padded = (text: string) => {
  const block = new Uint8Array(16);
  block.set(utf8(text));
  return block;
};

describe('symmetric encryption scenario', () => {
  it('ends with the real AES-128 output', () => {
    const steps = symmetricEncryptionSteps(defaults);
    expect(steps.at(-1)!.title).toContain(hex(encryptBlock(utf8(defaults.key), padded(defaults.text))));
  });

  it('shows every operation of all 10 rounds', () => {
    const steps = symmetricEncryptionSteps(defaults);
    expect(steps.length).toBeGreaterThanOrEqual(42);
    expect(steps.length).toBeLessThanOrEqual(46);
    expect(steps.filter((s) => s.title.includes('MixColumns'))).toHaveLength(9);
    expect(steps.filter((s) => s.title.includes('SubBytes'))).toHaveLength(10);
  });

  it('says when it pads short inputs with zero bytes', () => {
    expect(symmetricEncryptionSteps(defaults)[0]!.why).toContain('zero bytes');
    expect(symmetricEncryptionSteps({ text: '0123456789abcdef', key: '0123456789abcdef' })[0]!.why).not.toContain('zero bytes');
  });

  it('pads a short key the same way', () => {
    const steps = symmetricEncryptionSteps({ text: 'hi', key: 'k' });
    expect(steps.at(-1)!.title).toContain(hex(encryptBlock(padded('k'), padded('hi'))));
  });

  it('refuses text or keys over 16 bytes, counted in bytes', () => {
    expect(symmetricEncryptionSteps({ ...defaults, text: 'x'.repeat(17) })).toHaveLength(1);
    expect(symmetricEncryptionSteps({ ...defaults, key: 'é'.repeat(9) })).toHaveLength(1);
    expect(symmetricEncryptionSteps({ ...defaults, key: '' })).toHaveLength(1);
  });

  it('encrypts empty text', () => {
    expect(symmetricEncryptionSteps({ ...defaults, text: '' }).length).toBeGreaterThan(40);
  });
});
