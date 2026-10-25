import { describe, expect, it } from 'vitest';
import type { ArrayView, PanelsView } from '../../types/visualization';
import { tokenizationSteps } from './tokenization';

const tokens = (view: PanelsView) => (view.panels[0]!.view as ArrayView).cells.map((c) => c.value);

describe('tokenization lesson', () => {
  it('ends with fewer tokens than characters', () => {
    const steps = tokenizationSteps({ text: 'the cat sat', merges: '20' });
    expect(tokens(steps[0]!.view as PanelsView)).toHaveLength(11);
    expect(tokens(steps.at(-1)!.view as PanelsView).length).toBeLessThan(11);
    expect(steps[1]!.title).toMatch(/^Merge /);
  });

  it('keeps letters the corpus never merged as single tokens', () => {
    const last = tokenizationSteps({ text: 'zebra', merges: '30' }).at(-1)!;
    expect(tokens(last.view as PanelsView)).toContain('z');
  });

  it('runs no merges with 0 merges: characters, then the summary', () => {
    expect(tokenizationSteps({ text: 'the cat', merges: '0' })).toHaveLength(2);
  });

  it('refuses text containing ▁, which stands for a space', () => {
    const steps = tokenizationSteps({ text: 'a▁b', merges: '5' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toContain('▁');
  });
});
