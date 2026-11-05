import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { MAX_STEPS, patternSteps } from '../steps';
import { traceRun } from '../trace';
import { visitorLesson as lesson } from './scenario';

const run = (usePattern: boolean, changed: boolean, drawing: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, drawing, t));
};
const facts = (usePattern: boolean, changed: boolean, drawing: string) => Object.fromEntries(run(usePattern, changed, drawing).result!.facts);

describe('Visitor', () => {
  it('computes the same area, SVG and JSON on both designs', () => {
    expect(facts(false, false, 'One circle')).toEqual({ 'Total area': '13', SVG: '<circle r="2"/>' });
    expect(facts(false, false, '3 shapes')).toEqual({
      'Total area': '31',
      SVG: '<circle r="2"/><rect width="3" height="4"/><polygon points="0,2 6,2 3,0"/>',
    });
    expect(facts(false, true, '3 shapes').JSON).toBe('[{"circle":2},{"rect":[3,4]},{"triangle":[6,2]}]');
    expect(facts(false, false, '6 shapes')['Total area']).toBe('90');
    for (const drawing of ['One circle', '3 shapes', '6 shapes']) {
      expect(facts(true, false, drawing), drawing).toEqual(facts(false, false, drawing));
      expect(facts(true, true, drawing), drawing).toEqual(facts(false, true, drawing));
    }
  });

  it('dispatches twice: accept on the shape, then the visitor\'s method for that shape', () => {
    const titles = patternSteps(lesson, { design: 'Pattern', change: 'None', drawing: 'One circle' }).map((s) => s.title);
    const accept = titles.indexOf('client calls Circle#1.accept(SvgVisitor#1)');
    expect(accept).toBeGreaterThanOrEqual(0);
    expect(titles[accept + 1]).toBe('Circle#1 calls SvgVisitor#1.visitCircle(Circle#1)');
  });

  it('runs the largest case whole, within the step cap', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: 'Add a JSON export', drawing: '6 shapes' });
    expect(steps.length).toBeLessThanOrEqual(MAX_STEPS + 1);
    expect(steps.some((s) => s.title.includes('skipped') || s.title.includes('was cut'))).toBe(false);
    expect(steps.at(-3)!.variables?.result).toBe('right');
  });

  it('edits every shape without the pattern, and adds one visitor with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['Circle', 'Rect', 'Triangle']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([9, 0]);
    expect(patterned.classesAdded).toEqual(['JsonVisitor']);
    expect(patterned.classesEdited).toEqual([]);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([11, 0]);
  });
});
