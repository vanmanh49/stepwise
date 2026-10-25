import { readChoice, readInt, refusal } from '../../algorithms/form';
import { lineOf } from '../../data-structures/shared';
import type { Step } from '../../types/visualization';
import { trainBigram } from '../bigram';
import { CORPUS, END, tokenId, tokenize, VOCAB } from '../corpus';
import { distributionView, EMPTY, fmt } from '../steps';

export const trainingLossCode = `table = zeros(vocab, vocab)          // one row of scores per previous word
for (const [prev, next] of pairs(sentence)) {
  probs = softmax(table[prev])       // the model's guess for the next word
  loss = -log(probs[next])           // small when the right word was likely
  grad = probs - oneHot(next)        // which way each score should move
  table[prev] -= lr * grad           // a step downhill
}`;

export const LEARNING_RATES = ['0.1', '0.5', '1', '2'];
export const MAX_TRAINING_STEPS = 50;
const line = (snippet: string) => lineOf(trainingLossCode, snippet);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function trainingLossSteps(values: Record<string, string>): Step[] {
  const fail = (why: string) => refusal("Can't train on these settings", why, EMPTY);
  const sentence = readChoice(values, 'sentence', 'Sentence', CORPUS);
  if (!sentence.ok) return fail(sentence.why);
  const lr = readChoice(values, 'lr', 'Learning rate', LEARNING_RATES);
  if (!lr.ok) return fail(lr.why);
  const count = readInt(values, 'steps', 'Training steps', { min: 1, max: MAX_TRAINING_STEPS });
  if (!count.ok) return fail(count.why);

  const tokens = [...tokenize(sentence.value), tokenId(END)!];
  const run = trainBigram(tokens, Number(lr.value), count.value);
  const steps: Step[] = [];
  run.steps.forEach((s, i) => {
    const prev = VOCAB[s.prev]!;
    const next = VOCAB[s.next]!;
    const title = `P(next word | ${prev})`;
    steps.push({
      title: `Step ${i + 1}: after "${prev}" the model gives "${next}" ${fmt(s.before[s.next]!)}, so the loss is ${fmt(s.loss)}`,
      why:
        i === 0
          ? `The table starts at all zeros, so every one of the ${VOCAB.length} words gets 1/${VOCAB.length}. The loss is −log of the right word's probability: ${fmt(s.loss)}.`
          : `The loss is −log of the probability the model gave the right word. A sure, correct guess gives a loss near 0.`,
      codeLine: line('loss = -log'),
      variables: { loss: fmt(s.loss), [`p(${next})`]: fmt(s.before[s.next]!), [`grad(${next})`]: fmt(s.grad[s.next]!), lr: lr.value },
      view: distributionView(s.before, { title, target: s.next }),
    });
    steps.push({
      title: `Update the "${prev}" row: "${next}" rises to ${fmt(s.after[s.next]!)}`,
      why: `The gradient is the probability minus 1 for "${next}" (${fmt(s.grad[s.next]!)}) and just the probability for every other word. Subtracting ${lr.value} × gradient raises "${next}" and lowers the rest.`,
      codeLine: line('table[prev] -= lr * grad'),
      variables: { [`p(${next})`]: fmt(s.after[s.next]!), lr: lr.value },
      view: distributionView(s.after, { title, target: s.next, chosen: s.next }),
    });
  });
  const pairs = tokens.length - 1;
  const first = run.steps.slice(0, pairs).map((s) => s.loss);
  const last = run.steps.slice(-pairs).map((s) => s.loss);
  const final = run.steps.at(-1)!;
  steps.push({
    title: `Average loss: ${fmt(mean(first))} on the first pass, ${fmt(mean(last))} on the last`,
    why:
      count.value <= pairs
        ? `With ${count.value} step${count.value === 1 ? '' : 's'}, each word pair was seen at most once. Train for more steps to see the loss fall on a second pass.`
        : `Each pass over the sentence moves every row a little closer to the right next word. A larger learning rate takes bigger steps: faster here, but in a real model too large a step can overshoot and make the loss worse.`,
    next: 'Real models learn the same way, with billions of numbers and a gradient worked out through every layer (backpropagation) instead of one table row.',
    codeLine: line('for (const [prev, next]'),
    variables: { 'first loss': fmt(mean(first)), 'last loss': fmt(mean(last)), lr: lr.value },
    view: distributionView(final.after, { title: `P(next word | ${VOCAB[final.prev]})`, target: final.next }),
  });
  return steps;
}
