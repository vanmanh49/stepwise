import { describe, expect, it } from 'vitest';
import { CORPUS, tokenId } from './corpus';
import { search, type VectorKind } from './vectors';

const ids = (q: string) => q.split(' ').map((w) => tokenId(w)!);
const topSentences = (q: string, kind: VectorKind, k = 1) => search(ids(q), k, kind).top.map((i) => CORPUS[i]);

describe('vector search', () => {
  it('ranks each RAG sentence first with TF-IDF', () => {
    expect(topSentences('dog ate', 'tfidf')).toEqual(['the dog ate the bone']);
    expect(topSentences('bird flew', 'tfidf')).toEqual(['the bird flew to the tree']);
    expect(topSentences('fish swam', 'tfidf')).toEqual(['the fish swam in the pond']);
    expect(topSentences('cat likes', 'tfidf')).toEqual(['the cat likes the fish']);
    expect(topSentences('dog played', 'tfidf')).toEqual(['the dog played in the park']);
    expect(topSentences('bird ate', 'tfidf')).toEqual(['the bird ate the seed']);
  });

  it('needs k = 2 to find "dog chased" with TF-IDF', () => {
    expect(topSentences('dog chased', 'tfidf')).toEqual(['the cat chased the bird']);
    expect(topSentences('dog chased', 'tfidf', 2)).toContain('the dog chased the ball');
  });

  it('ranks noun queries well with dense vectors', () => {
    expect(topSentences('dog park', 'dense')).toEqual(['a dog is in the park']);
    expect(topSentences('fish pond', 'dense')).toEqual(['a fish is in the pond']);
    expect(topSentences('cat mat', 'dense')).toEqual(['a cat is on the mat']);
  });

  it('gets a verb query wrong with dense vectors', () => {
    expect(topSentences('dog ate', 'dense')).toEqual(['the cat chased the bird']);
  });

  it('keeps scores finite for a query of only filler words', () => {
    for (const kind of ['dense', 'tfidf'] as const) {
      const { scores } = search(ids('the on'), 3, kind);
      expect(scores).toHaveLength(CORPUS.length);
      for (const s of scores) expect(Number.isFinite(s) && s >= -1 - 1e-9 && s <= 1 + 1e-9).toBe(true);
    }
  });

  it('returns k results, best first', () => {
    for (let k = 1; k <= 5; k++) {
      for (const kind of ['dense', 'tfidf'] as const) {
        const { scores, top } = search(ids('cat fish'), k, kind);
        expect(top).toHaveLength(k);
        for (let i = 1; i < k; i++) expect(scores[top[i - 1]!]!).toBeGreaterThanOrEqual(scores[top[i]!]!);
      }
    }
  });
});
