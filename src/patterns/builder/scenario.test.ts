import { describe, expect, it } from 'vitest';
import type { GridView, PanelsView } from '../../types/visualization';
import { changeCost } from '../diff';
import { patternSteps } from '../steps';
import { traceRun } from '../trace';
import { builderLesson as lesson } from './scenario';

const run = (pattern: boolean, changed: boolean, page: string) => {
  const d = lesson.designs[pattern ? (changed ? 'patternChanged' : 'pattern') : changed ? 'naiveChanged' : 'naive'];
  return traceRun(d.classes, (t) => lesson.run({ pattern, changed }, page, t));
};

describe('Builder', () => {
  it('builds the same requests both ways before the change', () => {
    for (const page of ['Profile', 'Upload', 'Search']) {
      const naive = run(false, false, page).result!;
      const pattern = run(true, false, page).result!;
      expect(naive.ok, page).toBe(true);
      expect(pattern.facts, page).toEqual(naive.facts);
    }
    expect(run(true, false, 'Upload').result!.facts[0]).toEqual(['Request', 'POST /photos (timeout 30000 ms)']);
  });

  it('naive change: Search swaps two numbers, so it waits 2 ms and retries 5000 times', () => {
    const result = run(false, true, 'Search').result!;
    expect(result.ok).toBe(false);
    expect(result.facts).toEqual([
      ['Request', 'GET /search?q=shoes (timeout 2 ms, 5000 retries)'],
      ['Timeout', '2 ms, wanted 5000 ms'],
      ['Retries', '5000, wanted 2'],
    ]);
  });

  it('pattern change: every page gets the settings it named', () => {
    for (const page of ['Profile', 'Upload', 'Search']) expect(run(true, true, page).result!.ok, page).toBe(true);
    expect(run(true, true, 'Search').result!.facts[2]).toEqual(['Retries', '2']);
  });

  it('makes the Request inside build', () => {
    const trace = run(true, false, 'Upload');
    const request = trace.objects.find((o) => o.id === 'Request#1')!;
    expect(trace.calls[(request.origin as { by: number }).by]).toMatchObject({ callee: 'RequestBuilder#1', method: 'build' });
    expect(trace.calls.map((c) => c.method)).toEqual(['save', 'post', 'timeout', 'build', 'send']);
  });

  it('costs the pattern more edits, not fewer', () => {
    const naive = changeCost(lesson.designs.naive.source, lesson.designs.naiveChanged.source);
    const pattern = changeCost(lesson.designs.pattern.source, lesson.designs.patternChanged.source);
    expect(naive.classesAdded).toEqual([]);
    expect(naive.classesEdited).toEqual(['Request', 'UploadPage', 'SearchPage']);
    expect([naive.linesAdded, naive.linesRemoved]).toEqual([4, 3]);
    expect(pattern.classesAdded).toEqual([]);
    expect(pattern.classesEdited).toEqual(['Request', 'RequestBuilder', 'UploadPage', 'SearchPage']);
    expect([pattern.linesAdded, pattern.linesRemoved]).toEqual([10, 4]);
  });

  it('shows the learner the swapped timeout as a wrong result', () => {
    const last = patternSteps(lesson, { design: 'Naive', change: lesson.change, page: 'Search' }).at(-3)!;
    const grid = (last.view as PanelsView).panels.find((p) => p.label === 'Result')!.view as GridView;
    expect(grid.rows[1]!.cells[0]).toMatchObject({ value: '2 ms, wanted 5000 ms', role: 'discarded' });
  });
});
