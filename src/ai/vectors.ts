import { CORPUS, END, tokenize, VOCAB } from './corpus';
import { dot, type Vec } from './tensor';
import { WEIGHTS } from './weights';

/** dense: the model's own word vectors, averaged; tfidf: word counts weighted by rarity. */
export type VectorKind = 'dense' | 'tfidf';

/** Words that appear in most sentences and say little about what a sentence is about. */
export const FILLER: ReadonlySet<string> = new Set(['the', 'a', 'on', 'in', 'to', 'by', 'with', 'is', END]);

/** The documents: each corpus sentence as token ids. */
export const DOCS: readonly number[][] = CORPUS.map(tokenize);

const norm = (v: Vec) => Math.sqrt(dot(v, v));
const unit = (v: Vec) => {
  const n = norm(v);
  return n === 0 ? v : v.map((x) => x / n);
};

/** Mean of the non-filler words' embeddings (all words when every one is filler), length 1. */
export function denseVector(ids: number[]): Vec {
  const content = ids.filter((i) => !FILLER.has(VOCAB[i]!));
  const used = content.length > 0 ? content : ids;
  const rows = used.map((i) => WEIGHTS.tokenEmbed[i]!);
  return unit(rows[0]!.map((_, d) => rows.reduce((s, r) => s + r[d]!, 0) / rows.length));
}

const DF = VOCAB.map((_, i) => DOCS.filter((doc) => doc.includes(i)).length);

/** One weight per vocabulary word: count × ln(N / documents containing it). */
export function tfidfVector(ids: number[]): Vec {
  const v = VOCAB.map(() => 0);
  for (const i of ids) if (DF[i]! > 0) v[i]! += Math.log(DOCS.length / DF[i]!);
  return v;
}

export interface SearchResult {
  /** Cosine with the query, in DOCS order. */
  scores: number[];
  /** The k best document indexes, best first; ties go to the lower index. */
  top: number[];
}

const vectorOf = (ids: number[], kind: VectorKind) => (kind === 'dense' ? denseVector(ids) : tfidfVector(ids));
const DOC_VECTORS: Record<VectorKind, Vec[]> = { dense: DOCS.map(denseVector), tfidf: DOCS.map(tfidfVector) };

/** 0 when either vector is all zeros. */
function cosineOrZero(a: Vec, b: Vec): number {
  const n = norm(a) * norm(b);
  return n === 0 ? 0 : dot(a, b) / n;
}

export function search(queryIds: number[], k: number, kind: VectorKind): SearchResult {
  const q = vectorOf(queryIds, kind);
  const scores = DOC_VECTORS[kind].map((d) => cosineOrZero(q, d));
  const top = scores.map((_, i) => i).toSorted((a, b) => scores[b]! - scores[a]! || a - b).slice(0, k);
  return { scores, top };
}
