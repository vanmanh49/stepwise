import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView } from '../../types/visualization';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { abstractFactoryLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, theme: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, theme, t));
};

describe('Abstract Factory', () => {
  it('naive Dark: the About screen pairs a dark button with a light dialog', () => {
    const result = run(false, false, 'Dark').result!;
    expect(result.ok).toBe(false);
    expect(result.facts).toEqual([
      ['Settings', 'dark button + dark dialog'],
      ['About', 'dark button + light dialog'],
    ]);
  });

  it('naive Light looks right, because the forgotten dialog is light anyway', () => {
    expect(run(false, false, 'Light').result!.ok).toBe(true);
  });

  it('the pattern keeps every theme whole', () => {
    for (const [changed, theme] of [[false, 'Light'], [false, 'Dark'], [true, 'High contrast']] as const) {
      const result = run(true, changed, theme).result!;
      expect(result.ok, theme).toBe(true);
    }
    expect(run(true, true, 'High contrast').result!.facts[1]).toEqual(['About', 'high-contrast button + high-contrast dialog']);
  });

  it('naive High contrast mixes again on the About screen', () => {
    expect(run(false, true, 'High contrast').result!.facts[1]).toEqual(['About', 'high-contrast button + light dialog']);
  });

  it('makes each widget inside a factory method', () => {
    const trace = run(true, false, 'Dark');
    const dialog = trace.objects.find((o) => o.id === 'DarkDialog#1')!;
    expect(trace.calls[(dialog.origin as { by: number }).by]).toMatchObject({ callee: 'DarkFactory#1', method: 'createDialog' });
  });

  it('costs the naive design both screens, and the pattern none', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['ContrastButton', 'ContrastDialog']);
    expect(naive.classesEdited).toEqual(['SettingsScreen', 'AboutScreen']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([11, 0]);
    expect(pattern.classesAdded).toEqual(['ContrastButton', 'ContrastDialog', 'ContrastFactory']);
    expect(pattern.classesEdited).toEqual([]);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([10, 0]);
  });

  it('shows the learner the mixed screen as a wrong result', () => {
    const last = patternSteps(lesson, { design: 'Naive', change: 'None', theme: 'Dark' }).at(-1)!;
    const grid = (last.view as PanelsView).panels.find((p) => p.label === 'Result')!.view as GridView;
    expect(grid.rows[1]!.cells[0]).toMatchObject({ value: 'dark button + light dialog', role: 'discarded' });
  });
});
