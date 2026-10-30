/** Plain number helpers for the tiny model. A Mat is a list of rows. */
export type Vec = number[];
export type Mat = number[][];

export const dot = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + x * b[i]!, 0);
export const add = (a: Vec, b: Vec) => a.map((x, i) => x + b[i]!);
export const scale = (a: Vec, k: number) => a.map((x) => x * k);
export const relu = (a: Vec) => a.map((x) => Math.max(0, x));
/** m has one row per output: matVec(m, v)[i] = m[i] · v. */
export const matVec = (m: Mat, v: Vec) => m.map((row) => dot(row, v));

/** Max-subtracted, so huge logits stay finite; -Infinity entries get probability 0. */
export function softmax(v: Vec): Vec {
  const max = Math.max(...v);
  const e = v.map((x) => Math.exp(x - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / sum);
}

/** Mean 0, variance 1; no learned gain or bias. */
export function layerNorm(v: Vec): Vec {
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  return v.map((x) => (x - mean) / Math.sqrt(variance + 1e-5));
}

export const cosine = (a: Vec, b: Vec) => dot(a, b) / (Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b)));

/** Index of the largest entry; the lowest index on ties. */
export const argmax = (v: Vec) => v.reduce((best, x, i) => (x > v[best]! ? i : best), 0);
