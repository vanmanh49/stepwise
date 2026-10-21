import { describe, expect, it } from 'vitest';
import { deepFreeze, int, pick, rng } from '../data-structures/random.testutil';
import { allLessons } from '../lessons/all.testutil';
import type { FormField } from '../types/lesson';
import type { ServicesView } from '../types/visualization';
import { MAX_STEPS } from './model';

const GARBAGE = ['', 'abc', '-3', '1e9'];

function valueFor(field: FormField, r: () => number): string {
  const options = field.type === 'choice' ? (field.options ?? []) : [String(int(r, -5, 300))];
  return pick(r, [field.sample, ...options]);
}

const lessons = allLessons.filter((l) => l.category === 'microservices').map((l) => [l.id, l] as const);

describe.each(lessons)('microservices lesson %s', (_id, lesson) => {
  const config = lesson.visualization;
  if (config.kind !== 'form') throw new Error(`${lesson.id} must use the form visualization`);
  const lines = lesson.code.split('\n').length;

  it('labels its code as pseudocode', () => {
    expect(config.codeLabel).toBe('Pseudocode');
  });

  it.each([1, 2, 3])('keeps the scenario contract over random settings (seed %i)', (seed) => {
    const r = rng(seed);
    for (let run = 0; run < 20; run++) {
      const values: Record<string, string> = {};
      for (const field of config.fields) values[field.name] = valueFor(field, r);
      if (run % 5 === 4) values[pick(r, config.fields).name] = pick(r, GARBAGE);
      const label = JSON.stringify(values);

      const steps = config.generate(deepFreeze({ ...values }));
      expect(steps.length, label).toBeGreaterThanOrEqual(1);
      expect(steps.length, label).toBeLessThanOrEqual(MAX_STEPS + 1);
      for (const step of steps) {
        expect(step.codeLine, label).toBeGreaterThanOrEqual(1);
        expect(step.codeLine, label).toBeLessThanOrEqual(lines);
        const view = step.view as ServicesView;
        expect(view.kind, label).toBe('services');
        const ids = new Set(view.nodes.map((n) => n.id));
        for (const end of [...view.links, ...view.messages].flatMap((e) => [e.from, e.to])) expect(ids.has(end), `${label} ${end}`).toBe(true);
      }
      const last = steps.at(-1)!.view as ServicesView;
      expect(last.requests.every((q) => q.status !== 'pending'), label).toBe(true);
      expect(config.generate({ ...values }), label).toEqual(steps);
    }
  });
});
