import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { traceRun } from '../trace';
import * as naive from './naive';
import * as pattern from './pattern';
import { interpreterLesson as lesson } from './scenario';

const run = (usePattern: boolean, changed: boolean, expression: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, expression, t));
};
const facts = (usePattern: boolean, changed: boolean, expression: string) => Object.fromEntries(run(usePattern, changed, expression).result!.facts);

describe('Interpreter', () => {
  it('evaluates and prints each expression the same way on every design that has it', () => {
    const cases: [string, string, boolean][] = [
      ['2 + 3', '5', false],
      ['x * (y + 1)', '24', false],
      ['max(x, y) + 1', '6', true],
    ];
    for (const [expression, value, needsChange] of cases) {
      for (const usePattern of [false, true]) {
        for (const changed of needsChange ? [true] : [false, true]) {
          const f = facts(usePattern, changed, expression);
          expect([f.Value, f.Printed], `${expression} ${usePattern} ${changed}`).toEqual([value, expression]);
        }
      }
    }
  });

  it('throws on a variable missing from the context, on both designs', () => {
    expect(() => new naive.Evaluator().evaluate(new naive.Var('z'), { x: 4 })).toThrow('Unknown variable z');
    expect(() => new pattern.Var('z').interpret({ x: 4 })).toThrow('Unknown variable z');
  });

  it('nests the interpret calls with the tree', () => {
    const calls = run(true, false, 'x * (y + 1)').calls.filter((c) => c.method === 'interpret');
    expect(calls.map((c) => [c.callee, c.depth])).toEqual([
      ['Mul#1', 0],
      ['Var#1', 1],
      ['Add#1', 1],
      ['Var#2', 2],
      ['Num#1', 2],
    ]);
  });

  it('edits both walkers without the pattern, and adds one node class with it', () => {
    const naiveCost = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naiveCost.classesAdded).toEqual(['Max']);
    expect(naiveCost.classesEdited).toEqual(['Evaluator', 'Printer']);
    expect(naiveCost.branchesAfter - naiveCost.branchesBefore).toBe(2);
    expect([naiveCost.linesAdded, naiveCost.linesRemoved]).toEqual([9, 1]);
    expect(patterned.classesAdded).toEqual(['Max']);
    expect(patterned.classesEdited).toEqual([]);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([12, 0]);
  });
});
