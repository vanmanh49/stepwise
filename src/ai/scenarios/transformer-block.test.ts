import { describe, expect, it } from 'vitest';
import type { DistributionView, GridView } from '../../types/visualization';
import { tokenId, VOCAB } from '../corpus';
import { forward } from '../model';
import { argmax } from '../tensor';
import { transformerBlockSteps } from './transformer-block';

const ids = (p: string) => p.split(' ').map((w) => tokenId(w)!);

describe('transformer block lesson', () => {
  const steps = transformerBlockSteps({ prompt: 'the cat sat on the' });

  it('has one step per stage', () => {
    expect(steps).toHaveLength(8);
  });

  it('adds the attention output back onto the input in the first residual step', () => {
    const view = steps.find((s) => s.title.startsWith('Add the attention output'))!.view as GridView;
    for (const row of view.rows) {
      const [x, a, sum] = row.cells.map((c) => Number(c!.value));
      expect(Math.abs(x! + a! - sum!)).toBeLessThanOrEqual(0.011);
    }
  });

  it("ends with the model's own prediction", () => {
    const view = steps.at(-1)!.view as DistributionView;
    const expected = VOCAB[argmax(forward(ids('the cat sat on the')).probs.at(-1)!)];
    expect(view.bars.find((b) => b.role === 'found')!.label).toBe(expected);
    expect(expected).toBe('mat');
  });
});
