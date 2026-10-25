import { describe, expect, it } from 'vitest';
import type { DistributionView } from '../../types/visualization';
import { tokenId, VOCAB } from '../corpus';
import { forward } from '../model';
import { argmax } from '../tensor';
import { samplingSteps } from './sampling';

const base = { prompt: 'the cat sat on the', temperature: '1', topK: '34', topP: '1', seed: '1' };
const drawn = (values: Record<string, string>) => (samplingSteps(values).at(-1)!.view as DistributionView).bars.find((b) => b.role === 'found')!.label;
const top = (values: Record<string, string>) => Math.max(...(samplingSteps(values)[1]!.view as DistributionView).bars.map((b) => b.value));

describe('sampling lesson', () => {
  it('always draws the most likely word with top-k 1', () => {
    const best = VOCAB[argmax(forward('the cat sat on the'.split(' ').map((w) => tokenId(w)!)).probs.at(-1)!)];
    for (let seed = 1; seed <= 20; seed++) expect(drawn({ ...base, topK: '1', temperature: '2', seed: String(seed) })).toBe(best);
  });

  it('flattens the distribution when hot and sharpens it when cold', () => {
    expect(top({ ...base, temperature: '2' })).toBeLessThan(top({ ...base, temperature: '0.1' }));
  });

  it('cuts nothing with no limits', () => {
    for (const step of samplingSteps(base)) expect((step.view as DistributionView).cutoff).toBeUndefined();
  });

  it('marks the cut with top-k 3', () => {
    expect(samplingSteps({ ...base, topK: '3' }).some((s) => (s.view as DistributionView).cutoff === 3)).toBe(true);
  });

  it('draws the same word for the same seed', () => {
    const hot = { ...base, temperature: '2', seed: '42' };
    expect(drawn(hot)).toBe(drawn(hot));
  });
});
