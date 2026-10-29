import { describe, expect, it } from 'vitest';
import type { DistributionView, GridView } from '../../types/visualization';
import { vectorSearchSteps } from './vector-search';

const first = (query: string, vectors: string, k = '3') => {
  const top = vectorSearchSteps({ query, k, vectors }).at(-1)!.view as GridView;
  return top.rows[0]!.cells[1]!.value;
};

describe('vector search lesson', () => {
  it('finds the dog in the park with dense vectors', () => {
    expect(first('dog park', 'dense')).toBe('a dog is in the park');
  });

  it('gets "dog ate" wrong with dense vectors and right with TF-IDF', () => {
    expect(first('dog ate', 'dense')).toBe('the cat chased the bird');
    expect(first('dog ate', 'tfidf')).toBe('the dog ate the bone');
  });

  it('lists k results and marks them in the scores', () => {
    const steps = vectorSearchSteps({ query: 'fish pond', k: '2', vectors: 'dense' });
    expect((steps.at(-1)!.view as GridView).rows).toHaveLength(2);
    const scores = steps.find((s) => s.view.kind === 'distribution')!.view as DistributionView;
    expect(scores.bars.filter((b) => b.role === 'found')).toHaveLength(2);
    expect(new Set(scores.bars.map((b) => b.id)).size).toBe(scores.bars.length);
  });

  it('refuses k = 6 with one step', () => {
    expect(vectorSearchSteps({ query: 'dog park', k: '6', vectors: 'dense' })).toHaveLength(1);
  });

  it('says nothing matches when every TF-IDF score is 0', () => {
    const steps = vectorSearchSteps({ query: 'the', k: '3', vectors: 'tfidf' });
    const scores = steps.find((s) => s.view.kind === 'distribution')!;
    expect(scores.title).toContain('every score is 0');
    expect((scores.view as DistributionView).bars.some((b) => b.role === 'found')).toBe(false);
    expect((steps.at(-1)!.view as GridView).rows).toHaveLength(0);
  });

  it('does not claim filler words were left out when all of them are kept', () => {
    expect(vectorSearchSteps({ query: 'the on', k: '3', vectors: 'dense' })[0]!.why).not.toContain('left out');
  });
});
