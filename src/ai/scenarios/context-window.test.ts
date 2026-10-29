import { describe, expect, it } from 'vitest';
import type { ArrayView, DistributionView } from '../../types/visualization';
import { contextWindowSteps } from './context-window';

const long = 'the fish saw the bird sat on the';
const predicted = (values: Record<string, string>) => {
  const last = contextWindowSteps(values).at(-1)!;
  return (last.view as DistributionView).bars.find((b) => b.role === 'found')!.label;
};

describe('context window lesson', () => {
  it('predicts mat when the whole sentence fits', () => {
    expect(predicted({ text: 'the cat sat on the', window: '5', strategy: 'oldest' })).toBe('mat');
  });

  it('loses the subject in a window of 3', () => {
    expect(predicted({ text: 'the cat sat on the', window: '3', strategy: 'oldest' })).toBe('the');
  });

  it('follows the bird once the fish falls out of the window', () => {
    expect(predicted({ text: long, window: '5', strategy: 'oldest' })).toBe('tree');
  });

  it('keeps the fish when the first words are kept', () => {
    expect(predicted({ text: long, window: '5', strategy: 'first' })).toBe('pond');
  });

  it('drops nothing when the text fits, whatever the strategy', () => {
    const oldest = contextWindowSteps({ text: 'the cat sat', window: '5', strategy: 'oldest' });
    const first = contextWindowSteps({ text: 'the cat sat', window: '5', strategy: 'first' });
    expect(first).toEqual(oldest);
    const cells = oldest.flatMap((s) => (s.view.kind === 'array' ? (s.view as ArrayView).cells : []));
    expect(cells.some((c) => c.role === 'discarded')).toBe(false);
    expect(oldest.some((s) => s.title.includes('fits'))).toBe(true);
  });

  it('refuses text longer than 20 words with one step', () => {
    expect(contextWindowSteps({ text: Array(21).fill('the').join(' '), window: '5', strategy: 'oldest' })).toHaveLength(1);
  });
});
