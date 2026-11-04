import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import content from '../../lessons/design-patterns/command';
import * as pattern from './pattern';
import { commandLesson as lesson } from './scenario';

const UNDO = 'Undo the last action';
const REPLAY = 'Replay the macro';

const run = (usePattern: boolean, changed: boolean, after: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, after, t));
};
const text = (usePattern: boolean, changed: boolean, after: string) => Object.fromEntries(run(usePattern, changed, after).result!.facts).Text;

describe('Command', () => {
  it('types and deletes the same text in every design', () => {
    for (const usePattern of [false, true]) for (const changed of [false, true]) expect(text(usePattern, changed, 'Nothing')).toBe('"Hi ther"');
  });

  it('undoes the delete with the pattern', () => {
    expect(text(true, false, UNDO)).toBe('"Hi there"');
    expect(text(true, true, UNDO)).toBe('"Hi there"');
  });

  it('refuses undo on the naive design', () => {
    expect(patternSteps(lesson, { design: 'Naive', change: 'None', after: UNDO })).toHaveLength(1);
  });

  it('replays the recorded actions after the change', () => {
    expect(text(false, true, REPLAY)).toBe('"Hi therHi ther"');
    expect(text(true, true, REPLAY)).toBe('"Hi therHi ther"');
    expect(patternSteps(lesson, { design: 'Pattern', change: 'None', after: REPLAY })).toHaveLength(1);
  });

  it('restores only what a delete removed', () => {
    const editor = new pattern.Editor();
    editor.insert('Hi');
    const cut = new pattern.DeleteCommand(editor, 5);
    cut.execute();
    expect(editor.text).toBe('');
    cut.undo();
    expect(editor.text).toBe('Hi');
  });

  it('runs every action through the history as a command object', () => {
    const trace = run(true, false, 'Nothing');
    expect(trace.calls.filter((c) => c.method === 'run').map((c) => c.args)).toEqual(['TypeCommand#1', 'TypeCommand#2', 'DeleteCommand#1']);
  });

  it('edits both triggers without the pattern, and nothing with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['Macro']);
    expect(naive.classesEdited).toEqual(['Toolbar', 'Shortcuts']);
    expect(naive.branchesAfter - naive.branchesBefore).toBe(2);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([16, 2]);
    expect(patterned.classesAdded).toEqual(['MacroCommand']);
    expect(patterned.classesEdited).toEqual([]);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([9, 0]);
    expect(content.concept.join(' ')).toContain(`${naive.linesAdded} lines added and ${naive.linesRemoved} removed`);
  });
});
