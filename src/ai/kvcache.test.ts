import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../data-structures/random.testutil';
import { tokenize } from './corpus';
import { EMPTY_CACHE, extend, type KvCache } from './kvcache';
import { forward } from './model';

const close = (a: number[], b: number[]) => {
  expect(a).toHaveLength(b.length);
  a.forEach((x, i) => expect(Math.abs(x - b[i]!)).toBeLessThan(1e-9));
};
const tokens = tokenize('the cat sat on the');

describe('kv cache', () => {
  it('matches forward at every step', () => {
    let cache: KvCache = EMPTY_CACHE;
    tokens.forEach((t, i) => {
      const out = extend(cache, t);
      const full = forward(tokens.slice(0, i + 1));
      close(out.logits, full.logits.at(-1)!);
      close(out.weights, full.weights.at(-1)!.slice(0, i + 1));
      cache = out.cache;
    });
    expect(cache.tokens).toEqual(tokens);
  });

  it('caches K and V rows equal to forward', () => {
    const cache = tokens.reduce((c, t) => extend(c, t).cache, EMPTY_CACHE);
    const full = forward(tokens);
    expect(cache.tokens).toEqual(tokens);
    full.k.forEach((row, i) => close(cache.k[i]!, row));
    full.v.forEach((row, i) => close(cache.v[i]!, row));
  });

  it('does not mutate the cache', () => {
    const cache = deepFreeze(extend(EMPTY_CACHE, tokens[0]!).cache);
    expect(() => extend(cache, tokens[1]!)).not.toThrow();
    expect(cache.k).toHaveLength(1);
  });
});
