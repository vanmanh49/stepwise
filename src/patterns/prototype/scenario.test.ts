import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView } from '../../types/visualization';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { prototypeLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, copy: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, copy, t));
};

describe('Prototype', () => {
  it('a deep copy works in both designs before the change', () => {
    for (const pattern of [false, true]) {
      const result = run(pattern, false, 'Deep').result!;
      expect(result.ok).toBe(true);
      expect(result.facts).toEqual([
        ['Copy', 'orc, hp 30, speed 2'],
        ['Copy loot', 'axe, gem'],
        ['Template loot', 'axe'],
      ]);
    }
  });

  it('a shallow copy shares one loot array, so the template gets the gem too', () => {
    for (const pattern of [false, true]) {
      const result = run(pattern, false, 'Shallow').result!;
      expect(result.ok).toBe(false);
      expect(result.facts[2]).toEqual(['Template loot', 'axe, gem']);
    }
  });

  it('naive change: the copy loses its shield', () => {
    const result = run(false, true, 'Deep').result!;
    expect(result.ok).toBe(false);
    expect(result.facts[0]).toEqual(['Copy', 'orc, hp 30, speed 2, shield 0 (template has 50)']);
  });

  it('pattern change: clone copies the new field without being edited', () => {
    const result = run(true, true, 'Deep').result!;
    expect(result.ok).toBe(true);
    expect(result.facts[0]).toEqual(['Copy', 'orc, hp 30, speed 2, shield 50']);
  });

  it('makes the copy inside clone', () => {
    const trace = run(true, false, 'Deep');
    const copy = trace.objects.find((o) => o.id === 'Enemy#2')!;
    expect(trace.calls[(copy.origin as { by: number }).by]).toMatchObject({ callee: 'Enemy#1', method: 'clone' });
  });

  it('edits only Enemy in both designs, though only the pattern stays right', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    for (const cost of [naive, pattern]) {
      expect(cost.classesAdded).toEqual([]);
      expect(cost.classesEdited).toEqual(['Enemy']);
      expect([cost.linesAdded, cost.linesRemoved]).toEqual([1, 0]);
    }
  });

  it('shows the learner the lost shield as a wrong result', () => {
    const last = patternSteps(lesson, { design: 'Naive', change: lesson.change, copy: 'Deep' }).at(-3)!;
    const grid = (last.view as PanelsView).panels.find((p) => p.label === 'Result')!.view as GridView;
    expect(grid.rows[0]!.cells[0]).toMatchObject({ value: 'orc, hp 30, speed 2, shield 0 (template has 50)', role: 'discarded' });
  });
});
