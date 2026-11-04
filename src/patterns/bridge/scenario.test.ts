import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { bridgeLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, shape: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, shape, t));
};
const facts = (pattern: boolean, changed: boolean, shape: string) => Object.fromEntries(run(pattern, changed, shape).result!.facts);

describe('Bridge', () => {
  it('draws the same output with either design', () => {
    for (const changed of [false, true]) {
      for (const shape of ['Circle', 'Square']) {
        const { Classes: _n, ...naive } = facts(false, changed, shape);
        const { Classes: _p, ...pattern } = facts(true, changed, shape);
        expect(pattern, `${shape} ${changed}`).toEqual(naive);
      }
    }
    expect(facts(true, false, 'Circle')).toMatchObject({ Canvas: 'arc(0, 0, 5)', Text: '( )' });
    expect(facts(true, true, 'Square')).toMatchObject({ Canvas: 'rect(0, 0, 10, 10)', Text: '[ ]', SVG: '<rect width="10" height="10"/>' });
    expect(facts(true, true, 'Circle').SVG).toBe('<circle r="5"/>');
    expect(facts(true, false, 'Circle').SVG).toBeUndefined();
  });

  it('needs a class per shape and renderer pair without the pattern', () => {
    expect(facts(false, false, 'Circle').Classes).toBe('4');
    expect(facts(false, true, 'Circle').Classes).toBe('6');
    expect(facts(true, false, 'Circle').Classes).toBe('4');
    expect(facts(true, true, 'Circle').Classes).toBe('5');
  });

  it('has the shape call its renderer', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', shape: 'Circle' });
    expect(steps.map((s) => s.title)).toContain('Circle#1 calls CanvasRenderer#1.circle(5)');
  });

  it('adds 2 classes without the pattern, and 1 with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['SvgCircle', 'SvgSquare']);
    expect(naive.classesEdited).toEqual([]);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([12, 0]);
    expect(pattern.classesAdded).toEqual(['SvgRenderer']);
    expect(pattern.classesEdited).toEqual([]);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([8, 0]);
  });

  it('shows the cost of the change in the steps', () => {
    const steps = patternSteps(lesson, { design: 'Pattern', change: lesson.change, shape: 'Circle' });
    const grid = steps.at(-2)!.view;
    expect(grid.kind).toBe('grid');
    if (grid.kind !== 'grid') return;
    expect(grid.rows[0]!.cells.map((c) => c?.value)).toEqual(['2 classes', '1 class']);
  });
});
