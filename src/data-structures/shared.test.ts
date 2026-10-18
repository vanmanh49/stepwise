import { describe, expect, it } from 'vitest';
import type { StructureArg } from '../types/lesson';
import { parseOpFields, sampleInputs } from './shared';

const put: { label: string; args: StructureArg[] } = {
  label: 'Put',
  args: [
    { name: 'value', label: 'Value', sample: 4 },
    { name: 'key', label: 'Key', sample: 'emu', text: true },
  ],
};

describe('parseOpFields', () => {
  it('reads numbers and lower-cases words, each in field order', () => {
    expect(parseOpFields(put, [' 12 ', ' Cat '])).toEqual({ ok: true, args: [12], words: ['cat'] });
  });

  it('rejects a word that is not 1–8 letters', () => {
    expect(parseOpFields(put, ['12', 'c4t'])).toEqual({ ok: false, error: 'Put: enter a word of 1–8 letters (a–z) for Key.' });
    expect(parseOpFields(put, ['12', 'elephants'])).toMatchObject({ ok: false });
    expect(parseOpFields(put, ['12', ''])).toMatchObject({ ok: false });
  });

  it('rejects a number outside -999 to 999', () => {
    expect(parseOpFields(put, ['x', 'cat'])).toEqual({ ok: false, error: 'Put: enter a whole number between -999 and 999 for Value.' });
    expect(parseOpFields(put, ['1000', 'cat'])).toMatchObject({ ok: false });
  });
});

describe('sampleInputs', () => {
  it('splits an operation’s samples into numbers and words', () => {
    expect(sampleInputs(put)).toEqual({ args: [4], words: ['emu'] });
  });
});
