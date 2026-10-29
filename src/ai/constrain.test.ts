import { describe, expect, it } from 'vitest';
import { VOCAB } from './corpus';
import { decode, SCHEMAS } from './constrain';

const schema = (id: string) => SCHEMAS.find((s) => s.id === id)!;

describe('constrained decoding', () => {
  it('fills the place schema', () => {
    const out = decode(schema('place'), true);
    expect(out.words.join(' ')).toBe('the dog sat on the rug');
    expect(out.json).toEqual({ animal: 'dog', place: 'rug' });
    expect(out.valid).toBe(true);
  });

  it('fills the food schema', () => {
    const out = decode(schema('food'), true);
    expect(out.words.join(' ')).toBe('the dog ate the bone');
    expect(out.json).toEqual({ animal: 'dog', food: 'bone' });
    expect(out.valid).toBe(true);
  });

  it('can fit the place schema by luck without constraints', () => {
    const out = decode(schema('place'), false);
    expect(out.words.join(' ')).toBe('the dog sat on the rug');
    expect(out.valid).toBe(true);
  });

  it('breaks the food schema without constraints', () => {
    const out = decode(schema('food'), false);
    const slot2 = out.steps.find((s) => s.slot === 2)!;
    expect(VOCAB[slot2.chosen]).toBe('sat');
    expect(slot2.valid).toBe(false);
    expect(out.json.food).toBe('the');
    expect(out.valid).toBe(false);
  });

  it('cuts exactly the words a slot does not allow', () => {
    for (const s of SCHEMAS) {
      for (const step of decode(s, true).steps) {
        const slot = s.slots[step.slot]!;
        const allowed = 'word' in slot ? [slot.word] : slot.allowed;
        const expected = VOCAB.map((_, i) => i).filter((i) => !allowed.includes(VOCAB[i]!));
        expect(step.cut).toEqual(expected);
        for (const i of step.cut) expect(step.probs[i]).toBe(0);
        expect(Math.abs(step.probs.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-9);
      }
    }
  });
});
