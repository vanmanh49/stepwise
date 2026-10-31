import { softmax, type Vec } from './tensor';

interface Reshaped {
  /** softmax(logits / temperature) */
  scaled: Vec;
  /** ids by scaled probability, highest first; ties go to the lower id */
  order: number[];
  topKCut: number[];
  topPCut: number[];
  /** renormalised over the ids that are left; 0 for cut ids */
  final: Vec;
}

/** Temperature, then top-k, then top-p (over what top-k left), then renormalise. */
export function reshape(logits: Vec, o: { temperature: number; topK: number; topP: number }): Reshaped {
  const scaled = softmax(logits.map((x) => x / o.temperature));
  const order = scaled.map((_, i) => i).toSorted((a, b) => scaled[b]! - scaled[a]! || a - b);
  const topKCut = order.slice(o.topK);
  const left = order.slice(0, o.topK);
  let kept = 0;
  // Always keep at least one id; the tolerance stops rounding from cutting the last id when p = 1.
  for (let total = 0; kept < left.length && (kept === 0 || total < o.topP - 1e-12); kept++) total += scaled[left[kept]!]!;
  // p = 1 keeps everything: at low temperatures the tail rounds to 0 and would otherwise be cut.
  if (o.topP >= 1) kept = left.length;
  const topPCut = left.slice(kept);
  const cut = new Set([...topKCut, ...topPCut]);
  const mass = left.slice(0, kept).reduce((s, i) => s + scaled[i]!, 0);
  return { scaled, order, topKCut, topPCut, final: scaled.map((p, i) => (cut.has(i) ? 0 : p / mass)) };
}

/** The first id (in id order) whose cumulative probability passes the random number; never a zero-probability id. */
export function draw(probs: Vec, rng: () => number): number {
  const r = rng();
  let total = 0;
  let last = 0;
  for (const [i, p] of probs.entries()) {
    if (p <= 0) continue;
    total += p;
    last = i;
    if (total > r) return i;
  }
  return last;
}
