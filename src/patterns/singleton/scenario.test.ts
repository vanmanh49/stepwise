import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView, Step } from '../../types/visualization';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { singletonLesson as lesson } from './scenario';

const values = (design: string, change: string, modules: string) => ({ design, change: change === 'yes' ? lesson.change : 'None', modules });
const steps = (design: string, change: string, modules = '3 modules') => patternSteps(lesson, values(design, change, modules));
const fact = (step: Step, label: string) => {
  const grid = (step.view as PanelsView).panels.find((p) => p.label === 'Result')!.view as GridView;
  return grid.rows.find((r) => r.label === label)!.cells[0]!;
};
const run = (pattern: boolean, changed: boolean, modules = '3 modules') => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, modules, t));
};

describe('Singleton', () => {
  it('naive: each module makes its own Logger, so the log is split', () => {
    const trace = run(false, false);
    expect(trace.result!.ok).toBe(false);
    expect(trace.result!.facts).toEqual([
      ['Logger objects', '3'],
      ['Lines in each log', '1 + 1 + 1'],
      ['Debug lines', '0'],
    ]);
  });

  it('pattern: getInstance makes one Logger and every module shares it', () => {
    const trace = run(true, false);
    expect(trace.result!.ok).toBe(true);
    expect(trace.result!.facts[0]).toEqual(['Logger objects', '1']);
    expect(trace.result!.facts[1]).toEqual(['Lines in each log', '3']);
    const logger = trace.objects.find((o) => o.className === 'Logger')!;
    expect(logger.origin.kind).toBe('made');
    expect(trace.calls[(logger.origin as { by: number }).by]!.method).toBe('getInstance');
    expect(trace.objects.filter((o) => o.className === 'Logger')).toHaveLength(1);
  });

  it('runs 2 modules when asked', () => {
    expect(run(true, false, '2 modules').result!.facts[1]).toEqual(['Lines in each log', '2']);
    expect(run(false, false, '2 modules').result!.facts[0]).toEqual(['Logger objects', '2']);
  });

  it('with the change, debug lines appear in both designs, but only the pattern keeps one log', () => {
    expect(run(false, true).result!.facts).toEqual([
      ['Logger objects', '3'],
      ['Lines in each log', '2 + 2 + 2'],
      ['Debug lines', '3'],
    ]);
    expect(run(true, true).result!.facts).toEqual([
      ['Logger objects', '1'],
      ['Lines in each log', '6'],
      ['Debug lines', '3'],
    ]);
  });

  it('costs the naive design an edit in every module', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual(['DebugSwitch']);
    expect(naive.classesEdited).toEqual(['BillingModule', 'CartModule', 'SearchModule']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([14, 0]);
    expect(pattern.classesAdded).toEqual(['DebugSwitch']);
    expect(pattern.classesEdited).toEqual([]);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([5, 0]);
  });

  it('shows the learner the shared Logger and the split one in the result', () => {
    expect(fact(steps('Pattern', 'no').at(-1)!, 'Logger objects')).toMatchObject({ value: '1', role: 'found' });
    expect(fact(steps('Naive', 'no').at(-1)!, 'Logger objects')).toMatchObject({ value: '3', role: 'discarded' });
    const cost = steps('Naive', 'yes').at(-2)!.view as GridView;
    expect(cost.rows[1]!.cells.map((c) => c!.value)).toEqual([3, 0]);
  });

  it('starts every run from no instance, so runs repeat exactly', () => {
    expect(steps('Pattern', 'no')).toEqual(steps('Pattern', 'no'));
    expect(steps('Pattern', 'no')[0]!.title).toBe('client calls Logger.getInstance()');
  });
});
