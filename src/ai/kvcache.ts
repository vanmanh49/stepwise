import { attend, D, positionOut, type Weights } from './model';
import { add, dot, matVec, softmax, type Mat, type Vec } from './tensor';
import { WEIGHTS } from './weights';

/** The keys and values of every position seen so far. */
export interface KvCache {
  tokens: number[];
  k: Mat;
  v: Mat;
}

export const EMPTY_CACHE: KvCache = { tokens: [], k: [], v: [] };

export interface Extended {
  cache: KvCache;
  q: Vec;
  /** The new position's attention over every cached position, itself included. */
  weights: Vec;
  logits: Vec;
  probs: Vec;
}

/** One new position: Q, K and V for it only; K and V appended; attends over the cache. Caller keeps tokens.length < CONTEXT. */
export function extend(cache: KvCache, token: number, w: Weights = WEIGHTS): Extended {
  const x = add(w.tokenEmbed[token]!, w.posEmbed[cache.tokens.length]!);
  const q = matVec(w.wq, x);
  const next: KvCache = { tokens: [...cache.tokens, token], k: [...cache.k, matVec(w.wk, x)], v: [...cache.v, matVec(w.wv, x)] };
  // No mask needed: the cache holds only earlier positions and this one.
  const weights = softmax(next.k.map((kj) => dot(q, kj) / Math.sqrt(D)));
  const { logits } = positionOut(x, attend(weights, next.v, w), w);
  return { cache: next, q, weights, logits, probs: softmax(logits) };
}
