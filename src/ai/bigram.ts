import { VOCAB } from './corpus';
import { softmax, type Mat, type Vec } from './tensor';

interface BigramStep {
  prev: number;
  next: number;
  /** probabilities of row prev before the update */
  before: Vec;
  loss: number;
  grad: Vec;
  after: Vec;
}

/**
 * Gradient descent on a bigram model: a table of logits, one row per previous word, starting at 0.
 * Step i trains pair i mod (sentence.length − 1); the gradient of −log p(next) is p − one-hot(next).
 */
export function trainBigram(sentence: readonly number[], lr: number, steps: number): { steps: BigramStep[]; table: Mat } {
  const table: Mat = VOCAB.map(() => VOCAB.map(() => 0));
  const out: BigramStep[] = [];
  for (let i = 0; i < steps; i++) {
    const at = i % (sentence.length - 1);
    const prev = sentence[at]!;
    const next = sentence[at + 1]!;
    const before = softmax(table[prev]!);
    const grad = before.map((p, j) => p - (j === next ? 1 : 0));
    table[prev] = table[prev]!.map((x, j) => x - lr * grad[j]!);
    out.push({ prev, next, before, loss: -Math.log(before[next]!), grad, after: softmax(table[prev]!) });
  }
  return { steps: out, table };
}
