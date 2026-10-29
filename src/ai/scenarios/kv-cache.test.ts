import { describe, expect, it } from 'vitest';
import type { ArrayView, Step, View } from '../../types/visualization';
import { kvCacheSteps } from './kv-cache';

const run = (cache: string, prompt = 'the cat', count = '4') => kvCacheSteps({ prompt, count, cache });
const text = (steps: Step[]) => ((steps.at(-1)!.view as ArrayView).cells.map((c) => c.value)).join(' ');
const numbers = (view: View): string[] =>
  view.kind === 'panels' ? view.panels.flatMap((p) => numbers(p.view)) : view.kind === 'grid' ? view.rows.flatMap((r) => r.cells.map((c) => String(c?.value))) : [];

describe('kv cache lesson', () => {
  it('generates the same words with and without the cache', () => {
    expect(text(run('on'))).toBe('the cat sat on the mat');
    expect(text(run('off'))).toBe(text(run('on')));
  });

  it('computes 5 K/V rows with the cache and 15 without', () => {
    expect(run('on').at(-1)!.variables).toMatchObject({ 'with cache': 5, 'without cache': 15 });
    expect(run('off').at(-1)!.variables).toMatchObject({ 'with cache': 5, 'without cache': 15 });
  });

  it('stops cleanly when the prompt fills the context', () => {
    for (const cache of ['on', 'off']) {
      const steps = run(cache, 'the cat sat on the mat', '8');
      expect(steps.some((s) => s.title.startsWith('Stop'))).toBe(true);
      expect(steps.flatMap((s) => numbers(s.view)).some((v) => v === 'NaN')).toBe(false);
      expect(steps.at(-1)!.variables).toMatchObject({ 'with cache': 6 });
    }
  });

  it('refuses a prompt of 7 words with one step', () => {
    expect(run('on', 'the cat sat on the mat the')).toHaveLength(1);
  });

  it('stops when the context is full', () => {
    for (const cache of ['on', 'off']) {
      const steps = run(cache, 'flew to', '8');
      expect(steps.map((s) => s.title)).toContain('Stop: the context is full at 6 tokens');
      expect(steps.at(-1)!.variables).toMatchObject({ 'with cache': 6, 'without cache': 21 });
    }
  });

  it('says nothing was generated when the prompt already ends the sentence', () => {
    expect(run('on', 'the cat sat on the mat', '8').at(-1)!.title).not.toContain('Generated ""');
  });
});
