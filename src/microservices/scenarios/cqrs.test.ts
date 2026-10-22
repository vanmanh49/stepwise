import { describe, expect, it } from 'vitest';
import { simulate } from '../sim';
import { cqrsScenario, cqrsSteps } from './cqrs';

const values = (model: string, readDelay = '0', projector = '30') => ({ model, readDelay, projector });
const reads = (v: Record<string, string>) => {
  const read = cqrsScenario(v);
  if (!read.ok) throw new Error(read.why);
  return simulate(read.value).requests.filter((r) => r.label.startsWith('GET'));
};
const stale = (v: Record<string, string>) => cqrsSteps(v).at(-1)!.variables!['stale reads'];

describe('CQRS', () => {
  it('reads the latest status from the single model, through three calls', () => {
    const v = values('single');
    expect(reads(v).map((r) => r.value)).toEqual(['placed', 'paid', 'shipped']);
    expect(stale(v)).toBe(0);
    expect(reads(v)[0]!.crossServiceCalls).toBe(2);
  });

  it('reads faster but stale right after each write with CQRS', () => {
    const v = values('cqrs');
    const got = reads(v);
    expect(got[0]!.value).toBeUndefined();
    expect(got.map((r) => r.value)).toEqual([undefined, 'placed', 'paid']);
    expect(stale(v)).toBe(3);
    expect(got[0]!.ms).toBeLessThan(reads(values('single'))[0]!.ms);
  });

  it('reads fresh data 80 ms later', () => {
    const v = values('cqrs', '80');
    expect(reads(v).map((r) => r.value)).toEqual(['placed', 'paid', 'shipped']);
    expect(stale(v)).toBe(0);
  });

  it('stays stale with a slow projector', () => {
    expect(stale(values('cqrs', '80', '200'))).toBeGreaterThanOrEqual(2);
  });

  it('refuses a read delay of 150 ms', () => {
    expect(cqrsSteps(values('cqrs', '150'))[0]!.why).toBe('Read delay must be a whole number from 0 to 140.');
  });
});
