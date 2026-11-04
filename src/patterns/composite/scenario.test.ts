import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { compositeLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, tree: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, tree, t));
};
const facts = (pattern: boolean, changed: boolean, tree: string) => Object.fromEntries(run(pattern, changed, tree).result!.facts);

describe('Composite', () => {
  it('gives the same size and count with either design', () => {
    for (const changed of [false, true]) {
      for (const tree of ['Flat', 'Nested', 'Deep', ...(changed ? ['With a zip'] : [])]) {
        expect(facts(true, changed, tree), `${tree} ${changed}`).toEqual(facts(false, changed, tree));
      }
    }
    expect(facts(true, false, 'Flat')).toEqual({ 'Total size': '600 bytes', Files: '3' });
    expect(facts(true, false, 'Deep')).toEqual({ 'Total size': '1000 bytes', Files: '4' });
  });

  it('stores the files in a zip at half their size', () => {
    expect(facts(true, true, 'With a zip')).toEqual({ 'Total size': '1100 bytes', Files: '5' });
  });

  it('nests the calls as deep as the tree', () => {
    const trace = run(true, false, 'Deep');
    expect(Math.max(...trace.calls.map((c) => c.depth))).toBe(4);
    expect(trace.calls[0]).toMatchObject({ caller: 'client', callee: 'Folder#1', method: 'size' });
  });

  it('refuses the zip before the change', () => {
    expect(patternSteps(lesson, { design: 'Pattern', change: 'None', tree: 'With a zip' })).toHaveLength(1);
  });

  it('edits the folder and both walkers without the pattern, and nothing with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['Zip']);
    expect(naive.classesEdited).toEqual(['Folder', 'SizeReport', 'CountReport']);
    expect(naive.branchesAfter - naive.branchesBefore).toBe(2);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([11, 3]);
    expect(pattern.classesAdded).toEqual(['Zip']);
    expect(pattern.classesEdited).toEqual([]);
    expect(pattern.branchesAfter).toBe(pattern.branchesBefore);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([12, 0]);
  });

  it('shows the edited walkers in the cost grid', () => {
    const steps = patternSteps(lesson, { design: 'Naive', change: lesson.change, tree: 'With a zip' });
    const grid = steps.at(-2)!.view;
    if (grid.kind !== 'grid') throw new Error('expected the cost grid');
    expect(grid.rows[1]!.cells.map((c) => c?.value)).toEqual(['3 classes', '0 classes']);
  });
});
