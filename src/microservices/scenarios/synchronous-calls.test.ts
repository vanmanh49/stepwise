import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { synchronousCallsScenario, synchronousCallsSteps } from './synchronous-calls';

const only = (values: Record<string, string>) => {
  const read = synchronousCallsScenario(values);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests[0]!;
};

describe('Synchronous Calls', () => {
  it('adds every hop and every service along a chain of 3', () => {
    // Three hops there and back at 10 ms, plus 5 ms of work in each service.
    expect(only({ depth: '3', hop: '10', slow: 'none', style: 'sequential' })).toMatchObject({ status: 'ok', ms: 2 * 10 * 3 + 5 * 3 });
  });

  it('passes one slow service on to every caller upstream', () => {
    expect(only({ depth: '3', hop: '10', slow: 'last', style: 'sequential' }).ms).toBe(60 + 5 + 5 + 200);
  });

  it('waits only for the slowest branch of a parallel fan-out', () => {
    const fanOut = only({ depth: '3', hop: '10', slow: 'last', style: 'parallel' });
    expect(fanOut.ms).toBe(10 + 5 + (10 + 200 + 10) + 10);
    // The same three branches called one after another would take 10 + 5 + (25 + 25 + 220) + 10 = 295 ms.
    expect(fanOut.ms).toBeLessThan(295);
  });

  it('refuses a hop latency of 0', () => {
    const steps = synchronousCallsSteps({ depth: '3', hop: '0', slow: 'none', style: 'sequential' });
    expect(steps).toHaveLength(1);
    expect(steps[0]!.why).toBe('Hop latency must be a whole number from 1 to 50.');
  });
});
