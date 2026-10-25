import { refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { VOCAB } from '../corpus';
import { D, forward } from '../model';
import { EMPTY, fmt, matrixGrid, readPrompt, vectorGrid } from '../steps';
import { argmax, scale } from '../tensor';

export const selfAttentionCode = `// every token i makes a query, a key and a value
q[i] = Wq · x[i];  k[i] = Wk · x[i];  v[i] = Wv · x[i]

for (const j of tokens) {
  score[i][j] = dot(q[i], k[j])          // how well token j answers i's query
  score[i][j] /= Math.sqrt(8)            // keep scores in a gentle range
  if (j > i) score[i][j] = -Infinity     // no looking at later tokens
}
weights[i] = softmax(score[i])           // each row adds up to 1
out[i] = sum(weights[i][j] * v[j])       // a blend of the values`;

const line = (snippet: string) => lineOf(selfAttentionCode, snippet);

export function selfAttentionSteps(values: Record<string, string>): Step[] {
  const prompt = readPrompt(values, 'prompt', 'Prompt');
  if (!prompt.ok) return refusal("Can't run attention on this prompt", prompt.why, EMPTY);
  const tokens = prompt.value;
  const f = forward(tokens);
  const labels = tokens.map((t) => VOCAB[t]!);
  const last = tokens.length - 1;
  const word = labels[last]!;
  const square = (m: number[][], id: string, heat: 'abs' | 'value') => matrixGrid(m, labels, labels, id, heat);
  const row = f.weights[last]!;
  const top = argmax(row);
  const blended = tokens.map((_, j) => scale(f.v[j]!, row[j]!));
  const head = f.v[0]!.map((_, d) => blended.reduce((s, v) => s + v[d]!, 0));

  return [
    {
      title: `Start from ${tokens.length} token vector${tokens.length === 1 ? '' : 's'} (embedding + position)`,
      why: 'Each token\'s embedding has its position\'s vector added, so the model can tell "the" at the start from "the" later on. Attention lets these vectors share information.',
      codeLine: line('q[i] = Wq'),
      view: vectorGrid(labels.map((l, i) => ({ label: l, values: f.x[i]! })), 'x'),
    },
    {
      title: `The last token, ${word}, makes a query, a key and a value`,
      why: 'Three learned matrices turn each vector into a query (what this token is looking for), a key (what it offers) and a value (what it passes on if chosen). Every token does this; the last one is shown.',
      codeLine: line('q[i] = Wq'),
      view: vectorGrid([{ label: 'query', values: f.q[last]! }, { label: 'key', values: f.k[last]! }, { label: 'value', values: f.v[last]! }], 'qkv'),
    },
    {
      title: `Score every pair: query of the row's token · key of the column's token`,
      why: 'A large dot product means the column token has what the row token is looking for.',
      codeLine: line('score[i][j] = dot'),
      view: square(f.scores, 'score', 'abs'),
    },
    {
      title: `Divide every score by √${D} = ${fmt(Math.sqrt(D))}`,
      why: 'Dot products grow with the vector size. Dividing keeps the scores small, so softmax doesn\'t put all the weight on one token.',
      codeLine: line('score[i][j] /= Math.sqrt'),
      view: square(f.scaled, 'score', 'abs'),
    },
    {
      title: 'Mask the future: every score above the diagonal becomes −∞',
      why: 'When predicting the next word, a token may only look at itself and the tokens before it. e^−∞ is 0, so masked tokens get no weight.',
      codeLine: line('score[i][j] = -Infinity'),
      view: square(f.masked, 'score', 'abs'),
    },
    {
      title: `softmax each row: ${word} gives ${labels[top]} the most weight (${fmt(row[top]!)})`,
      why: 'softmax turns each row of scores into weights that add up to 1. The first token can only look at itself, so its weight is 1.00.',
      codeLine: line('weights[i] = softmax'),
      variables: { 'row sum': fmt(row.reduce((a, b) => a + b, 0)) },
      view: square(f.weights, 'weight', 'value'),
    },
    {
      title: `The output for the last ${word} is a blend: each token's value times its weight, added up`,
      why: `Each column is one token's value scaled by its weight; the last column is their sum. ${word} now carries information from the tokens it attended to, mostly ${labels[top]}. A last matrix (Wo) mixes the blend before it is added back to ${word}'s vector.`,
      next: 'The Transformer Block lesson follows this output through the rest of the layer to the next-word prediction.',
      codeLine: line('out[i] = sum'),
      variables: Object.fromEntries(labels.map((l, j) => [`w(${l}${labels.indexOf(l) === j ? '' : ` ${j + 1}`})`, fmt(row[j]!)])),
      view: vectorGrid([...blended.map((v, j) => ({ label: labels[j]!, values: v })), { label: 'sum', values: head }], 'blend'),
    },
  ];
}
