import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { MAX_STEPS, patternSteps } from '../steps';
import { traceRun } from '../trace';
import { flyweightLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, trees: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, trees, t));
};
const facts = (pattern: boolean, changed: boolean, trees: string) => Object.fromEntries(run(pattern, changed, trees).result!.facts);

describe('Flyweight', () => {
  it('gives every tree its own texture without the pattern', () => {
    expect(facts(false, false, '6 trees')['Texture arrays']).toBe('6');
    expect(facts(false, false, '24 trees')['Texture arrays']).toBe('24');
    expect(facts(false, true, '24 trees')['Texture arrays']).toBe('48');
    expect(facts(false, false, '24 trees')['Numbers stored']).toBe('1536');
  });

  it('shares one texture per species with the pattern', () => {
    for (const trees of ['6 trees', '12 trees', '24 trees']) {
      expect(facts(true, false, trees)['Texture arrays'], trees).toBe('2');
      expect(facts(true, true, trees)['Texture arrays'], trees).toBe('4');
    }
    expect(facts(true, false, '24 trees')['Numbers stored']).toBe('128');
  });

  it('plants the same forest either way', () => {
    expect(facts(true, false, '12 trees').Forest).toBe(facts(false, false, '12 trees').Forest);
    expect(facts(true, false, '12 trees').Forest).toBe('12 trees drawn: 6 oak, 6 pine');
  });

  it('has the factory make each shared type', () => {
    const trace = run(true, false, '6 trees');
    const types = trace.objects.filter((o) => o.className === 'TreeType');
    expect(types.map((o) => o.id)).toEqual(['TreeType#1', 'TreeType#2']);
    for (const type of types) {
      expect(type.origin.kind).toBe('made');
      if (type.origin.kind === 'made') expect(trace.calls[type.origin.by]).toMatchObject({ callee: 'TreeFactory#1', method: 'get' });
    }
  });

  it('fits the largest run in the steps with its result', () => {
    for (const design of ['Naive', 'Pattern']) {
      const steps = patternSteps(lesson, { design, change: lesson.change, trees: '24 trees' });
      expect(steps.length, design).toBeLessThanOrEqual(MAX_STEPS + 1);
      expect(steps.some((s) => s.title.includes('skipped')), design).toBe(false);
      expect(steps.at(-3)!.variables!.result, design).toBe('right');
    }
  });

  it('edits one class for the bark in either design', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['Tree']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([2, 0]);
    expect(pattern.classesAdded).toEqual([]);
    expect(pattern.classesEdited).toEqual(['TreeType']);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([2, 0]);
  });
});
