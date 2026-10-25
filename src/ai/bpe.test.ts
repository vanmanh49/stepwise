import { describe, expect, it } from 'vitest';
import { decode, encode, learnMerges, SPACE } from './bpe';
import { CORPUS, END, VOCAB } from './corpus';

/** Adjacent character pairs across the corpus, counted directly (no merges yet). */
function pairCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sentence of CORPUS) {
    const chars = [...sentence.replaceAll(' ', SPACE)];
    for (let i = 0; i + 1 < chars.length; i++) {
      if (chars[i + 1] === SPACE) continue;
      const key = `${chars[i]}|${chars[i + 1]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

describe('the corpus', () => {
  it('has 34 tokens: the corpus words in order of first appearance, then END', () => {
    expect(VOCAB).toHaveLength(34);
    expect(VOCAB.slice(0, 3)).toEqual(['the', 'cat', 'sat']);
    expect(VOCAB.at(-1)).toBe(END);
  });
});

describe('learnMerges', () => {
  it('is deterministic', () => {
    expect(learnMerges(CORPUS, 10)).toEqual(learnMerges(CORPUS, 10));
  });

  it('merges the most frequent pair first, and counts never increase', () => {
    const merges = learnMerges(CORPUS, 10);
    const best = Math.max(...pairCounts().values());
    expect(merges[0]!.count).toBe(best);
    expect(pairCounts().get(merges[0]!.pair.join('|'))).toBe(best);
    for (let i = 1; i < merges.length; i++) expect(merges[i]!.count).toBeLessThanOrEqual(merges[i - 1]!.count);
  });

  it('never merges a word start onto the token before it', () => {
    for (const m of learnMerges(CORPUS, 30)) expect(m.pair[1].startsWith(SPACE)).toBe(false);
  });
});

describe('encode and decode', () => {
  const merges = learnMerges(CORPUS, 30);

  it.each(['the cat', '  zebra!  ', 'a  b', 'catdog', ' the'])('round-trips %j', (text) => {
    expect(decode(encode(text, merges).tokens)).toBe(text);
  });

  it('records one trace entry per merge that changed the tokens, each shorter than the last', () => {
    const { trace } = encode('the cat', merges);
    expect(trace.length).toBeGreaterThan(0);
    let length = 7;
    for (const entry of trace) {
      expect(entry.tokens.length).toBeLessThan(length);
      length = entry.tokens.length;
    }
    expect(new Set(trace.map((t) => t.merge)).size).toBe(trace.length);
  });

  it('starts from the characters, a space as ▁', () => {
    expect(encode('the cat', learnMerges(CORPUS, 0)).tokens).toEqual(['t', 'h', 'e', '▁', 'c', 'a', 't']);
  });
});
