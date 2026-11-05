import { describe, expect, it } from 'vitest';
import { changeCost } from '../diff';
import { traceRun } from '../trace';
import { templateMethodLesson as lesson } from './scenario';

const run = (usePattern: boolean, changed: boolean, format: string) => {
  const d = lesson.designs[usePattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern: usePattern, changed }, format, t));
};
const output = (usePattern: boolean, changed: boolean, format: string) =>
  run(usePattern, changed, format)
    .result!.facts.filter(([label]) => label.startsWith('Line'))
    .map(([, value]) => value);

describe('Template Method', () => {
  it('exports the same text on both designs, every user before the change', () => {
    expect(output(false, false, 'CSV')).toEqual(['name,email', 'Al,al@ex.com', 'Bo,', 'Cy,cy@ex.com', 'Di,di@ex.com']);
    expect(output(false, false, 'JSON')).toEqual([
      '[',
      '  {"name":"Al","email":"al@ex.com"},',
      '  {"name":"Bo","email":""},',
      '  {"name":"Cy","email":"cy@ex.com"},',
      '  {"name":"Di","email":"di@ex.com"}',
      ']',
    ]);
    expect(output(false, false, 'Markdown')).toEqual(['| name | email |', '|---|---|', '| Al | al@ex.com |', '| Bo |  |', '| Cy | cy@ex.com |', '| Di | di@ex.com |']);
    for (const format of ['CSV', 'JSON', 'Markdown']) expect(output(true, false, format), format).toEqual(output(false, false, format));
  });

  it('skips the user with no email after the change, on both designs', () => {
    expect(output(false, true, 'CSV')).toEqual(['name,email', 'Al,al@ex.com', 'Cy,cy@ex.com', 'Di,di@ex.com']);
    expect(output(false, true, 'JSON').at(-2)).toBe('  {"name":"Di","email":"di@ex.com"}');
    for (const format of ['CSV', 'JSON', 'Markdown']) {
      expect(output(true, true, format), format).toEqual(output(false, true, format));
      expect(output(true, true, format).some((line) => line.includes('Bo')), format).toBe(false);
    }
  });

  it('runs the template defined in Export on the subclass, which fills in the steps', () => {
    const calls = run(true, false, 'CSV').calls;
    expect([calls[0]!.className, calls[0]!.callee, calls[0]!.method]).toEqual(['Export', 'CsvExport#1', 'run']);
    expect([calls[1]!.className, calls[1]!.caller, calls[1]!.callee, calls[1]!.method]).toEqual(['CsvExport', 'CsvExport#1', 'CsvExport#1', 'header']);
  });

  it('edits all three exports without the pattern, and only Export with it', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const patterned = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesEdited).toEqual(['CsvExport', 'JsonExport', 'MarkdownExport']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([3, 3]);
    expect(patterned.classesEdited).toEqual(['Export']);
    expect([patterned.linesAdded, patterned.linesRemoved]).toEqual([1, 1]);
  });
});
