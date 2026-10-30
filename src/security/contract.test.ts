import { describe, expect, it } from 'vitest';
import { deepFreeze, int, pick, rng } from '../data-structures/random.testutil';
import { allLessons } from '../lessons/all.testutil';
import type { FormField } from '../types/lesson';
import type { Step, View } from '../types/visualization';
import { MAX_STEPS } from './steps';

const GARBAGE = ['', 'abc', '-3', '1e9'];

function valueFor(field: FormField, r: () => number, range?: [number, number]): string {
  if (field.type === 'choice') return pick(r, [field.sample, ...(field.options ?? [])]);
  if (!range) return pick(r, [field.sample, String(int(r, -5, 30))]);
  const [lo, hi] = range;
  return pick(r, [String(lo), String(hi), String(int(r, lo, hi)), String(int(r, lo, hi)), String(int(r, lo, hi))]);
}

/** The valid range of each number field, so random runs exercise real settings and their extremes. */
const RANGES: Record<string, Record<string, [number, number]>> = {
  'key-exchange': { a: [2, 21], b: [2, 21] },
  'public-key-signatures': { p: [11, 997], q: [13, 991], number: [0, 142] },
};

function checkView(view: View, label: string) {
  if (view.kind === 'panels') return view.panels.forEach((p) => checkView(p.view, label));
  if (view.kind === 'grid') {
    const cells = view.rows.flatMap((r) => r.cells).filter((c) => c !== null);
    expect(new Set(cells.map((c) => c.id)).size, label).toBe(cells.length);
    for (const cell of cells) {
      if (cell.heat !== undefined) expect(cell.heat >= 0 && cell.heat <= 1, label).toBe(true);
    }
  }
  if (view.kind === 'services') {
    const nodes = new Set(view.nodes.map((n) => n.id));
    const linked = (from: string, to: string) => view.links.some((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
    for (const message of view.messages) {
      expect(nodes.has(message.from) && nodes.has(message.to), label).toBe(true);
      expect(linked(message.from, message.to), label).toBe(true);
    }
    expect(new Set(view.messages.map((m) => m.id)).size, label).toBe(view.messages.length);
  }
}

function checkSteps(steps: Step[], lines: number, label: string) {
  expect(steps.length, label).toBeGreaterThanOrEqual(1);
  expect(steps.length, label).toBeLessThanOrEqual(MAX_STEPS);
  for (const step of steps) {
    expect(step.codeLine, label).toBeGreaterThanOrEqual(1);
    expect(step.codeLine, label).toBeLessThanOrEqual(lines);
    checkView(step.view, label);
  }
}

const lessons = allLessons.filter((l) => l.category === 'security').map((l) => [l.id, l] as const);

describe.each(lessons)('security lesson %s', (_id, lesson) => {
  const config = lesson.visualization;
  if (config.kind !== 'form') throw new Error(`${lesson.id} must use the form visualization`);
  const lines = lesson.code.split('\n').length;

  it('labels its code as pseudocode', () => {
    expect(config.codeLabel).toBe('Pseudocode');
  });

  it('says what production systems use instead', () => {
    expect(lesson.concept.at(-1)).toContain('production');
  });

  it.each([1, 2, 3])('keeps the contract over random settings (seed %i)', (seed) => {
    const r = rng(seed);
    const ranges = RANGES[lesson.id] ?? {};
    for (let run = 0; run < 20; run++) {
      const values: Record<string, string> = {};
      for (const field of config.fields) values[field.name] = valueFor(field, r, ranges[field.name]);
      const garbage = run % 5 === 4 ? pick(r, config.fields) : undefined;
      if (garbage) values[garbage.name] = pick(r, GARBAGE);
      const label = JSON.stringify(values);
      const steps = config.generate(deepFreeze({ ...values }));
      checkSteps(steps, lines, label);
      if (garbage && garbage.type !== 'text') expect(steps, label).toHaveLength(1);
      expect(config.generate({ ...values }), label).toEqual(steps);
    }
  });

  it('runs every preset at the largest and smallest settings', () => {
    const ranges = RANGES[lesson.id] ?? {};
    for (const end of [0, 1] as const) {
      for (const preset of config.presets) {
        const values = { ...preset.values, ...Object.fromEntries(Object.entries(ranges).map(([name, range]) => [name, String(range[end])])) };
        const steps = config.generate(values);
        checkSteps(steps, lines, JSON.stringify(values));
        expect(steps.length, JSON.stringify(values)).toBeGreaterThan(1);
      }
    }
  });
});
