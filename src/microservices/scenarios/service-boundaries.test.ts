import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { serviceBoundariesScenario, serviceBoundariesSteps } from './service-boundaries';

const outcomes = (values: Record<string, string>) => {
  const read = serviceBoundariesScenario(values);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests;
};

describe('Service Boundaries', () => {
  it('makes four cross-service calls per checkout when split by layer', () => {
    const requests = outcomes({ split: 'by-layer', requests: '3' });
    expect(requests.map((r) => [r.status, r.crossServiceCalls])).toEqual([
      ['ok', 4],
      ['ok', 4],
      ['ok', 4],
    ]);
  });

  it('makes one cross-service call per checkout when split by capability', () => {
    const requests = outcomes({ split: 'by-capability', requests: '3' });
    expect(requests.map((r) => [r.status, r.crossServiceCalls])).toEqual([
      ['ok', 1],
      ['ok', 1],
      ['ok', 1],
    ]);
  });

  it('counts cross-service calls step by step', () => {
    const steps = serviceBoundariesSteps({ split: 'by-layer', requests: '1' });
    const counts = steps.map((s) => s.variables?.['cross-service calls']).filter((c) => c !== undefined);
    expect(counts.at(-1)).toBe(4);
    expect(counts).toEqual(counts.toSorted((a, b) => Number(a) - Number(b)));
  });

  it('refuses an unknown split', () => {
    const steps = serviceBoundariesSteps({ split: 'by-team', requests: '3' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toBe('Split must be one of: by-layer, by-capability.');
  });
});
