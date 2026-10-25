/** Stands for a space, so a token can show that it starts a word. */
export const SPACE = '▁';

export interface Merge {
  pair: [string, string];
  /** How often the pair appeared in the corpus when it was merged. */
  count: number;
}

const symbols = (text: string) => [...text.replaceAll(' ', SPACE)];

/** Replaces every non-overlapping occurrence of the pair, left to right. */
function applyMerge(tokens: string[], [left, right]: [string, string]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === left && tokens[i + 1] === right) {
      out.push(left + right);
      i++;
    } else out.push(tokens[i]!);
  }
  return out;
}

/** Byte-pair encoding: merge the most frequent adjacent pair, n times. A pair never merges onto a word start. */
export function learnMerges(corpus: readonly string[], n: number): Merge[] {
  let sequences = corpus.map(symbols);
  const merges: Merge[] = [];
  while (merges.length < n) {
    const counts = new Map<string, { pair: [string, string]; count: number }>();
    for (const seq of sequences) {
      for (let i = 0; i + 1 < seq.length; i++) {
        const pair: [string, string] = [seq[i]!, seq[i + 1]!];
        if (pair[1].startsWith(SPACE)) continue;
        const key = `${pair[0]}\u0000${pair[1]}`;
        const entry = counts.get(key) ?? { pair, count: 0 };
        entry.count++;
        counts.set(key, entry);
      }
    }
    // Ties go to the pair that sorts first, so the merges never depend on Map order.
    const best = [...counts.entries()].toSorted(([ka, a], [kb, b]) => b.count - a.count || (ka < kb ? -1 : 1))[0];
    if (!best) break;
    merges.push(best[1]);
    sequences = sequences.map((seq) => applyMerge(seq, best[1].pair));
  }
  return merges;
}

/** Applies the merges in learned order; the trace has one entry per merge that changed something. */
export function encode(text: string, merges: readonly Merge[]): { tokens: string[]; trace: { merge: number; tokens: string[] }[] } {
  let tokens = symbols(text);
  const trace: { merge: number; tokens: string[] }[] = [];
  merges.forEach((m, i) => {
    const next = applyMerge(tokens, m.pair);
    if (next.length !== tokens.length) {
      tokens = next;
      trace.push({ merge: i, tokens });
    }
  });
  return { tokens, trace };
}

export function decode(tokens: readonly string[]): string {
  return tokens.join('').replaceAll(SPACE, ' ');
}
