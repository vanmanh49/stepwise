import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { adapterLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, amount: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, amount, t));
};

describe('Adapter', () => {
  it('pays the old gateway in dollars before the change', () => {
    for (const pattern of [false, true]) expect(run(pattern, false, '19.99').result!.facts[0]).toEqual(['Payment', 'paid $19.99']);
  });

  it('charges the new provider in whole cents after the change', () => {
    for (const pattern of [false, true]) {
      for (const [amount, cents] of [['19.99', 1999], ['0.10', 10], ['5', 500]] as const) {
        const result = run(pattern, true, amount).result!;
        expect(result.ok).toBe(true);
        expect(result.facts[0]).toEqual(['Payment', `charged ${cents} USD`]);
      }
    }
  });

  it('converts to cents inside the adapter', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: lesson.change, amount: '19.99' });
    expect(steps.some((s) => s.title === 'ProviderAdapter#1 calls NewProvider#1.charge(1999, "USD")')).toBe(true);
    expect(steps.some((s) => s.title === 'Checkout#1 calls ProviderAdapter#1.pay(19.99)')).toBe(true);
  });

  it('edits Checkout without the pattern, and only one line of App with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['Checkout']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([2, 2]);
    expect(pattern.classesAdded).toEqual(['ProviderAdapter']);
    expect(pattern.classesEdited).toEqual(['App']);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([7, 1]);
  });
});
