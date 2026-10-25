import { describe, expect, it } from 'vitest';
import type { GridView } from '../../types/visualization';
import { tokenId } from '../corpus';
import { fmt } from '../steps';
import { cosine } from '../tensor';
import { WEIGHTS } from '../weights';
import { embeddingsSteps } from './embeddings';

const E = (w: string) => WEIGHTS.tokenEmbed[tokenId(w)!]!;

describe('embeddings lesson', () => {
  it('ends a comparison with the cosine of the two vectors', () => {
    const last = embeddingsSteps({ mode: 'compare', a: 'cat', b: 'dog' }).at(-1)!;
    expect(last.variables!.cosine).toBe(fmt(cosine(E('cat'), E('dog'))));
  });

  it('gives a word cosine 1.00 with itself', () => {
    expect(embeddingsSteps({ mode: 'compare', a: 'cat', b: 'cat' }).at(-1)!.variables!.cosine).toBe('1.00');
  });

  it('ranks the other words by cosine, highest first, without the word itself', () => {
    const steps = embeddingsSteps({ mode: 'nearest', a: 'cat', b: 'dog' });
    const ranking = steps.findLast((s) => s.view.kind === 'grid' && (s.view as GridView).colLabels?.[0] === 'cosine')!.view as GridView;
    const words = ranking.rows.map((r) => r.label!);
    expect(words).not.toContain('cat');
    const values = words.map((w) => cosine(E('cat'), E(w)));
    expect(values).toEqual(values.toSorted((x, y) => y - x));
    expect(ranking.rows[0]!.cells[0]!.role).toBe('found');
  });
});
