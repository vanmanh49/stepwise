import { add, dot, layerNorm, matVec, relu, softmax, type Mat, type Vec } from './tensor';
import { WEIGHTS } from './weights';

/** Vector size, MLP width, and how many tokens the model sees at once. */
export const D = 8;
export const HIDDEN = 16;
export const CONTEXT = 6;
export const SEED = 7;

export interface Weights {
  /** VOCAB × D */
  tokenEmbed: Mat;
  /** CONTEXT × D */
  posEmbed: Mat;
  /** D × D each */
  wq: Mat;
  wk: Mat;
  wv: Mat;
  wo: Mat;
  /** HIDDEN × D, then D × HIDDEN */
  w1: Mat;
  b1: Vec;
  w2: Mat;
  b2: Vec;
  /** VOCAB × D */
  unembed: Mat;
  bUnembed: Vec;
}

/** Every intermediate of one forward pass, one row per position, so lessons and tests read the same numbers. */
export interface Forward {
  tokens: number[];
  /** token embedding + position embedding */
  x: Mat;
  q: Mat;
  k: Mat;
  v: Mat;
  /** q · k */
  scores: Mat;
  /** scores ÷ √D */
  scaled: Mat;
  /** -Infinity above the diagonal: a token can't look ahead */
  masked: Mat;
  /** softmax of each masked row */
  weights: Mat;
  /** (weights · v) through wo */
  attn: Mat;
  resid1: Mat;
  norm1: Mat;
  mlp: Mat;
  resid2: Mat;
  norm2: Mat;
  logits: Mat;
  probs: Mat;
}

/** One layer, one head, decoder-only: 1 ≤ tokens.length ≤ CONTEXT (callers validate). */
export function forward(tokens: number[], w: Weights = WEIGHTS): Forward {
  const x = tokens.map((t, i) => add(w.tokenEmbed[t]!, w.posEmbed[i]!));
  const q = x.map((row) => matVec(w.wq, row));
  const k = x.map((row) => matVec(w.wk, row));
  const v = x.map((row) => matVec(w.wv, row));
  const scores = q.map((qi) => k.map((kj) => dot(qi, kj)));
  const scaled = scores.map((row) => row.map((s) => s / Math.sqrt(D)));
  const masked = scaled.map((row, i) => row.map((s, j) => (j > i ? -Infinity : s)));
  const weights = masked.map(softmax);
  const attn = weights.map((row) => matVec(w.wo, v[0]!.map((_, d) => row.reduce((s, wij, j) => s + wij * v[j]![d]!, 0))));
  const resid1 = x.map((row, i) => add(row, attn[i]!));
  const norm1 = resid1.map(layerNorm);
  const mlp = norm1.map((row) => add(matVec(w.w2, relu(add(matVec(w.w1, row), w.b1))), w.b2));
  const resid2 = norm1.map((row, i) => add(row, mlp[i]!));
  const norm2 = resid2.map(layerNorm);
  const logits = norm2.map((row) => add(matVec(w.unembed, row), w.bUnembed));
  return { tokens, x, q, k, v, scores, scaled, masked, weights, attn, resid1, norm1, mlp, resid2, norm2, logits, probs: logits.map(softmax) };
}
