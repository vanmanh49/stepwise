import { describe, expect, it } from 'vitest';
import type { CallsView, Step } from '../../types/visualization';
import { factorial, fibonacciNaive, recursionCode, recursionSteps } from './basics';

function expectExplained(steps: Step[], code: string) {
  const lines = code.split('\n').length;
  expect(steps.length).toBeLessThan(400);
  for (const step of steps) {
    expect(step.title).not.toBe('');
    expect(step.why).not.toBe('');
    expect(step.codeLine).toBeGreaterThanOrEqual(1);
    expect(step.codeLine).toBeLessThanOrEqual(lines);
  }
}

const lastCalls = (steps: Step[]): CallsView => {
  const view = steps[steps.length - 1]!.view;
  if (view.kind !== 'calls') throw new Error(`expected a calls view, got ${view.kind}`);
  return view;
};

describe('recursion basics', () => {
  it('computes factorial and naive Fibonacci', () => {
    expect(factorial(5)).toBe(120);
    expect(factorial(0)).toBe(1);
    expect(fibonacciNaive(5)).toEqual({ value: 5, calls: 15 });
    expect(fibonacciNaive(6)).toEqual({ value: 8, calls: 25 });
  });

  it('draws one frame per Fibonacci call and returns the answer at the root', () => {
    const steps = recursionSteps({ fn: 'fibonacci', n: '5' });
    const view = lastCalls(steps);
    expect(view.frames).toHaveLength(15);
    expect(view.frames[0]).toMatchObject({ label: 'fib(5)', result: '5' });
    expect(view.frames.every((f) => f.role === 'sorted')).toBe(true);
    expectExplained(steps, recursionCode);
  });

  it('draws a chain of frames for factorial', () => {
    const steps = recursionSteps({ fn: 'factorial', n: '5' });
    const view = lastCalls(steps);
    expect(view.frames.map((f) => f.label)).toEqual(['factorial(5)', 'factorial(4)', 'factorial(3)', 'factorial(2)', 'factorial(1)']);
    expect(view.frames[0]!.result).toBe('120');
    expectExplained(steps, recursionCode);
  });

  it('points out repeated work', () => {
    const steps = recursionSteps({ fn: 'fibonacci', n: '5' });
    expect(steps.some((s) => /again/i.test(s.why))).toBe(true);
  });

  it('stays readable for the largest input', () => {
    expectExplained(recursionSteps({ fn: 'fibonacci', n: '6' }), recursionCode);
  });

  it.each([
    { fn: 'fibonacci', n: '7' },
    { fn: 'fibonacci', n: '-1' },
    { fn: 'other', n: '3' },
  ])('refuses %o with one step', (values) => {
    expect(recursionSteps(values)).toHaveLength(1);
  });
});
