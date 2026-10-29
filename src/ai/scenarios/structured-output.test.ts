import { describe, expect, it } from 'vitest';
import type { GridView, View } from '../../types/visualization';
import { structuredOutputSteps } from './structured-output';

const grids = (view: View): GridView[] => (view.kind === 'panels' ? view.panels.flatMap((p) => grids(p.view)) : view.kind === 'grid' ? [view] : []);
const jsonRow = (view: View, key: string) => grids(view).flatMap((g) => g.rows).find((r) => r.label === key);

describe('structured output lesson', () => {
  it('fills the food schema when constrained', () => {
    const last = structuredOutputSteps({ schema: 'food', constrained: 'on' }).at(-1)!;
    expect(last.title).toContain('{"animal": "dog", "food": "bone"}');
    expect(last.title).toContain('matches');
  });

  it('breaks the food schema without constraints', () => {
    const last = structuredOutputSteps({ schema: 'food', constrained: 'off' }).at(-1)!;
    expect(last.title).toContain('does not match');
    const food = jsonRow(last.view, 'food')!;
    expect(food.cells[0]).toMatchObject({ value: 'the', role: 'discarded' });
  });

  it('cuts the disallowed words in each constrained step', () => {
    const steps = structuredOutputSteps({ schema: 'place', constrained: 'on' });
    const bars = steps.flatMap((s) => (s.view.kind === 'panels' ? s.view.panels.map((p) => p.view) : [])).filter((v) => v.kind === 'distribution');
    expect(bars).toHaveLength(5);
    for (const d of bars) if (d.kind === 'distribution') expect(d.cutoff).toBeDefined();
  });

  it('refuses an unknown schema with one step', () => {
    expect(structuredOutputSteps({ schema: 'recipe', constrained: 'on' })).toHaveLength(1);
  });
});
