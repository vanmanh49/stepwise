import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Value } from '../src/ai/autograd';
import { CORPUS, END, tokenId, tokenize, VOCAB } from '../src/ai/corpus';
import { CONTEXT, D, forward, HIDDEN, SEED, type Weights } from '../src/ai/model';
import { seeded } from '../src/utils/random';

// Run with `npm run train:ai`: trains the tiny model and writes src/ai/weights.ts. Skipped in `npm test`.

const EPOCHS = 400;
const TARGET_LOSS = 0.6;
const LR = 0.01;
const SHAPES: { [K in keyof Weights]: [number, number] | [number] } = {
  tokenEmbed: [VOCAB.length, D],
  posEmbed: [CONTEXT, D],
  wq: [D, D],
  wk: [D, D],
  wv: [D, D],
  wo: [D, D],
  w1: [HIDDEN, D],
  b1: [HIDDEN],
  w2: [D, HIDDEN],
  b2: [D],
  bUnembed: [VOCAB.length],
};

type VMat = Value[][];
const vdot = (a: Value[], b: Value[]) => a.reduce((s, x, i) => s.add(x.mul(b[i]!)), new Value(0));
const vadd = (a: Value[], b: Value[]) => a.map((x, i) => x.add(b[i]!));
const vmatVec = (m: VMat, v: Value[]) => m.map((row) => vdot(row, v));
function vsoftmaxLog(v: Value[]): Value[] {
  const max = Math.max(...v.map((x) => x.data));
  const shifted = v.map((x) => x.sub(max));
  const logSum = shifted.reduce((s, x) => s.add(x.exp()), new Value(0)).log();
  return shifted.map((x) => x.sub(logSum));
}
function vsoftmax(v: Value[]): Value[] {
  return vsoftmaxLog(v).map((x) => x.exp());
}
function vlayerNorm(v: Value[]): Value[] {
  const mean = v.reduce((s, x) => s.add(x), new Value(0)).div(v.length);
  const centred = v.map((x) => x.sub(mean));
  const variance = centred.reduce((s, x) => s.add(x.pow(2)), new Value(0)).div(v.length);
  const std = variance.add(1e-5).pow(0.5);
  return centred.map((x) => x.div(std));
}

/** Mirrors `forward` in model.ts stage for stage, in Values, and returns the log-probabilities per position. */
function vforward(tokens: number[], w: { [K in keyof Weights]: K extends 'b1' | 'b2' | 'bUnembed' ? Value[] : VMat }): Value[][] {
  const x = tokens.map((t, i) => vadd(w.tokenEmbed[t]!, w.posEmbed[i]!));
  const q = x.map((r) => vmatVec(w.wq, r));
  const k = x.map((r) => vmatVec(w.wk, r));
  const v = x.map((r) => vmatVec(w.wv, r));
  return x.map((xi, i) => {
    const weights = vsoftmax(k.slice(0, i + 1).map((kj) => vdot(q[i]!, kj).div(Math.sqrt(D))));
    const head = Array.from({ length: D }, (_, d) => weights.reduce((s, wij, j) => s.add(wij.mul(v[j]![d]!)), new Value(0)));
    const norm1 = vlayerNorm(vadd(xi, vmatVec(w.wo, head)));
    const hidden = vadd(vmatVec(w.w1, norm1), w.b1).map((h) => h.relu());
    const norm2 = vlayerNorm(vadd(norm1, vadd(vmatVec(w.w2, hidden), w.b2)));
    return vsoftmaxLog(vadd(vmatVec(w.tokenEmbed, norm2), w.bUnembed));
  });
}

const DATA = CORPUS.map((s) => [...tokenize(s), tokenId(END)!]).map((t) => ({ input: t.slice(0, -1).slice(0, CONTEXT), target: t.slice(1, CONTEXT + 1) }));

it.skipIf(!process.env.AI_TRAIN)(
  'trains the tiny model and writes src/ai/weights.ts',
  () => {
    const started = Date.now();
    const rng = seeded(SEED);
    const keys = Object.keys(SHAPES) as (keyof Weights)[];
    const params = Object.fromEntries(
      keys.map((key) => {
        const [rows, cols] = SHAPES[key];
        const init = () => new Value(key.startsWith('b') ? 0 : (rng() * 2 - 1) * 0.3);
        return [key, cols === undefined ? Array.from({ length: rows }, init) : Array.from({ length: rows }, () => Array.from({ length: cols }, init))];
      }),
    ) as Parameters<typeof vforward>[1];
    const flat: Value[] = keys.flatMap((key) => (params[key] as (Value | Value[])[]).flat());
    const m = flat.map(() => 0);
    const s = flat.map(() => 0);

    let loss = Infinity;
    for (let epoch = 1; epoch <= EPOCHS && loss > TARGET_LOSS; epoch++) {
      const terms = DATA.flatMap(({ input, target }) => vforward(input, params).map((logp, i) => logp[target[i]!]!));
      const total = terms.reduce((acc, t) => acc.add(t), new Value(0)).neg().div(terms.length);
      for (const p of flat) p.grad = 0;
      total.backward();
      loss = total.data;
      flat.forEach((p, i) => {
        m[i] = 0.9 * m[i]! + 0.1 * p.grad;
        s[i] = 0.999 * s[i]! + 0.001 * p.grad ** 2;
        p.data -= (LR * (m[i]! / (1 - 0.9 ** epoch))) / (Math.sqrt(s[i]! / (1 - 0.999 ** epoch)) + 1e-8);
      });
      if (epoch % 50 === 0) console.log(`epoch ${epoch}: loss ${loss.toFixed(4)}`);
    }

    const round = (x: number) => Math.round(x * 1000) / 1000 || 0;
    const weights = Object.fromEntries(
      keys.map((key) => [key, (params[key] as (Value | Value[])[]).map((r) => (r instanceof Value ? round(r.data) : r.map((x) => round(x.data))))]),
    ) as unknown as Weights;

    // Parity: the plain forward on the rounded weights gives the same loss as the Value forward on them.
    const rounded = Object.fromEntries(keys.map((key) => [key, (weights[key] as (number | number[])[]).map((r) => (typeof r === 'number' ? new Value(r) : r.map((x) => new Value(x))))])) as Parameters<typeof vforward>[1];
    const pairs = DATA.flatMap(({ input, target }) => target.map((t, i) => ({ input, t, i })));
    const valueLoss = -pairs.reduce((acc, { input, t, i }) => acc + vforward(input, rounded)[i]![t]!.data, 0) / pairs.length;
    const plainLoss = -pairs.reduce((acc, { input, t, i }) => acc + Math.log(forward(input, weights).probs[i]![t]!), 0) / pairs.length;
    expect(Math.abs(valueLoss - plainLoss)).toBeLessThan(1e-6);

    const body = keys.map((key) => `  ${key}: ${JSON.stringify(weights[key])},`).join('\n');
    writeFileSync(
      new URL('../src/ai/weights.ts', import.meta.url),
      `// Generated by npm run train:ai. Do not edit.\n/* oxlint-disable approx-constant -- trained weights, not constants */\nimport type { Weights } from './model';\n\nexport const WEIGHTS: Weights = {\n${body}\n};\n`,
    );
    console.log(`final loss ${loss.toFixed(4)} (rounded ${plainLoss.toFixed(4)}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  },
  300_000,
);
