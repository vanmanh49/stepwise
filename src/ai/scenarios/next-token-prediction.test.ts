import { describe, expect, it } from 'vitest';
import type { ArrayView, DistributionView } from '../../types/visualization';
import { nextTokenPredictionSteps } from './next-token-prediction';

const chosen = (view: DistributionView) => view.bars.find((b) => b.role === 'found')!.label;

describe('next-token prediction lesson', () => {
  it('appends mat after "the cat sat on the"', () => {
    const steps = nextTokenPredictionSteps({ prompt: 'the cat sat on the', count: '2' });
    const first = steps.find((s) => s.view.kind === 'distribution')!;
    expect(chosen(first.view as DistributionView)).toBe('mat');
    expect(first.title).toContain('mat');
  });

  it('stops once the text is longer than the context, without throwing', () => {
    const steps = nextTokenPredictionSteps({ prompt: 'the dog chased the cat in', count: '8' });
    const stops = steps.filter((s) => s.title.startsWith('Stop'));
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(steps.at(-1));
    expect(stops[0]!.title).toContain('6');
  });

  it('stops when the model predicts the end of the sentence', () => {
    const steps = nextTokenPredictionSteps({ prompt: 'the cat sat on the', count: '8' });
    const last = steps.at(-1)!;
    expect(last.title).toContain('<end>');
    expect((last.view as ArrayView).cells.at(-1)!.value).toBe('<end>');
  });
});
