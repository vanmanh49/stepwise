import { describe, expect, it } from 'vitest';
import { deepFreeze, int, pick, rng } from '../data-structures/random.testutil';
import { allLessons } from '../lessons/all.testutil';
import type { FormField } from '../types/lesson';
import type { ClusterView, Step } from '../types/visualization';
import { MAX_STEPS } from './model';

const GARBAGE = ['', 'abc', '-3', '1e9'];

function valueFor(field: FormField, r: () => number, range?: [number, number]): string {
  if (field.type === 'choice') return pick(r, [field.sample, ...(field.options ?? [])]);
  if (!range) return pick(r, [field.sample, String(int(r, -5, 30))]);
  const [lo, hi] = range;
  return pick(r, [String(lo), String(hi), String(int(r, lo, hi)), String(int(r, lo, hi)), String(int(r, lo, hi))]);
}

/** The valid range of each number field, so random runs exercise real settings and their extremes. */
const RANGES: Record<string, Record<string, [number, number]>> = {
  'cluster-architecture': { nodes: [1, 3], replicas: [1, 3] },
  'desired-state-controllers': { desired: [1, 5], deleted: [0, 3] },
  replicasets: { replicas: [1, 6], scaleTo: [0, 6] },
  'deployments-rolling-updates': { replicas: [2, 6] },
  'services-kube-proxy': { replicas: [1, 4] },
  scheduler: { cpu: [1, 4] },
};

function checkSteps(steps: Step[], lines: number, label: string) {
  expect(steps.length, label).toBeGreaterThanOrEqual(1);
  expect(steps.length, label).toBeLessThanOrEqual(MAX_STEPS + 1);
  for (const step of steps) {
    expect(step.codeLine, label).toBeGreaterThanOrEqual(1);
    expect(step.codeLine, label).toBeLessThanOrEqual(lines);
    const view = step.view as ClusterView;
    expect(view.kind, label).toBe('cluster');
    const pods = [...view.nodes.flatMap((n) => n.pods.map((p) => p.name)), ...view.pending.map((p) => p.name)];
    expect(new Set(pods).size, label).toBe(pods.length);
    const rows = view.objects.map((o) => `${o.kind}/${o.name}`);
    expect(new Set(rows).size, label).toBe(rows.length);
  }
  const last = steps.at(-1)!.view as ClusterView;
  expect((last.requests ?? []).every((q) => q.status !== 'pending'), label).toBe(true);
}

const lessons = allLessons.filter((l) => l.category === 'kubernetes').map((l) => [l.id, l] as const);

describe.each(lessons)('kubernetes lesson %s', (_id, lesson) => {
  const config = lesson.visualization;
  if (config.kind !== 'form') throw new Error(`${lesson.id} must use the form visualization`);
  const lines = lesson.code.split('\n').length;

  it('labels its code as pseudocode', () => {
    expect(config.codeLabel).toBe('Pseudocode');
  });

  it.each([1, 2, 3])('keeps the scenario contract over random settings (seed %i)', (seed) => {
    const r = rng(seed);
    const ranges = RANGES[lesson.id] ?? {};
    for (let run = 0; run < 20; run++) {
      const values: Record<string, string> = {};
      for (const field of config.fields) values[field.name] = valueFor(field, r, ranges[field.name]);
      if (run % 5 === 4) values[pick(r, config.fields).name] = pick(r, GARBAGE);
      const label = JSON.stringify(values);
      const steps = config.generate(deepFreeze({ ...values }));
      checkSteps(steps, lines, label);
      expect(config.generate({ ...values }), label).toEqual(steps);
    }
  });

  it('keeps the contract at the largest and smallest settings of every preset', () => {
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
