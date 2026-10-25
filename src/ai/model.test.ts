import { describe, expect, it } from 'vitest';
import { tokenId } from './corpus';
import { forward } from './model';
import { cosine } from './tensor';
import { WEIGHTS } from './weights';

const ids = (text: string) => text.split(' ').map((w) => tokenId(w)!);
const embedding = (word: string) => WEIGHTS.tokenEmbed[tokenId(word)!]!;

describe('the tiny transformer', () => {
  it('predicts "mat" after "the cat sat on the"', () => {
    const { probs } = forward(ids('the cat sat on the'));
    expect(probs.at(-1)![tokenId('mat')!]).toBeGreaterThanOrEqual(0.5);
  });

  it.each(['the cat sat on the', 'the dog', 'a bird sat in the tree'])('attends only to the past, with rows summing to 1 (%s)', (prompt) => {
    const { weights } = forward(ids(prompt));
    weights.forEach((row, i) => {
      expect(Math.abs(row.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-9);
      row.forEach((w, j) => {
        if (j > i) expect(w).toBe(0);
      });
    });
  });

  it('adds the attention output back onto its input (the residual)', () => {
    const f = forward(ids('the cat sat'));
    f.resid1.forEach((row, i) => row.forEach((value, d) => expect(value).toBeCloseTo(f.x[i]![d]! + f.attn[i]![d]!, 12)));
  });

  it('learns that cat is more like dog than like on', () => {
    expect(cosine(embedding('cat'), embedding('dog'))).toBeGreaterThan(cosine(embedding('cat'), embedding('on')));
  });
});
