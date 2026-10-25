import { readChoice, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { GridView, Step } from '../../types/visualization';
import { END, tokenId, VOCAB } from '../corpus';
import { EMPTY, fmt, matrixGrid, vectorGrid } from '../steps';
import { cosine, dot } from '../tensor';
import { WEIGHTS } from '../weights';

export const embeddingsCode = `E = embeddingTable                     // one row of 8 numbers per token

function similarity(a, b) {
  let dot = 0
  for (let d = 0; d < 8; d++) dot += E[a][d] * E[b][d]
  return dot / (length(E[a]) * length(E[b])) // cosine: 1 = same direction
}

function nearest(word) {
  return vocab.filter((w) => w !== word)
    .sort((x, y) => similarity(word, y) - similarity(word, x))
}`;

export const MODES = ['compare', 'nearest'];
export const WORDS = VOCAB.filter((w) => w !== END);
const SHOWN = 8;

const line = (snippet: string) => lineOf(embeddingsCode, snippet);
const E = (word: string) => WEIGHTS.tokenEmbed[tokenId(word)!]!;
const length = (v: number[]) => Math.sqrt(dot(v, v));

function compareSteps(a: string, b: string): Step[] {
  const va = E(a);
  const vb = E(b);
  const products = va.map((x, d) => x * vb[d]!);
  const d = dot(va, vb);
  const c = cosine(va, vb);
  return [
    {
      title: `Look up the vectors for ${a} and ${b}`,
      why: `Each token id points at one row of the embedding table: 8 numbers the model learned while training. Words used in similar places end up with similar numbers.`,
      codeLine: line('E = embeddingTable'),
      view: vectorGrid([{ label: a, values: va }, { label: b, values: vb }], 'vec'),
    },
    {
      title: `Multiply them dimension by dimension: the dot product is ${fmt(d)}`,
      why: 'Where both vectors are large with the same sign, the product is large and positive; where the signs differ, it pulls the sum down.',
      codeLine: line('dot += E[a][d] * E[b][d]'),
      variables: { dot: fmt(d) },
      view: vectorGrid([{ label: a, values: va }, { label: b, values: vb }, { label: '×', values: products }], 'vec'),
    },
    {
      title: `Divide by the lengths: ${fmt(d)} ÷ (${fmt(length(va))} × ${fmt(length(vb))}) = ${fmt(c)}`,
      why:
        c > 0.3
          ? `${a} and ${b} point in a similar direction, so the model treats them alike. In the corpus they appear in the same places.`
          : c < -0.1
            ? `${a} and ${b} point in different directions: they are used in different places in the corpus.`
            : `${a} and ${b} are close to unrelated: their cosine is near 0.`,
      next: 'Cosine similarity ignores length and keeps only direction: 1 is the same direction, 0 unrelated, −1 opposite.',
      codeLine: line('return dot /'),
      variables: { dot: fmt(d), cosine: fmt(c) },
      view: vectorGrid([{ label: a, values: va }, { label: b, values: vb }], 'vec'),
    },
  ];
}

function nearestSteps(a: string): Step[] {
  const ranked = WORDS.filter((w) => w !== a)
    .map((w) => ({ w, c: cosine(E(a), E(w)) }))
    .toSorted((x, y) => y.c - x.c)
    .slice(0, SHOWN);
  const ranking: GridView = matrixGrid(ranked.map((r) => [r.c]), ranked.map((r) => r.w), ['cosine'], 'rank', 'value');
  const marked: GridView = { ...ranking, rows: ranking.rows.map((row, i) => ({ ...row, cells: row.cells.map((cell) => cell && { ...cell, role: i === 0 ? 'found' : 'default' }) })) };
  const best = ranked[0]!;
  return [
    {
      title: `Look up the vector for ${a}`,
      why: 'Each token id points at one row of the embedding table: 8 numbers the model learned while training.',
      codeLine: line('E = embeddingTable'),
      view: vectorGrid([{ label: a, values: E(a) }], 'vec'),
    },
    {
      title: `Compare ${a} with every other word and rank them`,
      why: `The cosine similarity is worked out between ${a} and each of the other ${WORDS.length - 1} words; the ${SHOWN} highest are shown.`,
      codeLine: line('.sort('),
      view: ranking,
    },
    {
      title: `The nearest word to ${a} is ${best.w} (cosine ${fmt(best.c)})`,
      why: `Training never told the model what ${a} means. It only predicted next words, and words that fit the same places got similar vectors.`,
      codeLine: line('return vocab.filter'),
      variables: { nearest: best.w, cosine: fmt(best.c) },
      view: marked,
    },
  ];
}

export function embeddingsSteps(values: Record<string, string>): Step[] {
  const mode = readChoice(values, 'mode', 'Mode', MODES);
  if (!mode.ok) return refusal("Can't compare these words", mode.why, EMPTY);
  const a = readChoice(values, 'a', 'Word', WORDS);
  if (!a.ok) return refusal("Can't compare these words", a.why, EMPTY);
  const b = readChoice(values, 'b', 'Other word', WORDS);
  if (!b.ok) return refusal("Can't compare these words", b.why, EMPTY);
  return mode.value === 'nearest' ? nearestSteps(a.value) : compareSteps(a.value, b.value);
}
