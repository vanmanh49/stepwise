import { describe, expect, it } from 'vitest';
import { deepFreeze, pick, rng } from '../data-structures/random.testutil';
import { allLessons } from '../lessons/all.testutil';
import type { Step, View } from '../types/visualization';
import { MAX_STEPS, type PatternLesson } from './steps';
import { TRACED } from './trace';

const GARBAGE = ['', 'abc', '-3'];

function checkView(view: View, label: string) {
  if (view.kind === 'panels') return view.panels.forEach((p) => checkView(p.view, label));
  if (view.kind === 'grid') {
    const cells = view.rows.flatMap((r) => r.cells).filter((c) => c !== null);
    expect(new Set(cells.map((c) => c.id)).size, label).toBe(cells.length);
  }
  if (view.kind === 'services') expect(new Set(view.nodes.map((n) => n.id)).size, label).toBe(view.nodes.length);
  if (view.kind === 'ladder') {
    const columns = new Set(view.columns.map((c) => c.id));
    for (const row of view.rows) expect(columns.has(row.from) && columns.has(row.to), label).toBe(true);
  }
}

function checkSteps(steps: Step[], lines: number, label: string) {
  expect(steps.length, label).toBeGreaterThanOrEqual(1);
  expect(steps.length, label).toBeLessThanOrEqual(MAX_STEPS + 1);
  for (const step of steps) {
    if (step.codeLine !== undefined) {
      expect(step.codeLine, label).toBeGreaterThanOrEqual(1);
      expect(step.codeLine, label).toBeLessThanOrEqual(lines);
    }
    checkView(step.view, label);
  }
}

const lessons = allLessons.filter((l) => l.category === 'design-patterns').map((l) => [l.id, l] as const);

describe.each(lessons)('design patterns lesson %s', (_id, lesson) => {
  const config = lesson.visualization;
  if (config.kind !== 'form') throw new Error(`${lesson.id} must use the form visualization`);
  const lines = lesson.code.split('\n').length;

  it('names real code that uses the pattern', () => {
    expect(lesson.concept.at(-1)!.startsWith('In real code,')).toBe(true);
  });

  it('runs every preset', () => {
    for (const preset of config.presets) {
      const steps = config.generate(preset.values);
      checkSteps(steps, lines, preset.label);
      expect(steps.length, preset.label).toBeGreaterThan(1);
    }
  });

  it.each([1, 2, 3])('keeps the contract over random settings (seed %i)', (seed) => {
    const r = rng(seed);
    for (let run = 0; run < 10; run++) {
      const values: Record<string, string> = {};
      for (const field of config.fields) values[field.name] = pick(r, [field.sample, ...(field.options ?? [])]);
      const garbage = run % 5 === 4 ? pick(r, config.fields) : undefined;
      if (garbage) values[garbage.name] = pick(r, GARBAGE);
      const label = JSON.stringify(values);
      const steps = config.generate(deepFreeze({ ...values }));
      checkSteps(steps, lines, label);
      if (garbage) expect(steps, label).toHaveLength(1);
      expect(config.generate({ ...values }), label).toEqual(steps);
    }
  });
});

const scenarios = Object.entries(import.meta.glob<Record<string, PatternLesson>>('./*/scenario.ts', { eager: true }));

describe('design pattern scenarios', () => {
  it('has one scenario per lesson', () => {
    expect(scenarios.map(([path]) => path.split('/')[1]).toSorted()).toEqual(lessons.map(([id]) => id).toSorted());
  });

  it.each(scenarios)('%s shows the source of every class it runs', (_path, module) => {
    for (const lesson of Object.values(module).filter((v): v is PatternLesson => typeof v === 'object' && v !== null && 'designs' in v)) {
      for (const { source, classes } of Object.values(lesson.designs)) {
        for (const name of Object.keys(classes)) expect(source, name).toMatch(new RegExp(`\\bclass ${name}\\b`));
      }
    }
  });

  it.each(scenarios)('%s leaves no traced wrapper behind', (_path, module) => {
    const wrapped: string[] = [];
    for (const lesson of Object.values(module).filter((v): v is PatternLesson => typeof v === 'object' && v !== null && 'designs' in v)) {
      for (const { classes } of Object.values(lesson.designs)) {
        for (const [name, c] of Object.entries(classes) as [string, { prototype: object }][]) {
          for (const target of [c, c.prototype]) {
            for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(target))) {
              const fn = (d.value ?? d.get) as unknown;
              if (typeof fn === 'function' && TRACED in fn) wrapped.push(`${name}.${key}`);
            }
          }
        }
      }
    }
    expect(wrapped).toEqual([]);
  });
});
