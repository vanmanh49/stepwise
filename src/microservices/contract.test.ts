import { describe, expect, it } from 'vitest';
import { deepFreeze, int, pick, rng } from '../data-structures/random.testutil';
import { allLessons } from '../lessons/all.testutil';
import type { FormField } from '../types/lesson';
import type { ServicesView } from '../types/visualization';
import { MAX_STEPS } from './model';

const GARBAGE = ['', 'abc', '-3', '1e9'];

function valueFor(field: FormField, r: () => number, range?: [number, number]): string {
  if (field.type === 'choice') return pick(r, [field.sample, ...(field.options ?? [])]);
  if (!range) return pick(r, [field.sample, String(int(r, -5, 300))]);
  const [lo, hi] = range;
  return pick(r, [String(lo), String(hi), String(int(r, lo, hi)), String(int(r, lo, hi)), String(int(r, lo, hi))]);
}

/** The valid range of each number field, so random runs exercise real settings and their extremes. */
const RANGES: Record<string, Record<string, [number, number]>> = {
  'monolith-vs-microservices': { requests: [1, 8] },
  'service-boundaries': { requests: [1, 6] },
  'synchronous-calls': { depth: [1, 4], hop: [1, 50] },
  'service-discovery': { instances: [1, 4], heartbeat: [10, 100], ttl: [20, 300], dies: [0, 140] },
  'load-balancing': { instances: [2, 4] },
  bulkhead: { requests: [2, 12] },
  'rate-limiting': { limit: [1, 10] },
  'message-queues': { workers: [1, 3], jobs: [1, 10] },
  'pub-sub': { subscribers: [1, 3], orders: [1, 5] },
  idempotency: { payments: [1, 5] },
  'circuit-breaker': { threshold: [1, 5], openMs: [50, 500], recovers: [100, 2000], requests: [4, 16] },
  'retries-backoff': { retries: [0, 4], outage: [0, 500], requests: [1, 8] },
  timeouts: { inventory: [10, 1000], apiTimeout: [0, 2000], clientTimeout: [0, 2000], requests: [1, 4] },
  saga: { orders: [1, 4] },
  'transactional-outbox': { orders: [1, 5] },
  cqrs: { readDelay: [0, 140], projector: [10, 300] },
};

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
    const ranges = RANGES[lesson.id] ?? {};
    let varied = 0;
    for (let run = 0; run < 20; run++) {
      const values: Record<string, string> = {};
      for (const field of config.fields) values[field.name] = valueFor(field, r, ranges[field.name]);
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
      if (steps.length > 1 && config.fields.some((f) => f.type !== 'choice' && values[f.name] !== f.sample)) varied++;
    }
    // Most runs must simulate settings other than the samples, or the contract says little.
    expect(varied).toBeGreaterThanOrEqual(config.fields.some((f) => f.type !== 'choice') ? 8 : 0);
  });

  it('keeps the contract at the largest and smallest settings', () => {
    const ranges = RANGES[lesson.id] ?? {};
    for (const end of [0, 1] as const) {
      const values: Record<string, string> = {};
      for (const field of config.fields) values[field.name] = field.type === 'choice' ? field.sample : String(ranges[field.name]?.[end] ?? field.sample);
      for (const choices of config.presets.map((p) => p.values)) {
        const merged = { ...choices, ...Object.fromEntries(Object.entries(values).filter(([name]) => ranges[name])) };
        const steps = config.generate(merged);
        const last = steps.at(-1)!.view as ServicesView;
        expect(steps.length, JSON.stringify(merged)).toBeGreaterThan(1);
        expect(steps.length, JSON.stringify(merged)).toBeLessThanOrEqual(MAX_STEPS + 1);
        expect(last.requests.every((q) => q.status !== 'pending'), JSON.stringify(merged)).toBe(true);
      }
    }
  });
});
