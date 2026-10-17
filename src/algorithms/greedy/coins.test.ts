import { describe, expect, it } from 'vitest';
import type { Step } from '../../types/visualization';
import { greedyCoins, greedyCoinsCode, greedyCoinsSteps } from './coins';

function expectExplained(steps: Step[]) {
  const lines = greedyCoinsCode.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.view.kind).toBe('array');
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

const taken = (step: Step) => (step.view.kind === 'array' ? (step.view.aux?.cells ?? []).map((c) => c.value) : []);

describe('greedyCoins', () => {
  it('takes the largest coin that fits each time', () => {
    expect(greedyCoins([25, 10, 5, 1], 63)).toEqual([25, 25, 10, 1, 1, 1]);
  });

  it('can use more coins than necessary', () => {
    expect(greedyCoins([1, 3, 4], 6)).toEqual([4, 1, 1]);
  });

  it('sorts the coins itself', () => {
    expect(greedyCoins([1, 10, 5, 25], 30)).toEqual([25, 5]);
  });

  it('returns null when it gets stuck', () => {
    expect(greedyCoins([5], 3)).toBeNull();
    expect(greedyCoins([4, 3], 6)).toBeNull();
  });
});

describe('greedyCoinsSteps', () => {
  it('ends with the coins taken', () => {
    const steps = greedyCoinsSteps({ coins: '25, 10, 5, 1', amount: '63' });
    expect(taken(steps[steps.length - 1]!)).toEqual([25, 25, 10, 1, 1, 1]);
    expectExplained(steps);
  });

  it('says when it is stuck', () => {
    const steps = greedyCoinsSteps({ coins: '5', amount: '3' });
    expect(steps[steps.length - 1]!.title.toLowerCase()).toContain('stuck');
    expectExplained(steps);
  });

  it('stays readable for the largest input', () => {
    expectExplained(greedyCoinsSteps({ coins: '1', amount: '200' }));
  });

  it.each([
    { coins: '25, 10', amount: '0' },
    { coins: 'x', amount: '5' },
    { coins: '1, 2, 3, 4, 5, 6, 7', amount: '5' },
    { coins: '0, 5', amount: '5' },
    { coins: '5', amount: '201' },
  ])('refuses %o with one step', (values) => {
    expect(greedyCoinsSteps(values)).toHaveLength(1);
  });
});
