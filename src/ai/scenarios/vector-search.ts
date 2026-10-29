import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { DistributionView, Step } from '../../types/visualization';
import { CORPUS, VOCAB } from '../corpus';
import { EMPTY, fmt, matrixGrid, readPrompt, resultsGrid, vectorGrid } from '../steps';
import { denseVector, DOCS, FILLER, search, tfidfVector, type VectorKind } from '../vectors';

export const vectorSearchCode = `function embed(words) {
  if (kind === 'dense') return unit(mean(E[w] for w in words if !filler(w)))   // the model's vectors
  return vocab.map((w) => count(w, words) * log(N / docsWith(w)))   // TF-IDF
}

q = embed(query)
scores = docs.map((d) => cosine(q, embed(d)))   // compare with every document
top = sortByScore(docs, scores).slice(0, k)`;

export const VECTOR_KINDS: VectorKind[] = ['dense', 'tfidf'];
export const K = { min: 1, max: 5 };
const SHOWN = 10;

const line = (snippet: string) => lineOf(vectorSearchCode, snippet);
const words = (ids: number[]) => ids.map((t) => VOCAB[t]!).join(' ');

function scoresView(scores: number[], top: number[]): DistributionView {
  const topSet = new Set(top);
  const order = scores.map((_, i) => i).toSorted((a, b) => scores[b]! - scores[a]! || a - b).slice(0, SHOWN);
  return {
    kind: 'distribution',
    title: `cosine(query, document): the best ${SHOWN} of ${DOCS.length}`,
    bars: order.map((d) => ({ id: `doc-${d}`, label: `doc ${d + 1}`, value: scores[d]!, role: topSet.has(d) ? 'found' : 'default' })),
  };
}

export function vectorSearchSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't search with this query", why, EMPTY);
  const query = readPrompt(values, 'query', 'Query');
  if (!query.ok) return fail(query.why);
  const k = readInt(values, 'k', 'k', K);
  if (!k.ok) return fail(k.why);
  const kind = readChoice(values, 'vectors', 'Vectors', VECTOR_KINDS);
  if (!kind.ok) return fail(kind.why);

  const ids = query.value;
  const dense = kind.value === 'dense';
  const result = search(ids, k.value, kind.value as VectorKind);
  const steps: Step[] = [];
  if (dense) {
    const allFiller = ids.every((i) => FILLER.has(VOCAB[i]!));
    steps.push({
      title: allFiller ? `"${words(ids)}" has only filler words, so all of them are kept` : `Keep the content words of "${words(ids)}"`,
      why: allFiller
        ? 'Filler words such as "the" are usually dropped, because they appear in almost every sentence. This query has nothing else, so every word stays in the average.'
        : 'Words such as "the" and "on" appear in almost every sentence, so they would pull every vector toward the same place. They are left out of the average.',
      codeLine: line("if (kind === 'dense')"),
      view: { kind: 'array', cells: ids.map((t, i) => ({ id: `q-${i}`, value: VOCAB[t]!, role: !allFiller && FILLER.has(VOCAB[t]!) ? 'discarded' : 'active' })) },
    });
    steps.push({
      title: 'Average their embeddings into one query vector of 8 numbers, length 1',
      why: 'These are the tiny model\'s own word vectors from the Embeddings lesson. Each document gets a vector the same way, so similar sentences should point in similar directions.',
      codeLine: line("if (kind === 'dense')"),
      view: vectorGrid([{ label: 'query', values: denseVector(ids) }], 'qv'),
    });
  } else {
    const distinct = [...new Set(ids)];
    const v = tfidfVector(ids);
    steps.push({
      title: `Weigh each word of "${words(ids)}" by how rare it is`,
      why: `TF-IDF gives a word count × log(${DOCS.length} ÷ documents containing it). A word in every sentence is worth almost nothing; a rare word, such as a verb used once, is worth a lot. The vector has one number per vocabulary word, mostly zeros.`,
      codeLine: line('return vocab.map'),
      view: matrixGrid(distinct.map((t) => [v[t]!]), distinct.map((t) => VOCAB[t]!), ['weight'], 'tf', 'value'),
    });
  }
  const best = result.top[0]!;
  if (result.scores.every((s) => s === 0)) {
    steps.push({
      title: `No document shares a weighted word with "${words(ids)}": every score is 0`,
      why: 'A word in every document (such as "the") or in none gets weight 0, so the query vector is all zeros and nothing can match. Ranking ties would be meaningless, so nothing is returned.',
      codeLine: line('scores = docs.map'),
      view: scoresView(result.scores, []),
    });
    steps.push({
      title: 'Nothing to return',
      why: 'An empty result is the honest answer here. Try a rarer word, such as a verb or an animal.',
      next: 'The next lesson pastes the top documents into the prompt, so the model can answer from them: retrieval-augmented generation.',
      codeLine: line('top = sortByScore'),
      variables: { k: k.value },
      view: resultsGrid([], result.scores, 'res'),
    });
    return steps;
  }
  steps.push({
    title: `Compare with all ${DOCS.length} documents: doc ${best + 1} scores highest (${fmt(result.scores[best]!)})`,
    why: 'Cosine similarity is 1 when two vectors point the same way and 0 when they share nothing. Search is just this score against every document, then a sort.',
    codeLine: line('scores = docs.map'),
    variables: { best: `doc ${best + 1}` },
    view: scoresView(result.scores, result.top),
  });
  steps.push({
    title: `The top ${k.value}: "${CORPUS[best]}" first`,
    why: dense
      ? 'The tiny model\'s vectors were trained to predict the next word, not to find sentences. They match nouns well but mix up verbs: try "dog ate". Real search uses encoders trained for retrieval.'
      : 'TF-IDF matches exact words, so rare words such as verbs decide the ranking. It cannot match synonyms, which is why real systems often combine it with dense vectors (hybrid search).',
    next: 'The next lesson pastes the top documents into the prompt, so the model can answer from them: retrieval-augmented generation.',
    codeLine: line('top = sortByScore'),
    variables: { k: k.value },
    view: resultsGrid(result.top, result.scores, 'res'),
  });
  return steps;
}
