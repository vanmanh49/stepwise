import { describe, expect, it } from 'vitest';
import { Value } from './autograd';
import { trainBigram } from './bigram';
import { END, tokenId, tokenize, VOCAB } from './corpus';

const sentence = [...tokenize('the cat sat on the mat'), tokenId(END)!];

describe('trainBigram', () => {
  const run = trainBigram(sentence, 0.5, 20);

  it('starts from a uniform guess', () => {
    expect(run.steps[0]!.loss).toBeCloseTo(Math.log(VOCAB.length), 12);
  });

  it('has gradients that sum to 0', () => {
    for (const step of run.steps) expect(Math.abs(step.grad.reduce((a, b) => a + b, 0))).toBeLessThan(1e-12);
  });

  it('lowers the loss on the second visit to a pair', () => {
    const pairs = sentence.length - 1;
    expect(run.steps[pairs]!.loss).toBeLessThan(run.steps[0]!.loss);
  });

  it('raises the target probability on every step', () => {
    for (const step of run.steps) expect(step.after[step.next]!).toBeGreaterThan(step.before[step.next]!);
  });

  it('matches the gradient the autograd computes', () => {
    const step = run.steps[7]!;
    const row = step.before.map((p) => new Value(Math.log(p)));
    const max = Math.max(...row.map((x) => x.data));
    const logSum = row.reduce((s, x) => s.add(x.sub(max).exp()), new Value(0)).log().add(max);
    row[step.next]!.sub(logSum).neg().backward();
    row.forEach((x, i) => expect(x.grad).toBeCloseTo(step.grad[i]!, 9));
  });

  it('never changes its input', () => {
    const copy = [...sentence];
    trainBigram(copy, 1, 5);
    expect(copy).toEqual(sentence);
  });
});
