import { describe, expect, it } from 'vitest';
import { trainingLossSteps } from './training-loss';

const base = { sentence: 'the cat sat on the mat', lr: '0.5', steps: '20' };
const summary = (values: Record<string, string>) => trainingLossSteps(values).at(-1)!.variables!;

describe('training lesson', () => {
  it('starts at the loss of a uniform guess', () => {
    expect(trainingLossSteps(base)[0]!.variables!.loss).toBe('3.53');
  });

  it('lowers the loss from the first visit of each pair to the last', () => {
    const s = summary(base);
    expect(Number(s['last loss'])).toBeLessThan(Number(s['first loss']));
  });

  it('learns faster with a bigger learning rate here', () => {
    expect(Number(summary({ ...base, lr: '2' })['last loss'])).toBeLessThan(Number(summary({ ...base, lr: '0.1' })['last loss']));
  });

  it('shows the target bar for every sentence', () => {
    for (const step of trainingLossSteps({ ...base, sentence: 'the fish swam in the pond' }).slice(0, -1)) {
      expect(step.view.kind === 'distribution' && step.view.target !== undefined).toBe(true);
    }
  });
});
